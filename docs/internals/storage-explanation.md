# Why mindmaps live in Zotero notes

The design behind `src/modules/mindmap/storage.ts`: what the storage medium buys, what it costs, and which of those costs are still unpaid. For the API itself see [storage-reference.md](storage-reference.md).

## A JSON document inside a note item

A mindmap is one JSON document, escaped into a `<pre>` block inside the content of a Zotero note item. That note is tagged `_zoterolinkedmindmaps-storage-v1` and parented to a per-library container item.

The requirement that picked the medium is sync. A mindmap built on a laptop has to be on the desktop too, without the user configuring anything. Note content is a native item field, so it rides Zotero's existing item sync with no WebDAV setup and no file-sync path. Nothing in the plugin implements sync, conflict detection, or transport.

Two alternatives were ruled out.

A plugin-local database (a sqlite file, or JSON on disk beside the profile) would give clean concurrent-write semantics and no visible library clutter, and would never sync. The mindmap would exist on one machine only. For a tool whose whole point is organising a library that already follows the user across machines, that is not a tradeoff, it is a missing feature.

`Zotero.SyncedSettings` looked closer: a per-library JSON store with no item-tree presence at all. It does not work. The data server whitelists setting names (`dataserver/model/Settings.inc.php` allows six literals plus the `lastPageIndex_`/`lastRead_` patterns) and caps values at 30,000 characters. A plugin's key is rejected at upload, so the data would never leave the local sqlite, which lands back on the local-only problem.

The cost of the note is that it is a normal, visible Zotero item. Zotero has no hidden item type. Everything the plugin does about library clutter (the container item, the item-tree filter) is working around that one fact. See [container-guard-explanation.md](container-guard-explanation.md) and [library-filter-explanation.md](library-filter-explanation.md).

## The read-modify-write race, and the queue

The whole document lives in one note. Adding a link means reading the document, appending to `links`, and writing all of it back. So does moving a node, renaming a group, or pruning a deleted item.

Two of those cycles overlapping loses one of them. The later write was built on a document read before the earlier write landed, so it writes the earlier change back out of existence. The earlier caller was told its write succeeded.

This needs no user race to happen. `deletionCleanup` runs from a Zotero notifier: a delete arriving while the mindmap tab is persisting drag positions is enough, and neither side knows about the other.

Serializing the cycles is what makes them safe. `storage.ts` holds one module-level promise and chains every queued task off the previous one's settlement:

```ts
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}
```

Chaining on settlement rather than on value matters: one failing task must not wedge the queue for everything behind it. `reconcileContainer`, `createMindmap`, `writeMindmapDocument`, `deleteMindmap` and `updateMindmapDocument` all run through it.

That is why read-modify-write goes through `updateMindmapDocument` and not through a bare `readMindmapDocument`/`writeMindmapDocument` pair. The pair puts two queued tasks around an unqueued gap, which is the exact hole the queue exists to close.

The queue is not reentrant, and cannot be made so without the async context tracking Zotero's sandbox does not provide. A queued task ends in a transaction, Zotero awaits every notifier observer inside that transaction's commit, so an observer that awaits a queued write parks it behind the task waiting on the observer. Neither settles, and the queue stays wedged for the rest of the session with every later write hanging silently, with no error anywhere. [notifier-queue-explanation.md](notifier-queue-explanation.md) covers the shape of that deadlock; [deletion-cleanup-explanation.md](deletion-cleanup-explanation.md) covers the observer that actually has to live with it.

## Two writes that lie about succeeding

Zotero's save path has two failure modes this module writes around, and both report success.

The note editor re-serializes note HTML through Zotero's own note schema after a save, wrapping the body in a `data-schema-version` div and dropping attributes the schema does not recognise. That includes the `id` on the plugin's `<pre>`. It happens without the user ever opening the note. So the reader matches any `<pre>` rather than `<pre id="zoterolinkedmindmaps-data">`, and the writer still emits the id because it costs nothing when it survives. Content is HTML-escaped going in and unescaped coming out, so a document holding `<`, `>` or `&` round-trips.

The second is a lost write. `saveTx()` calls `_initSave`, which reads the item's change flags, before Zotero opens the transaction. A save that queues behind another transaction on the same item can have its pending note change wiped in between by the earlier save's `_finalizeSave` (which reloads the item and clears its change flags). The save then commits nothing, reports success, and the item's in-memory note text silently reverts to what it was. `saveDocumentToNote` opens the transaction first and calls `setNote` inside it, which closes that window.

Both of these were found by their symptoms, not by reading Zotero's source first. Neither throws.

## Cache lag, and `refreshNote`

A `Zotero.Item`'s cached note text can lag its own committed write, because Zotero reloads the object asynchronously after a save. Read the cache immediately after writing and you get the document as it was.

`refreshNote` forces `item.reload(["note"], true)` before parsing. Only paths that might be reading their own recent write use it: `resolveMindmap`, the id-matching walk behind it, the Connections panel, and the graph's live refresh (which runs on a notification about a write that may have landed a moment ago, which is exactly when the cache lags). Enumerating the registry through `readAllMindmaps` does not refresh, since listing is not reading back a write.

## Why `whenStorageIdle` exists

Some storage writes are nobody's return value. A Zotero item delete resolves as soon as `eraseTx()` commits; the delete notification arrives afterwards, and the cleanup write it triggers is started by an observer that returns `void` on purpose. Nothing in the calling code can await it.

That is fine in production and poison in tests. A test that erases an item it had added as a node leaves a storage write in flight, and the write lands during whatever test runs next, overwriting that test's storage note with an older document. The failure surfaces somewhere unrelated to its cause.

`whenStorageIdle` awaits the queue promise, so a test can drain everything before moving on. `test/mindmap/storageIdle.test.ts` installs it as a root-level `afterEach` with a 50ms delay in front, because at the moment `eraseTx()` resolves the cleanup write is usually not queued yet: the delay gives the notifier a chance to run and enqueue, and the drain then waits for it.

Production code has no reason to call it. It exists because the notifier path is deliberately fire-and-forget, and tests need a seam into it.

## The libraryID threading hazard

Every storage function defaults `libraryID` to `Zotero.Libraries.userLibraryID`. That default is correct for the common case and wrong for group libraries, and nothing in the type system catches the difference.

`writeMindmapDocument` is where it bites. The document carries `id`, `title`, `nodes` and `links`, but not the library it came from. A caller that read a mindmap out of a group library and then writes it back without passing `libraryID` sends the write to the user library: the id lookup runs against the wrong library's notes, misses, and (in a user library with no storage notes yet) takes the create-a-new-note fallback. The group mindmap is now duplicated into the personal library, and the group's copy still holds the pre-edit document.

The mitigation is discipline, not structure: call sites that have an item in hand pass `item.libraryID` (`connectionsPanel.ts` and `addLinkForm.ts` do), and `reconcileContainers` iterates `Zotero.Libraries.getAll()` explicitly. There is no runtime check that a document's nodes and its target library agree, and adding a `libraryID` to the document itself was not done. Treat an unqualified storage call in new code as a bug until you have checked which library it means.

## The sync conflict this design accepts

Zotero does not merge note content across devices. It syncs the note as a blob and resolves conflicts by picking one side.

So an edit made on one device, before another device's stale copy syncs, can be silently overwritten. Add three links on the laptop, open the mindmap on the desktop from a copy that predates them, drag one node, and the desktop's write can take the laptop's three links with it. No error, no conflict dialog from the plugin, and no way for the plugin to detect it after the fact: the document that arrives is well-formed, it just is not the one that should have won.

This is accepted for v1, not solved. The reasoning is that simultaneous multi-device editing of the same mindmap is unlikely for a single user, and the alternative (splitting a mindmap across many smaller synced units so a conflict costs one link instead of a whole document) buys granularity at the cost of a much harder consistency problem inside the plugin. The revisit condition is evidence: if this actually loses work in practice, storage granularity is the thing to change.

The blast radius is one mindmap document, since each mindmap is its own note. It is not the whole library.

## An empty registry means two different things

`findAllMindmapNotes` returns nothing for a library that has never held a mindmap and for a library whose mindmaps are all in the trash. The trash cases are two: a trashed storage note drops out of a search that sets no `includeDeleted`, and a trashed container takes its live child notes with it, because Zotero's search excludes the children of deleted items.

Answering "empty" by creating something is the wrong move in the second case and the right one in the first. A fresh mindmap written behind trashed data is a second copy the user cannot reconcile with the first, arriving at the exact moment they are trying to work out where their work went.

`hasHiddenMindmapData` is the disambiguator, and it runs two count comparisons rather than one search. Trashed notes with `includeDeleted` against live ones catches a trashed note. Trashed containers against live ones catches the notes that went down with a container, which the note count cannot see: Zotero does not set the deleted flag on a trashed parent's children, so those notes are live rows that no live search reaches.

`findOrCreateContainer` enforces the same rule one level lower, throwing `container-trashed` instead of building a replacement. Every write path that needs a container goes through it, so the refusal covers `createMindmap`, `writeMindmapDocument`'s create fallback and `resolveMindmap` with no id, not only the tab-open path that checks `hasHiddenMindmapData` up front. The tab checks first anyway, because a check gives a message worth reading and a caught throw gives a debug line.

## Known unrecoverable states

Trashing a storage note hides that mindmap from the plugin. The trash observer warns at the time, and the Mindmap tab warns on open when it was the library's last mindmap, but there is no startup check for it: the reconciliation looks at containers, and a live container with one trashed note under it reads as healthy. A note trashed in a session the user has since closed goes unmentioned. Emptying the trash makes it permanent.

Trashing the container has the same effect on every mindmap in the library at once. The plugin warns at trash time and at startup and refuses to build a replacement container, but it never un-trashes. See [container-guard-explanation.md](container-guard-explanation.md).

A note whose JSON no longer parses is skipped by `readAllMindmaps` with a `Zotero.debug` line, so the other mindmaps stay usable and the corrupt one silently disappears from the list. There is no repair path and no user-visible report of it. Someone hitting this has to open the note by hand.

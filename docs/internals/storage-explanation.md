# Why mindmaps live in Zotero notes

The design behind `src/modules/mindmap/storage.ts`: what the storage medium buys, what it costs, and which of those costs are still unpaid. For the API itself see [storage-reference.md](storage-reference.md).

## A JSON document inside a note item

A mindmap is one JSON document, escaped into a `<pre>` block inside the content of a Zotero note item. That note is tagged `_zoterolinkedmindmaps-storage-v1` and parented to a per-library container item.

Sync is the requirement that picked the medium. A mindmap built on a laptop has to show up on the desktop, and the user should not have to configure anything for that to happen. Note content is a native item field, so it rides Zotero's existing item sync with no WebDAV setup and no file-sync path. The plugin implements no sync, no conflict detection, no transport of its own.

Two alternatives got ruled out along the way.

A plugin-local database (a sqlite file, or JSON on disk beside the profile) would give clean concurrent-write semantics and no visible library clutter. It would also never sync, so the mindmap would exist on exactly one machine. For a tool whose whole point is organising a library that already follows the user around, that isn't a tradeoff worth weighing. It's a missing feature.

`Zotero.SyncedSettings` looked much more promising: a per-library JSON store with no presence in the item tree at all. It doesn't work. The data server whitelists setting names (`dataserver/model/Settings.inc.php` allows six literals plus the `lastPageIndex_`/`lastRead_` patterns) and caps values at 30,000 characters. A plugin's key gets rejected at upload, so the data would never leave the local sqlite. That lands right back on the local-only problem.

What the note costs is that it is a normal, visible Zotero item. Zotero has no hidden item type to offer. Everything the plugin does about library clutter (the container item, the item-tree filter) is scaffolding around that one fact, and it is worth knowing that before you read either of those modules. See [container-guard-explanation.md](container-guard-explanation.md) and [library-filter-explanation.md](library-filter-explanation.md).

## The read-modify-write race, and the queue

The whole document lives in one note. Adding a link means reading the document, appending to `links`, and writing all of it back. Moving a node does the same. So does renaming a group, or pruning a deleted item.

Let two of those cycles overlap and you lose one. The later write was built on a document read before the earlier write landed, so it writes the earlier change back out of existence, and the caller behind that earlier change was told it succeeded.

You don't need a user doing two things at once for this to happen. `deletionCleanup` runs from a Zotero notifier, so a delete arriving while the mindmap tab is persisting drag positions is enough on its own. Neither side has any idea the other exists.

Serializing the cycles is what makes them safe. `storage.ts` holds one module-level promise and chains every queued task off the previous one's settlement:

```ts
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}
```

Chaining on settlement instead of on value matters here, because one failing task must not wedge the queue for everything behind it. `reconcileContainer`, `createMindmap`, `writeMindmapDocument`, `deleteMindmap` and `updateMindmapDocument` all run through it.

This is also why read-modify-write goes through `updateMindmapDocument` instead of a bare `readMindmapDocument`/`writeMindmapDocument` pair. The pair puts two queued tasks around an unqueued gap, and that gap is exactly the hole the queue exists to close.

The queue is not reentrant, and it can't be made reentrant without the async context tracking that Zotero's sandbox does not provide. Here is the shape of the problem. A queued task ends in a transaction, and Zotero awaits every notifier observer inside that transaction's commit. So an observer that awaits a queued write parks that write behind the very task that is waiting on the observer. Neither one settles. The queue then stays wedged for the rest of the session, with every later write hanging silently and no error anywhere to tell you. [notifier-queue-explanation.md](notifier-queue-explanation.md) covers the deadlock in detail; [deletion-cleanup-explanation.md](deletion-cleanup-explanation.md) covers the observer that has to live with it.

## Two writes that lie about succeeding

Zotero's save path has two failure modes this module writes around. Both of them report success.

The first is attribute stripping. After a save, the note editor re-serializes note HTML through Zotero's own note schema, wrapping the body in a `data-schema-version` div and dropping any attribute the schema does not recognise. The `id` on the plugin's `<pre>` is one of those, and it disappears without the user ever opening the note. So the reader matches any `<pre>` instead of `<pre id="zoterolinkedmindmaps-data">`, while the writer keeps emitting the id anyway, since it costs nothing on the occasions it survives. Content gets HTML-escaped going in and unescaped coming out, so a document holding `<`, `>` or `&` round-trips intact.

The second is a lost write, and it is nastier. `saveTx()` calls `_initSave`, which reads the item's change flags, before Zotero opens the transaction. If that save queues behind another transaction on the same item, the earlier save's `_finalizeSave` can wipe the pending note change in between (it reloads the item and clears its change flags). Your save then commits nothing, reports success, and the item's in-memory note text quietly reverts to what it was before. `saveDocumentToNote` opens the transaction first and calls `setNote` inside it, which shuts that window.

Neither of these throws, and neither was found by reading Zotero's source. They were found by chasing the symptoms back, which took a while in both cases.

## Cache lag, and `refreshNote`

A `Zotero.Item`'s cached note text can lag behind its own committed write, because Zotero reloads the object asynchronously after a save. Read the cache immediately after writing and you get the document as it used to be.

`refreshNote` forces `item.reload(["note"], true)` before parsing. Only the paths that might be reading back their own recent write bother with it: `resolveMindmap`, the id-matching walk behind it, the Connections panel, and the graph's live refresh. That last one is the clearest case, since it runs on a notification about a write that may have landed a fraction of a second ago, which is precisely when the cache is stale. Enumerating the registry through `readAllMindmaps` skips the refresh, because listing mindmaps isn't reading back a write.

## Why `whenStorageIdle` exists

Some storage writes are nobody's return value. A Zotero item delete resolves the moment `eraseTx()` commits, and the delete notification arrives after that. The cleanup write it triggers gets started by an observer that returns `void` on purpose, so there is nothing for the calling code to await.

In production that is fine. In tests it is poison. A test that erases an item it had added as a node walks away leaving a storage write in flight, that write lands during whatever test runs next, and it overwrites that test's storage note with an older document. The failure then surfaces nowhere near its cause, which is the worst kind of test failure to debug.

`whenStorageIdle` awaits the queue promise so a test can drain everything before moving on. `test/mindmap/storageIdle.test.ts` installs it as a root-level `afterEach` with a 50ms delay in front of it. The delay is there because at the moment `eraseTx()` resolves, the cleanup write usually isn't queued yet: those 50ms give the notifier a chance to run and enqueue, and the drain then has something to wait for.

Production code has no reason to call it. It exists because the notifier path is deliberately fire-and-forget, and tests needed a seam into it.

## The libraryID threading hazard

Every storage function defaults `libraryID` to `Zotero.Libraries.userLibraryID`. That default is right for the common case and wrong for group libraries, and the type system will never tell you which one you're in.

`writeMindmapDocument` is where it bites. The document carries `id`, `title`, `nodes` and `links`, but nothing about the library it came from. So a caller that reads a mindmap out of a group library and writes it back without passing `libraryID` sends the write to the user library instead. The id lookup runs against the wrong library's notes, misses, and (in a user library with no storage notes yet) falls through to create-a-new-note. You now have the group mindmap duplicated into the personal library, while the group's copy still holds the pre-edit document.

There is no structural fix here, only discipline. Call sites that have an item in hand pass `item.libraryID`, which `connectionsPanel.ts` and `addLinkForm.ts` both do, and `reconcileContainers` iterates `Zotero.Libraries.getAll()` explicitly. Nothing checks at runtime that a document's nodes and its target library agree, and putting a `libraryID` into the document itself never got done. Until one of those changes, treat an unqualified storage call in new code as a bug until you have worked out which library it means.

## The sync conflict this design accepts

Zotero does not merge note content across devices. It syncs the note as a blob and resolves conflicts by picking a side.

Which means an edit made on one device can be silently overwritten by another device working from a stale copy. Add three links on the laptop, open the mindmap on the desktop from a copy that predates them, drag one node, and the desktop's write takes your three links with it. No error, no conflict dialog from the plugin, and no way for the plugin to notice afterwards, because the document that arrives is perfectly well-formed. It just isn't the one that should have won.

Being honest about this: it is accepted for v1 rather than solved. The reasoning is that one person editing the same mindmap on two machines at once is unlikely, and the obvious alternative (splitting a mindmap across many smaller synced units, so a conflict costs one link instead of a whole document) buys that granularity in exchange for a much harder consistency problem inside the plugin. The condition for revisiting is evidence. If this turns out to lose real work, storage granularity is the thing to change.

The one comfort is blast radius. Each mindmap is its own note, so a conflict costs you one mindmap document rather than the whole library.

## An empty registry means two different things

`findAllMindmapNotes` returns nothing for a library that has never held a mindmap. It also returns nothing for a library whose mindmaps are all in the trash, and there are two ways to land in that second case: a trashed storage note drops out of any search that doesn't set `includeDeleted`, and a trashed container drags its live child notes out of view with it, because Zotero's search excludes children of deleted items.

Creating a fresh mindmap in response to "empty" is right in the first case and badly wrong in the second. Writing a new mindmap behind trashed data hands the user a second copy they can't reconcile with the first, at the exact moment they are trying to work out where their work went.

`hasHiddenMindmapData` is the disambiguator, and it runs two count comparisons instead of one search. Trashed notes with `includeDeleted` against live ones catches a trashed note. Trashed containers against live ones catches the notes that went down with a container, which the note count can't see at all: Zotero doesn't set the deleted flag on a trashed parent's children, so those notes stay live rows that no live search reaches.

`findOrCreateContainer` enforces the same rule a level lower, throwing `container-trashed` instead of building a replacement. Every write path that needs a container goes through it, so the refusal covers `createMindmap`, `writeMindmapDocument`'s create fallback and `resolveMindmap` with no id, not just the tab-open path that checks `hasHiddenMindmapData` up front. The tab still checks first, because an up-front check produces a message the user can act on and a caught throw produces a debug line nobody reads.

## Known unrecoverable states

Trashing a storage note hides that mindmap from the plugin. The trash observer warns at the time, and the Mindmap tab warns on open if it was the library's last mindmap, but there is no startup check that would catch it later. Reconciliation looks at containers, and a live container with one trashed note under it looks perfectly healthy. So a note trashed in a session the user has since closed goes unmentioned, and emptying the trash makes it permanent.

Trashing the container does the same thing to every mindmap in the library at once. The plugin warns at trash time, warns again at startup, and refuses to build a replacement container. What it never does is un-trash anything. See [container-guard-explanation.md](container-guard-explanation.md).

A note whose JSON no longer parses gets skipped by `readAllMindmaps` with a `Zotero.debug` line. The other mindmaps stay usable, and the corrupt one just disappears from the list without saying anything. There is no repair path and no user-visible report, so anyone who hits this has to open the note by hand and fix the JSON themselves. Nobody should have to do that, and a repair path is on the list.

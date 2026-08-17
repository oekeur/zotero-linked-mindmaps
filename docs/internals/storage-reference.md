# Storage API reference

Every exported symbol in `src/modules/mindmap/storage.ts`. This module is the only place that reads or writes a mindmap document to disk.

Every function that takes a `libraryID` defaults it to `Zotero.Libraries.userLibraryID`. See [the libraryID threading hazard](storage-explanation.md#the-libraryid-threading-hazard) for why passing it explicitly matters.

For the shape of what gets stored, see [schema-reference.md](schema-reference.md). For the validation these functions run before accepting a document, see [validate-reference.md](validate-reference.md).

## Constants

### `STORAGE_TAG`

```ts
const STORAGE_TAG = "_zoterolinkedmindmaps-storage-v1";
```

The Zotero tag every mindmap storage note carries. The registry of mindmaps is exactly the set of notes with this tag; there is no index note.

### `CONTAINER_TAG`

```ts
const CONTAINER_TAG = "_zoterolinkedmindmaps-container-v1";
```

The tag on the one `document` item per library that all storage notes hang off. Lookup is by tag rather than by a stored preference, because a preference is device-local and every synced device has to arrive at the same container from library data alone.

The container's title, `"Zotero Linked Mindmaps (plugin data)"`, is not exported and is never translated: it is stored data, and two devices in different locales must still recognise the same item.

## Errors

### `StorageErrorReason`

```ts
type StorageErrorReason =
  | "block-missing"
  | "parse-failed"
  | "invalid-schema"
  | "not-found"
  | "container-trashed";
```

`block-missing`: the note has no `<pre>` element, so it holds no data block at all.

`parse-failed`: the data block exists but `JSON.parse` rejected its contents.

`invalid-schema`: the JSON parsed but `parseMindmapDocument` rejected the result. Also used for two argument checks that are not about JSON at all: a blank title passed to `createMindmap` or `updateMindmapMetadata`.

`not-found`: no mindmap in the library carries the requested id.

`container-trashed`: every container the library has is in the trash, and `findOrCreateContainer` refused to build a replacement. The only throw in this module that is about the library's state rather than a document's contents. `mindmapTab.ts` catches it by reason and warns.

### `StorageError`

```ts
class StorageError extends Error {
  reason: StorageErrorReason;
  constructor(reason: StorageErrorReason, message: string);
}
```

Sets `name` to `"StorageError"`. Every throw from this module is a `StorageError`; callers switch on `reason` rather than matching message text.

## Serialization

### `serializeDocument`

```ts
function serializeDocument(doc: MindmapDocument): string;
```

Returns the JSON exactly as it goes into the note. Before stringifying, rewrites any node whose position `isUnplaced` reports as unplaced to a literal `position: null`, so the NaN convenience marker and `null` both land on disk in the one canonical shape `isMindmapNode` accepts back.

No side effects. Two documents that serialize identically are the same stored document, which is how `graphRenderer`'s live refresh tells a write it made itself apart from someone else's (see [rendering-explanation.md](rendering-explanation.md)).

## Finding notes and containers

### `findAllMindmapNotes`

```ts
function findAllMindmapNotes(libraryID?: number): Promise<Zotero.Item[]>;
```

Every note item in `libraryID` tagged `STORAGE_TAG`, sorted by ascending item id. Runs a `Zotero.Search` with conditions on `libraryID`, `itemType is note` and `tag is STORAGE_TAG`, then fetches the matches with `Zotero.Items.getAsync`. Returns `[]` when the search matches nothing. The sort is applied here rather than trusting `getAsync` to echo id order back.

The search adds no `noChildren` condition, so notes parented to the container still match. `test/mindmap/storage.test.ts` asserts this ("still finds and reads a mindmap once its note is a child").

Trashed notes do not match: the search sets no `includeDeleted` condition, so a storage note in the trash drops out of the registry, and neither does a live note whose parent container is trashed, since Zotero's search excludes the children of deleted items. Both cases make the library read as empty; `hasHiddenMindmapData` is how a caller tells that apart from a library that holds nothing.

Does not read note content, so a corrupt note is still returned. No side effects.

### `hasHiddenMindmapData`

```ts
function hasHiddenMindmapData(libraryID?: number): Promise<boolean>;
```

Whether the library holds plugin data the registry cannot reach. `true` when the trash holds either a storage note or a container that a live search does not see.

Runs two comparisons rather than one search. First, storage notes with and without `includeDeleted`: more with than without means at least one note is trashed. Then containers with and without `includeDeleted`, through `findContainers`. The second comparison is what catches notes that went down with a trashed container, since Zotero does not flag a trashed parent's children as deleted, so counting trashed notes alone would miss them.

Callers use this before treating an empty registry as an empty library. `mindmapTab.ts` checks it before creating a library's first mindmap on tab open, and warns instead of creating when it comes back `true`.

Four cases are covered in `test/mindmap/storage.test.ts`: a trashed note, a trashed container, a healthy library, and `findOrCreateContainer` refusing behind a trashed container.

No side effects.

### `findMindmapNote`

```ts
function findMindmapNote(libraryID?: number): Promise<Zotero.Item | null>;
```

The first entry from `findAllMindmapNotes`, or `null`. Lowest item id wins, so repeated calls agree on which note is "the default one". No side effects.

### `findContainers`

```ts
function findContainers(
  libraryID?: number,
  options?: { includeTrashed?: boolean },
): Promise<Zotero.Item[]>;
```

Every item in `libraryID` tagged `CONTAINER_TAG`, sorted by ascending item key. `includeTrashed` defaults to `false`; passing `true` adds an `includeDeleted` search condition so trashed containers come back too.

Sorted by key rather than by item id because ids are local to one device. When two devices each created a container before syncing, only the key gives both of them the same answer about which one wins. No side effects.

### `findOrCreateContainer`

```ts
function findOrCreateContainer(libraryID?: number): Promise<Zotero.Item>;
```

The library's lowest-key container, creating one if the library has none. A created container is a `Zotero.Item` of type `document` with its title set to the fixed English container title, tagged `CONTAINER_TAG`, saved with `saveTx()`.

Throws `StorageError("container-trashed")` instead of creating when the live search finds no container but an `includeTrashed` search finds one. A replacement would take the next write while the real mindmaps sat in the trash, invisible to a search that skips a deleted item's child notes, leaving the user two containers and nothing telling them so. Reporting the throw is the caller's job. `reconcileContainer` answers the same situation with a `"trashed"` state rather than an error.

The trashed check is a plain `findContainers` call, not a queued one, on purpose: this runs inside queued tasks (`createMindmap` calls `createNoteFor` calls this), and the queue is not reentrant.

Side effect: creates and saves an item when the library has never had a container.

## Container reconciliation

### `ContainerState`

```ts
type ContainerState = "ok" | "trashed";
```

### `reconcileContainer`

```ts
function reconcileContainer(libraryID?: number): Promise<ContainerState>;
```

Brings a library's storage notes under one container. Runs as a queued task, so it cannot interleave with a document write.

Returns `"trashed"` and writes nothing when the library has no untrashed container but does have a trashed one. Returns `"ok"` in every other case, including a library with no mindmaps and no container (which gets no container created, so the plugin adds no row to a library it stores nothing in).

Otherwise it adopts the lowest-key container, reparents every storage note whose `parentItemID` is not the adopted container's id, and erases each remaining container that has no child notes left.

The reparenting happens inside one `Zotero.DB.executeTransaction`, so a library never half-migrates. Each stray note has `setCollections([])` called on it before the parent link changes: Zotero enforces with a DB trigger that a child item cannot sit in a collection, so a note the user had filed somewhere has to come out of it first or the whole migration fails on that note. Note keys and note content are left as they were; `test/mindmap/storage.test.ts` asserts both survive the migration unchanged.

A duplicate container that still has children (a note the user hung off it themselves) is left in place, since erasing takes its children with it.

Idempotent: a library already in the target shape writes nothing. The test suite asserts a second call returns `"ok"` and leaves one container.

Side effects: may create a container, reparent notes, and erase containers.

## Reading a note

### `refreshNote`

```ts
function refreshNote(item: Zotero.Item): Promise<Zotero.Item>;
```

Reloads the item's note text from the database (`item.reload(["note"], true)`) and returns the same item. A `Zotero.Item`'s cached note text can lag its own committed write for a moment, because Zotero reloads the object asynchronously after a save, so reading the cache right after writing can hand back the pre-write document.

Only paths that can be reading their own recent write call this. Enumerating the registry does not.

### `readDocumentFromNote`

```ts
function readDocumentFromNote(item: Zotero.Item): MindmapDocument;
```

Synchronous. Extracts the first `<pre>...</pre>` from `item.getNote()`, unescapes `&lt;`, `&gt;` and `&amp;`, parses the result as JSON, and validates it with `parseMindmapDocument`.

Throws `StorageError("block-missing")` when the note has no `<pre>`, `StorageError("parse-failed")` when `JSON.parse` throws (the message carries the underlying parse error), and `StorageError("invalid-schema")` with the validator's error string when validation fails.

Matches any `<pre>`, not the `id` the plugin writes, because Zotero's note editor re-serializes note HTML through its own schema after a save and drops attributes the schema does not know, including that `id`. `test/mindmap/storage.test.ts` covers reading a note with the `id` stripped and a trailing newline added.

Parses the item as it currently stands in memory. It does not refresh from the database; pair it with `refreshNote` when the caller may be reading its own recent write. No side effects.

### `StoredMindmap`

```ts
interface StoredMindmap {
  item: Zotero.Item;
  doc: MindmapDocument;
}
```

A storage note together with the document it holds.

### `resolveMindmap`

```ts
function resolveMindmap(
  id?: string,
  libraryID?: number,
): Promise<StoredMindmap>;
```

The mindmap `id` names, or the library's default one when `id` is omitted. Every read and write in this module resolves through here.

With an `id`: walks `findAllMindmapNotes`, refreshing and parsing each until one document's `id` matches. A note that fails to parse is skipped rather than aborting the walk, so one unreadable note cannot hide the mindmap being looked for. Throws `StorageError("not-found")` when no note matches.

Without an `id`: calls `findOrCreateMindmapNote`, so it creates a storage note (and, through it, a container) when the library has none. Then refreshes and parses that note, and can therefore throw any of `readDocumentFromNote`'s errors.

Side effect: creates data when called with no `id` in a library that holds no storage note.

## Creating notes

### `createMindmapNote`

```ts
function createMindmapNote(libraryID?: number): Promise<Zotero.Item>;
```

Creates a storage note holding a fresh empty document titled `"Mindmap"`, with a generated document id from `Zotero.Utilities.generateObjectKey()`, no nodes and no links.

The note is parented to the library's container (creating the container if needed) before the save, so it never exists as a top-level row, not even for the moment between creation and reparenting. The note gets `STORAGE_TAG` and is saved with `saveTx()`.

Propagates `StorageError("container-trashed")` from `findOrCreateContainer`, so nothing is written in a library whose only container is in the trash. Every path that creates a storage note runs through here, which is what makes that refusal cover `createMindmap`, `findOrCreateMindmapNote`, `resolveMindmap` with no id, and `writeMindmapDocument`'s create fallback.

Not queued. Side effects: creates a note, and possibly a container.

### `findOrCreateMindmapNote`

```ts
function findOrCreateMindmapNote(libraryID?: number): Promise<Zotero.Item>;
```

`findMindmapNote`'s result, or a new note from `createMindmapNote` when the library has none. Side effect: creates data when the library has no storage note.

## The registry

### `MindmapSummary`

```ts
interface MindmapSummary {
  id: string;
  title: string;
  description?: string;
  noteItemID: number;
}
```

`noteItemID` is the storage note's Zotero item id, which callers use to reopen exactly that note rather than resolving by id again.

### `readAllMindmaps`

```ts
function readAllMindmaps(libraryID?: number): Promise<StoredMindmap[]>;
```

Every mindmap in the library, in storage-note id order. A note whose content does not parse or does not validate is skipped and logged through `Zotero.debug`, not thrown: one corrupt mindmap must not make the others unlistable. The test suite asserts a note holding `{not valid json` drops out of the listing while a good one still appears.

Does not call `refreshNote`, so a document written moments earlier through a path that did not go through the queue may still read stale. No side effects: notably, it never creates a storage note, which is why `deletionCleanup` and `crossMindmapCleanup` use it instead of `readMindmapDocument`.

### `listMindmaps`

```ts
function listMindmaps(libraryID?: number): Promise<MindmapSummary[]>;
```

`readAllMindmaps` projected to summaries. The `description` key is omitted entirely when the document has none, rather than set to `undefined`. No side effects.

### `createMindmap`

```ts
function createMindmap(
  title: string,
  description?: string,
  libraryID?: number,
): Promise<MindmapDocument>;
```

Adds a mindmap and returns the document it created (the caller gets the generated id without a second read). Throws `StorageError("invalid-schema")` when `title.trim()` is empty, before anything is written.

The note creation runs as a queued task. Touches nothing but the note it creates, so existing mindmaps cannot be disturbed by it. Side effects: creates a note, and possibly a container.

## Reading and writing documents

### `readMindmapDocument`

```ts
function readMindmapDocument(
  id?: string,
  libraryID?: number,
): Promise<MindmapDocument>;
```

`resolveMindmap(id, libraryID).doc`. Throws whatever `resolveMindmap` throws.

Side effect when called with no `id`: creates a storage note (and container) in a library that has none. That is what makes a single-mindmap library work without anything ever picking one, and it is also why notifier-driven code must not call it. See [deletion-cleanup-explanation.md](deletion-cleanup-explanation.md).

### `writeMindmapDocument`

```ts
function writeMindmapDocument(
  doc: MindmapDocument,
  libraryID?: number,
): Promise<void>;
```

Writes `doc` into the note its own `id` belongs to. Validates first, outside the queue, and throws `StorageError("invalid-schema")` on failure without touching storage.

The write itself runs as a queued task: resolve the id, and if a note carries it, save the document there. If no note carries the id and the library holds no storage note at all, create one for this document (the case a document assembled in memory, or carried over from before the registry existed, lands in). If no note carries the id but the library does hold storage notes, throw `StorageError("not-found")`.

That last rule is deliberate. Overwriting some other note would replace its whole document (title, nodes and links) with this one, and the id says the caller did not mean that note. A layout write still in flight for a mindmap deleted in the meantime would otherwise land on an unrelated mindmap.

The save runs inside `Zotero.DB.executeTransaction` with `setNote` called inside the transaction rather than before it. `saveTx()` reads the item's change flags in `_initSave` before Zotero opens the transaction, so a save queued behind another transaction on the same item can have its pending note change wiped in between by the earlier save's `_finalizeSave`. The save then reports success, writes nothing, and the item's in-memory note text silently reverts.

### `updateMindmapDocument`

```ts
function updateMindmapDocument(
  mutate: (doc: MindmapDocument) => MindmapDocument | null,
  id?: string,
  libraryID?: number,
): Promise<MindmapDocument | null>;
```

Reads the mindmap, applies `mutate`, and writes the result back with no other storage operation interleaving. This is the read-modify-write entry point; a bare read/write pair is not safe.

Returning `null` from `mutate` skips the write and resolves to `null`. Otherwise the returned document is validated (`StorageError("invalid-schema")` on failure) and saved, and the parsed document is returned.

The note is resolved once, before `mutate` runs, so the write lands in the note the read came from even when the mutation changed the document's own `id`.

Runs as a queued task and ends in a transaction, so a Zotero notifier observer must never await it. See [notifier-queue-explanation.md](notifier-queue-explanation.md).

### `updateMindmapMetadata`

```ts
function updateMindmapMetadata(
  id: string,
  updates: { title?: string; description?: string },
  libraryID?: number,
): Promise<MindmapDocument>;
```

Changes a mindmap's title and description, leaving nodes, links and groups alone. Returns the written document (never `null`: the mutation it passes to `updateMindmapDocument` never opts out).

Throws `StorageError("invalid-schema")` when `updates.title` is present and trims to empty, before any read. An empty `description` deletes the key rather than storing `""`. Omitting either field leaves it as it was.

### `deleteMindmap`

```ts
function deleteMindmap(id: string, libraryID?: number): Promise<void>;
```

Removes a mindmap for good. Runs as a queued task: resolve the id (throwing `StorageError("not-found")` when nothing carries it), remember the note's `parentItemID`, erase the note with `eraseTx()`, then erase that parent if it is still tagged `CONTAINER_TAG` and has no child notes left.

Erases rather than trashes, for two reasons that are not the one the registry search would suggest. A trashed note does drop out of `findAllMindmapNotes` on its own, since that search sets no `includeDeleted` condition, so the mindmap stops being listed either way. What trashing would leave behind is an opaque JSON note sitting in the user's trash after a delete that looked like it worked, with nothing in it they can read or act on. It would also keep the container alive: `childNoteCount` calls `numNotes(true)`, which counts trashed children, so `eraseContainerIfEmpty` would never fire and the plugin's row would outlive the library's last mindmap.

The mindmap's nodes and links live inside the note, so erasing it removes them. The Zotero items and notes those nodes pointed at are separate objects this never opens; `test/mindmap/storage.test.ts` asserts a referenced article survives its mindmap's deletion.

Side effects: erases the storage note; erases the container when that was the library's last mindmap; fires a Zotero delete notification, which wakes [deletionCleanup](deletion-cleanup-reference.md) and [cross-mindmap pruning](cross-mindmap-cleanup-reference.md).

## Queue drain

### `whenStorageIdle`

```ts
function whenStorageIdle(): Promise<void>;
```

Resolves once every queued storage operation has settled. Rejections in queued tasks do not propagate here; the queue chains on settlement, not on value.

Tests need this. A write triggered by a Zotero notifier (deletion cleanup) is not awaited by whatever caused the delete, so without a drain it lands in the middle of a later test. `test/mindmap/storageIdle.test.ts` installs a root-level `afterEach` that delays 50ms (giving the notifier a chance to enqueue at all) and then awaits this. See [testing-explanation.md](../contributing/testing-explanation.md).

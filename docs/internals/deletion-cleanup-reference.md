# Deletion cleanup reference

Every exported symbol in `src/modules/mindmap/deletionCleanup.ts`, and what the observer does when it fires. This module prunes the mindmap JSON when a linked Zotero item or note is deleted. For why it is built this way, see [deletion-cleanup-explanation.md](deletion-cleanup-explanation.md).

## `registerDeletionObserver`

```ts
function registerDeletionObserver(): string;
```

Registers a `Zotero.Notifier` observer on type `"item"` under the id `zoterolinkedmindmaps-deletion-cleanup`, and returns Zotero's registration handle. Called from `onStartup` in `src/hooks.ts`.

One registration covers items and notes, since notes are items with `itemType` `"note"`. `registerObserver`'s `types` argument filters by Type only, not by Event, so the observer filters to `event === "delete"` itself.

## `unregisterDeletionObserver`

```ts
function unregisterDeletionObserver(id: string): void;
```

Passes `id` to `Zotero.Notifier.unregisterObserver`. Called from `onShutdown`. See [lifecycle-reference.md](lifecycle-reference.md).

## Observer behavior

### `notify` contract

The observer's `notify` returns `void`, never a promise, and must keep doing so. Zotero awaits each observer's return value inside the commit of the transaction that fired the notification, and the pruning below ends in a storage-queue write; awaiting it here parks that write behind the queued task that is waiting on this notification to return, and neither ever settles.

`deleteMindmap` is exactly that case: it erases the storage note from inside a queued task, and the erase fires this observer.

Events other than `"delete"` on type `"item"` return immediately.

For a delete, the work is started as a detached async task that first awaits `Zotero.Promise.delay(0)`. The turn's delay is deliberate: the reads that follow must see the state the transaction leaves behind, not the one it is still committing. Any error in the detached task is caught and logged through `logFailure`.

### Reading the notification

`extraData` for a `delete`/`item` notification is keyed by the deleted item's numeric id and carries `{libraryID, key}` for that item. (Zotero's `DataObject._initErase` populates `env.notifierData` this way before the erase, and `_finalizeErase` passes it through to `Notifier.queue`/`trigger`; confirmed against `zotero/zotero`'s `dataObject.js`.) The observer reads `extraData` directly rather than caching a pre-trash snapshot.

Each notified id whose `extraData` entry has a numeric `libraryID` and a string `key` contributes one `libraryID:key` string to a set of deleted refs, and its `libraryID` to a set of libraries. Entries missing either field are ignored. When no ref survives that filter, the observer returns without touching storage.

### Per-library pruning

For each affected library, in turn:

**Node pruning.** Reads the library's mindmaps with `readAllMindmaps`, not `readMindmapDocument`. Two reasons: it prunes every mindmap that referenced the deleted item rather than just the first one, and it avoids `readMindmapDocument`'s create-on-read side effect, which would otherwise have this notifier create a storage note when there is nothing to prune (or when the note being deleted _is_ the storage note).

From the documents already in hand it computes which mindmaps hold a node whose `ref` matches a deleted ref, and whether any mindmap anywhere holds an external node. When neither is true it returns, so an unrelated deletion (the common case) costs one pass over the registry rather than three.

Each touched mindmap is then updated through `updateMindmapDocument`, which recomputes the matching node ids against the document as it stands at write time and applies `withoutNodes`, dropping those nodes and every link touching them. A mutation that finds nothing to remove returns `null`, so no write happens.

A `StorageError` from any one mindmap (it vanished or stopped parsing between the listing and the update) is logged and the loop continues to the next mindmap. Any other error propagates and is caught by the detached task's handler.

**External-stub reconciliation.** After the node pruning, the library gets a `pruneDanglingExternalNodes` pass. The deleted item may have been a mindmap's own storage note, which leaves every stub reaching into that mindmap pointing at nothing. The notification cannot say so: it carries a key, and the document that key named is already gone. See [cross-mindmap-cleanup-reference.md](cross-mindmap-cleanup-reference.md).

This runs on every delete that names at least one ref, whether or not any node matched, provided the earlier check found an external node somewhere in the library.

### Timing that callers see

Zotero delivers the delete notification after `eraseTx()` has resolved, and the observer then defers a turn before starting. A caller that erases an item and immediately reads a mindmap can therefore see the pre-prune document. Tests drain with `whenStorageIdle` after a delay; `test/mindmap/storageIdle.test.ts` installs that as a root-level `afterEach`.

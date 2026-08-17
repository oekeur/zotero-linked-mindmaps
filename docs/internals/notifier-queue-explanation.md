# Notifier observers and the storage queue

Every storage write in this plugin goes through a serialization queue in `src/modules/mindmap/storage.ts`. Every notifier observer the plugin registers must return without awaiting that queue. Break the rule once and the queue wedges for the rest of the Zotero session, with every later save hanging silently and no error anywhere.

This document explains why, what an observer may do instead, and the two consequences that shape the observer code: the void-versus-await split, and content-identity suppression.

## The queue exists because the document is one blob

A mindmap lives entirely inside one Zotero note as a JSON document. Changing any part of it means reading the whole document, editing it, and writing all of it back.

Two of those read-modify-write cycles overlapping loses the earlier change: the later write was built on a document read before the earlier write landed. That is not a hypothetical user race. `deletionCleanup` runs from a Zotero notifier, so a user deleting an item while the mindmap tab persists dragged node positions is enough to hit it.

So the cycles are serialized. `enqueue` chains each task off the previous one's settlement:

```ts
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}
```

Chaining off settlement rather than value is deliberate: a failing task must not wedge everything behind it. `updateMindmapDocument`, `createMindmap`, `deleteMindmap` and the other mutating entry points all go through this.

## The deadlock

A queued task ends in a `saveTx()`, which is a DB transaction.

Zotero fires notifier events from that transaction's commit path, and it awaits each observer's return value there. The commit does not complete until every observer has settled.

Now put an observer that awaits a storage write in that path. The write is `enqueue`d, which means it chains off the current head of the queue. The current head is the task whose transaction is committing, which is waiting for this observer to return. Neither ever settles.

The queue is now permanently blocked. `queue` never resolves, so every subsequent `enqueue` chains onto a promise that will never settle. Every save in the session after that point hangs. Nothing throws, nothing logs, nothing times out. The UI just stops persisting changes.

`deleteMindmap` is exactly this shape without any user involvement: it erases the storage note from inside a queued task, the erase fires the deletion observer, and the deletion observer's job is to prune mindmaps, which is a storage write.

The queue cannot be made reentrant, which would be the general fix. That needs async context tracking to tell "a write from inside the current task" from "a write from elsewhere", and Zotero's sandbox does not provide it.

## The rule

An observer may:

- inspect the notification arguments;
- read Zotero data;
- start asynchronous work and let the notification return;
- show UI.

An observer may not:

- return a promise that resolves only after a storage-queue write;
- `await` `writeMindmapDocument`, `updateMindmapDocument`, `createMindmap`, `deleteMindmap`, or anything that calls them.

Mechanically: the `notify` function is typed `: void`, and any async work inside it is launched with `void (async () => { … })()` so the value is discarded rather than returned.

All three observer sites carry a comment saying so, in the same terms, because the failure is invisible and the correct shape looks like a mistake to anyone tidying the code up.

## The split: void versus await

The plugin's three notifier observers do not all look the same, and the difference is exactly where a storage write is involved.

**`containerGuard.ts`** returns void and does no queue work at all. It watches `trash` events on items, checks whether any of them is the plugin's container, and shows a `ProgressWindow` if so. Its comment says the rule applies here as a standing constraint rather than as a fix for something it does: nothing here touches the queue, and nothing here may start to. Someone adding a write to this observer later would reintroduce the deadlock, which is why the constraint is written down at a site that does not currently violate it.

**`deletionCleanup.ts`** returns void and does queue work, deliberately unawaited. Its `notify` filters to `delete`/`item`, then launches:

```ts
void (async () => {
  try {
    await Zotero.Promise.delay(0);
    await handleDelete(ids, extraData);
  } catch (err) { … }
})();
```

The `delay(0)` is a second, separate reason for the same shape. The pruning starts with reads, and those reads must see the state the transaction leaves behind, not the one it is still committing. Deferring a macrotask puts the work after the commit.

Because nothing awaits the work, errors have nowhere to propagate to. They are caught and sent to `Zotero.debug`.

**`graphRenderer.ts`'s `attachLiveRefresh`** returns void and starts a rebuild it does not await. The rebuild reads the storage note and redraws the graph. Its comment names the same mechanism: awaiting the rebuild would park it on a queue whose head is the task waiting for this very notification to return.

The cost of the split is that nothing outside the queue knows when this work is done. Tests need to know, which is why `storage.ts` exports `whenStorageIdle()`: a write triggered by a notifier is not awaited by whatever caused the delete, so without it that write lands in the middle of a later test.

## The two notifications per save

The second constraint on observers has nothing to do with the queue, and shows up in the live-refresh path.

Zotero fires two `modify` notifications for one save: one from inside the transaction, and a second one a macrotask later. Both name the same item.

For live refresh that matters because a `modify` on the storage note is answered with a full destroy-and-rebuild of the Cytoscape instance. The common source of a `modify` is the plugin's own write, and the commonest of those is persisting dragged node positions, where the graph already shows the result: the nodes moved before they were saved. Rebuilding for that flashes and discards the Cytoscape instance the user's gesture was using.

So a write the graph made itself has to be suppressed. The obvious implementation is a "currently writing" flag set before the save and cleared after it, and that implementation is wrong here. The second notification arrives after any such flag would have been cleared, so it gets through and the rebuild happens anyway.

Suppression works on content identity instead. `RenderedState` holds the serialized document the graph is currently displaying:

```ts
export interface RenderedState {
  document: string | null;
}
```

`renderMindmap` sets it when it draws. The drag handler sets it inside the mutation callback, before the write resolves, because the first notification for that save arrives before `updateMindmapDocument` returns. The rebuild then compares:

```ts
if (serializeDocument(doc) === rendered.document) {
  return;
}
```

If what is stored is already what the graph shows, there is nothing to redraw. That catches both notifications, and it needs no assumption about when either one arrives. It also catches a write from a different code path that happened to produce the document already on screen, which a flag would not.

`RenderedState` is one box per rendered graph rather than one per module. Two tabs render two graphs over two different documents, and a shared box would let one graph's write suppress the other's refresh.

The rebuild path has one more piece of sequencing for the same underlying reason: it calls `refreshNote(item)` before reading, because it runs on a notification about a write that may have landed a moment ago, which is exactly when Zotero's item cache lags.

## Related

- [storage-explanation.md](storage-explanation.md) for the queue's other job, serializing read-modify-write cycles against each other.
- [deletion-cleanup-explanation.md](deletion-cleanup-explanation.md) for what the deletion observer does once it has returned.
- [container-guard-explanation.md](container-guard-explanation.md) for the trash warning.
- [rendering-explanation.md](rendering-explanation.md) for the live-refresh rebuild loop.
- [lifecycle-reference.md](lifecycle-reference.md) for where each observer is registered and unregistered.

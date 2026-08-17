# Why deletion cleanup reconciles instead of tracking

`src/modules/mindmap/deletionCleanup.ts` is small and every line of it is shaped by two constraints Zotero imposes: what a delete notification can tell you, and what an observer is allowed to await. For the behavior itself see [deletion-cleanup-reference.md](deletion-cleanup-reference.md).

## The problem

A mindmap node points at a Zotero item by `{kind, libraryID, key}` (see [schema-explanation.md](schema-explanation.md)). Delete the item and the node is left pointing at nothing: it still renders, still carries links, still appears in the Connections panel, and resolving it returns false. Something has to remove it.

The obvious design is to listen for deletions and remove what was deleted. Zotero makes that harder than it sounds.

## What the notification actually carries

`Zotero.Notifier` hands an observer `(event, type, ids, extraData)`, and `ids` are numeric item ids: local to one database, not the keys the document stores. Looking the id up afterwards does not help, because by the time the notification arrives the item is gone from the database.

The way out is `extraData`, which for a `delete`/`item` notification is keyed by the deleted id and carries `{libraryID, key}` for that item. `DataObject._initErase` populates it before the erase and `_finalizeErase` passes it through, so the key survives the item. That was confirmed by reading `zotero/zotero`'s `dataObject.js`, not assumed, and it is what lets the node pruning work at all: the observer reads `extraData` directly rather than keeping a snapshot of every item it might care about.

There is one thing `extraData` still cannot express, and it is the case that forced the design.

## When the deleted thing is a mindmap

A storage note is an item. Deleting a mindmap erases its note, which fires this same observer with that note's key. Nothing in the document model connects a note key to the mindmap id inside it, and the document that would have told you is exactly the thing that was just erased.

Meanwhile, every external stub in the library pointing into that mindmap is now dangling. The stub records `(homeMindmapId, homeNodeId)`, and the notification records a note key. There is no way to get from one to the other after the fact.

Tracking would mean keeping a reverse index: a record, somewhere, of which mindmaps point into which. That index is a second copy of the truth, it has to be written on every link edit, and keeping two synced documents in step across devices is precisely the problem the plugin is trying not to have (see [cross-mindmap-cleanup-explanation.md](cross-mindmap-cleanup-explanation.md)).

So the observer stops trying to identify what was removed and asks a different question: which references still resolve? `pruneDanglingExternalNodes` reads every mindmap in the library, builds the set of `(mindmap id, member node id)` pairs that exist right now, and drops every stub pointing at a pair that does not. A deleted mindmap and a node removed from a mindmap are the same case to it, and it cannot be left holding stale bookkeeping, because it holds none.

The node pruning above it uses the same instinct in a smaller way: `updateMindmapDocument`'s callback recomputes which nodes match a deleted ref against the document as it stands at write time, rather than trusting the id list computed during the listing pass a moment earlier.

The cost of reconciling is a full read of the registry on every delete that names a ref. That is one search plus one parse per mindmap, at the low tens of mindmaps a library is expected to hold, on a user action that already hit the database. The observer trims it where it can: it computes "does any mindmap reference a deleted ref" and "does any mindmap hold an external node at all" from documents already in memory, and returns without a second pass when both are false, which is the common case of deleting an unrelated item.

## Why the observer must never await the storage queue

This is the constraint with the worst failure mode in the codebase, and it is silent.

Zotero awaits every notifier observer's return value inside the commit of the transaction that fired the notification. Storage writes run on a serial queue, and every queued task ends in a transaction of its own.

Put those together with `deleteMindmap`. It runs as a queued task; inside that task it calls `eraseTx()`; the erase's commit fires this observer; the observer awaits a storage write; that write is queued behind the task that is currently waiting for the observer to return. Neither ever settles. The queue is wedged, and every storage write for the rest of the session hangs, with no exception thrown anywhere and nothing in the debug log.

The queue cannot be made reentrant to fix this. Detecting "this call came from inside a queued task" needs async context tracking, and Zotero's sandbox does not provide it.

So the rule is structural: `notify` returns `void`, not a promise. The work is started in a detached async function and the notification returns immediately. Both notifier observers in the plugin carry that rule in a comment at the function, because the code looks wrong (a fire-and-forget async task with a swallowed error) until you know why.

The same rule applies to `graphRenderer`'s live refresh and to the container guard's trash check. The container guard's version touches no storage at all, and says so, so that nobody adds a write to it later without noticing.

## Why the work is deferred a turn

The detached task opens with `await Zotero.Promise.delay(0)` before doing anything.

The reads it starts with must see the state the transaction leaves behind, not the state it is still committing. The observer runs inside the commit; yielding once puts the rest of the work after it. Without the delay the pruning would read a database mid-transaction and could prune against a document the transaction is about to change.

That deferral is also why deletion cleanup is invisible to whatever caused the delete. `eraseTx()` resolves, the notification arrives afterwards, the observer yields, and the write lands some time later. Nothing in the calling code can await it, which is fine in production and is the reason `whenStorageIdle` exists for tests (see [testing-explanation.md](../contributing/testing-explanation.md)).

## What it does not do

It does not touch the Zotero items behind the nodes it removes, in either direction: deleting an item prunes the node, and deleting a mindmap leaves every item it referenced alone.

It does not fire on trash. The observer filters to `event === "delete"`, which is the erase, not the move to trash. A trashed item's nodes stay in the document until the trash is emptied, which is the behavior you want (restoring the item restores the node with no work) and also means a mindmap can render nodes for items the user believes they have deleted.

It does not report. A pruned node disappears without a message, and a mindmap that failed to update because it stopped parsing between the listing and the write is logged to `Zotero.debug` and skipped.

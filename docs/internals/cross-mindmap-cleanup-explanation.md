# Why external stubs go stale

The design behind `src/modules/mindmap/crossMindmapCleanup.ts`. For the function itself see [cross-mindmap-cleanup-reference.md](cross-mindmap-cleanup-reference.md); for what a user sees, [cross-mindmap-links-explanation.md](../user-guide/cross-mindmap-links-explanation.md).

## How a cross-mindmap link is stored

A link that reaches from one mindmap into another lives entirely in the mindmap that owns it. There are two pieces: an `external` node stub holding `(homeMindmapId, homeNodeId)`, and an ordinary `MindmapLink` pointing at that stub's local node id. The stub also carries a `ZoteroObjectRef` so it can be drawn without opening the other document, but the other document remains the source of truth for what the node actually is.

Nothing gets written into the mindmap being referenced. It doesn't know it is being pointed at, and there is no reverse index of who points at whom.

That was a choice, and it is the choice that makes this module necessary.

## Why there is no reverse index

An index of "mindmap X is referenced by mindmap Y, node Z" would make cleanup trivial. Delete a node, look up who was pointing at it, remove those stubs.

It would also be a second copy of the truth, stored in a second synced note, updated on every link edit and every deletion. Two documents that have to stay in step across devices, in a store that doesn't merge and resolves conflicts by picking a side, is the exact failure mode the whole storage design is built to avoid (see [storage-explanation.md](storage-explanation.md)). And an index that drifts is worse than no index at all, since it would confidently report stubs that don't exist while missing ones that do.

Keeping the record one-directional means the reference can only ever be wrong in one way, and that way is detectable by looking at what exists.

## What goes stale, and when

The reference has two ends, and the far end can vanish without telling anyone.

The referenced mindmap can be deleted. Its storage note is erased, nothing carries that document id any more, and every stub naming it is pointing at a mindmap that no longer exists.

Or the referenced node can be removed from a mindmap that is still there. The user deletes a node from the Connections panel, or the item behind it is deleted from Zotero and `deletionCleanup` prunes the node. Either way the document id still resolves, but `homeNodeId` names nothing.

There is a third case that looks like staleness and isn't: a stub pointing at another mindmap's stub. That is dangling by design, because the rule is that a mindmap reaches into another mindmap's own membership, not into its borrowings. Following the chain would make a node's meaning depend on a path through several documents, any of which can break, and each hop would multiply the same problem. So only `member` nodes count as targets, and a chain gets one hop and no more.

## Reconciliation, not tracking

The module reads every mindmap in the library, builds the set of `(mindmap id, member node id)` pairs that exist right now, and drops every stub whose pair isn't in it, along with every link touching those stubs.

To that check, a deleted mindmap and a removed node are the same case. There is nothing to keep in step, nothing to invalidate, and no state that can go stale, because the answer gets recomputed from the documents every time.

The care is in the write. The dangling set gets recomputed a second time inside `updateMindmapDocument`'s callback, against the document as it stands at write time rather than the copy read at the start, because the Connections panel may have changed it in between. A document with nothing left to drop returns `null` from the mutation, which skips the write entirely, and the same skip happens up front for a document whose read copy had nothing dangling. A no-op run writes nothing at all, and the returned list of changed ids is what lets a caller confirm that.

The availability map is the one thing built once and reused across the whole call. A mindmap deleted mid-run would leave it slightly stale, in the direction of pruning a stub that is genuinely dangling by then, so nothing is lost.

## When pruning runs

Two triggers, both reactive.

`deletionCleanup` runs it once per affected library after its own node pruning, on any delete that named at least one ref, and only when it already found an external node somewhere in the library. That covers the "the deleted item was a mindmap's own storage note" case, which the notification can't describe: it carries a key, and the document that key named is gone (see [deletion-cleanup-explanation.md](deletion-cleanup-explanation.md)).

`connectionsPanel` runs it after the user removes a node, scoped to that item's library. That covers the case where the mindmap survives and one of its nodes doesn't.

There is no scheduled pass and no check on open. A stub that goes stale through a path neither trigger covers, such as a mindmap deleted on another device and synced in, stays in the document until the next delete or panel removal in that library. In the meantime it renders as a node with nothing behind it. That is the accepted cost of reconciling on demand instead of on every read, which would put a full registry scan in front of every mindmap open.

Running it twice is harmless, and the test suite leans on that: it deletes a mindmap, waits for the observer's own run, then calls the function again and asserts the same end state.

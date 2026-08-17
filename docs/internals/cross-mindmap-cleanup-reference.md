# Cross-mindmap cleanup reference

`src/modules/mindmap/crossMindmapCleanup.ts` exports one function. It drops external node stubs whose target no longer exists. For the reasoning see [cross-mindmap-cleanup-explanation.md](cross-mindmap-cleanup-explanation.md).

## `pruneDanglingExternalNodes`

```ts
function pruneDanglingExternalNodes(libraryID?: number): Promise<string[]>;
```

Returns the ids of the mindmaps it changed, in registry order. An empty array means nothing was dangling and nothing was written. `libraryID` is passed straight to `readAllMindmaps` and `updateMindmapDocument`, so omitting it means the user library.

### What counts as dangling

A node is dangling when all of the following hold:

- its `membership` is `"external"`;
- and either no mindmap in the library carries `homeMindmapId` as its document id, or that mindmap carries no **member** node with id `homeNodeId`.

Only member nodes count as a target. An external stub pointing at another mindmap's external stub is dangling by this rule, deliberately: a mindmap reaches into another mindmap's own membership, not into its borrowings. `test/mindmap/crossMindmapCleanup.test.ts` builds a three-mindmap chain (second borrows from first, third tries to borrow second's borrowing) and asserts only the third is pruned.

`member` nodes are never dangling, whatever their `ref` points at. A node whose Zotero item was deleted is [deletion cleanup](deletion-cleanup-reference.md)'s job, not this one's.

### What it does

Reads every mindmap in the library with `readAllMindmaps`, which skips notes that fail to parse. Builds a map from each document id to the set of its member node ids.

Then, per document: skips it entirely when no node in the copy just read is dangling, so a mindmap with nothing to drop is not written at all. Otherwise it calls `updateMindmapDocument` for that document id, and inside the mutation recomputes the dangling ids against the document as it stands at write time (the Connections panel can have changed it since the read). The mutation returns `null` when that recomputation finds nothing, so the write is skipped and the document id is left out of the return value.

Removal goes through `withoutNodes`, which drops the stubs and every link touching them. See [mutations-reference.md](mutations-reference.md).

The availability map is the one thing not recomputed at write time: it is built once at the start of the call from the documents read then.

### Side effects

Writes through `updateMindmapDocument`, so each changed document costs one queued task and one Zotero transaction. Nothing else is touched: not the mindmap being referenced, not the Zotero items or notes behind any ref, not the storage notes of unchanged mindmaps.

Since it goes through the storage queue, a Zotero notifier observer must not await it. See [notifier-queue-explanation.md](notifier-queue-explanation.md).

### Where it is called

`deletionCleanup.ts` runs it once per affected library after its own node pruning, on any delete that named at least one ref.

`connectionsPanel.ts` runs it after a user removes a node, scoped to `item.libraryID`.

Safe to run twice. The cross-mindmap test suite deletes a mindmap (which triggers the observer's run), drains the queue, then calls it again explicitly and asserts the end state either way.

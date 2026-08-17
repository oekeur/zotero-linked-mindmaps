# Layout reference

`src/modules/mindmap/layout.ts` computes positions for nodes that do not have one yet and persists the result. It operates on a bare `cytoscape.Core` plus the `MindmapDocument` that core was built from, with no Zotero item or label resolution of its own, which is what keeps it testable against a headless core.

Nodes that already have a stored position are never moved. The renderer does not call this; the mindmap tab calls it after [`renderMindmap`](rendering-reference.md) returns, and [`attachLiveRefresh`](rendering-reference.md) calls it again after each rebuild.

## Module constants

`NODE_SPACING = 160` is the distance between neighbouring grid cells and the unit the layout's bounding box is sized in. Nodes render 50px wide with a wrapped label centred on them, so 160 leaves a readable gap either side. Not exported.

`UNPLACED_SELECTOR = "[?unplaced]"` selects nodes whose `unplaced` data field is truthy. `buildNodeElement` sets that field when the stored position is unplaced or when the node id is in [`piledNodeIds`](schema-reference.md). Not exported.

## `gridPositions`

```ts
export function gridPositions(
  nodeIds: string[],
  box: { x1: number; y1: number; w: number; h: number },
): Map<string, Position>;
```

Deterministic grid placement inside `box`.

`nodeIds` is the set of nodes to place; the array is copied and sorted, so the caller's order does not matter and the same ids always produce the same arrangement. `box` supplies the top-left corner; `w` and `h` are accepted but not read, because the column count comes from the node count instead.

Columns are `max(1, ceil(sqrt(nodeIds.length)))`. The node at sorted index `i` gets `x = box.x1 + (i % columns) * 160` and `y = box.y1 + floor(i / columns) * 160`.

Returns a map from node id to position. No side effects, no Cytoscape interaction, no persistence.

The first sorted id lands exactly on `(box.x1, box.y1)`, which the tests assert alongside the reordering-invariance property.

## `layoutUnplacedNodes`

```ts
export async function layoutUnplacedNodes(
  cy: cytoscape.Core,
  doc: MindmapDocument,
): Promise<MindmapDocument | null>;
```

Runs a layout scoped to the unplaced nodes, applies the result to both the graph and the document, and persists it.

`cy` is the rendered core; nodes are selected out of it by the `unplaced` data field, not from `doc`. `doc` is the document the core was built from. The function writes the document it was handed rather than re-reading storage inside the write, because the caller reads storage immediately before calling and tests hand it a bare document that was never stored.

Returns the updated document, or `null` when no node was unplaced. A `null` return means nothing ran and nothing was written; reopening an already-laid-out mindmap triggers no layout at all, which the tests check by asserting no storage note exists afterwards.

### How an unplaced node gets a position

The unplaced collection is `cy.nodes("[?unplaced]")`. If it is empty, the function returns `null` immediately.

The bounding box comes from the node count, never from the container. Its side is `max(1, ceil(sqrt(unplacedCount))) * 160`. With no already-placed nodes the box is `{x1: 0, y1: 0, w: side, h: side}`. With some, it starts clear of them: `x1` is the placed nodes' bounding-box right edge plus 160, `y1` is their top edge. Passing the box explicitly is what keeps the layout off the container. Cose otherwise falls back to the container's viewport extent, and the mindmap tab renders and lays out immediately after `Zotero_Tabs.add()`, before the tab container has been measured; a zero-size viewport gives cose nowhere to spread and every node keeps the `(0,0)` it was rendered at, which then gets persisted as a real coordinate.

Already-placed nodes are locked for the duration (`placed.lock()` in a `try`, `placed.unlock()` in the `finally`), so cose cannot move them. The layout is cose with `fit: false`, `animate: false`, `randomize: false`, and the computed `boundingBox`, run over the unplaced collection only, awaited on its `layoutstop` event.

Each unplaced node's resulting `x` and `y` are copied out and passed through a `-0` normalizer. Cose can converge on `-0` for a coordinate (two symmetric unconnected nodes with no starting jitter); `-0` equals `0` numerically but survives `JSON.stringify` as `"0"`, so it is normalized before it can be persisted as a value nothing else in the codebase distinguishes from `0`.

The result is then checked for collisions with [`isCoincident`](schema-reference.md), which treats positions within 0.5 of each other as the same spot. Only collisions involving a node this run just placed count: two already-placed nodes sharing a spot is somewhere the user dragged them, and is not a reason to discard the layout's result for an unrelated new node. If any such collision exists, every position from this run is replaced by `gridPositions` over the same box, and the nodes are moved on the graph to match. Cose can still hand back a pile when every node starts at the same coordinate with no edges to push them apart, and persisting a pile is worse than an arbitrary arrangement because the pile then reads as a set of real positions.

Finally each laid-out node's `unplaced` data field is set to `false`, the document is rebuilt with the new positions merged in (nodes with no entry in the result map are returned unchanged), and [`writeMindmapDocument`](storage-reference.md) persists it. That write is serialized against every other storage operation.

### Recovering a persisted pile

A document whose nodes all sit on the origin counts as fully placed under `isUnplaced` alone, so no layout would ever run again and the pile would be permanent. `buildNodeElement` marks those nodes `unplaced` using `piledNodeIds`, which reports every placed node only when there are at least two of them and all of them are coincident with the origin. They are then handed back to this function on the next open. The rule is narrow on purpose: dragging persists where a node lands, so an overlap anywhere other than the origin can be one the user made deliberately, and the tests pin that down (a two-node overlap at `(20, 20)` returns `null` and writes nothing).

Repair converges. A document repaired once is not laid out again on reopen, which the test asserts by running the function twice.

## Related

- [rendering-reference.md](rendering-reference.md), the renderer that builds the core this consumes
- [schema-reference.md](schema-reference.md), `Position`, `isUnplaced`, `isCoincident`, `piledNodeIds`
- [storage-reference.md](storage-reference.md), `writeMindmapDocument`
- [../user-guide/node-layout-reference.md](../user-guide/node-layout-reference.md) and [../user-guide/node-layout-explanation.md](../user-guide/node-layout-explanation.md)
- [cytoscape-explanation.md](cytoscape-explanation.md), why layout tests need a real DOM

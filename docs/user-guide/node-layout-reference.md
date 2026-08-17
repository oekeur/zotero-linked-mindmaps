# Node layout and positions

Where nodes sit on the graph, how a new node gets its first position, and what is saved.

## Stored position

Every node in a mindmap carries a position: a pair of x/y coordinates, or nothing at all. A node with no coordinates yet is "unplaced".

Coordinates are in the graph's own space, not screen pixels. Panning and zooming the canvas do not change them.

Positions live in the mindmap's stored document alongside its nodes and links, so they sync with the rest of the mindmap and are the same on every device. See [storage](../internals/storage-reference.md).

## When a node is unplaced

A node is unplaced from the moment it is created until a layout places it. Nodes are created without a position by every route that adds one:

- "Add to mindmap" in the library right-click menu.
- Saving a link whose source or target is not yet a node.
- A link into another mindmap creating the borrowed-node stub.

An unplaced node is drawn at the origin until the layout runs, which happens as part of the same open.

## Placing unplaced nodes

Opening a mindmap, and every redraw of it, ends with one placement pass:

1. Nodes that already have a position are locked in place.
2. Cytoscape's `cose` force-directed layout runs over the unplaced nodes only, inside a bounding box sized from their count: `ceil(sqrt(count)) * 160` on a side. When the mindmap already has placed nodes, that box starts 160 units to the right of them, so new nodes land clear of the existing arrangement rather than on top of it.
3. If any node the pass just placed ends up within 0.5 units of another node it placed, or of an already-placed node, the whole pass is thrown away and replaced by a deterministic grid: nodes sorted by id, `ceil(sqrt(count))` columns, 160 units between neighbours, inside the same box.
4. The resulting positions are written to the mindmap.

The pass does nothing at all when every node already has a position: no layout runs, and nothing is written. Reopening a laid-out mindmap therefore never rearranges it.

The layout only ever moves unplaced nodes. It cannot move a node you positioned yourself.

## Pile recovery

A mindmap where every placed node sits on the origin (within 0.5 units) is treated as unplaced on the next render, and the whole set goes back through the placement pass.

That state is what a layout with no room to spread writes, and without this rule it would be permanent: every node has a position, so no further layout would ever run.

The rule is deliberately narrow. It needs at least two placed nodes, and it needs all of them on the origin. Two nodes overlapping anywhere else are left alone, because dragging a node saves where it lands and any other overlap can be one you made on purpose. A mindmap with a single node keeps whatever position that node has.

## Dragging

Drag a node to move it. The position where you release it is saved.

Details that matter:

- One drag gesture produces one save, even when it moved several selected nodes at once.
- A drag that ends where it started saves nothing.
- The graph does not redraw after a drag save, so nodes do not jump or flash.
- A group's dashed region cannot be dragged. Moving it would carry every member along and rewrite positions you set deliberately. Drag the members instead.
- A failed save is reported only to Zotero's debug output. The graph then redraws from what was actually stored, so the node snaps back to its old spot with no message.

There is no undo for a move, and no way to reset a mindmap's layout short of clearing positions by hand in the stored document.

## What does not affect positions

Grouping, ungrouping, renaming a group, and removing a node from a group all leave positions untouched. A group's region is drawn around wherever its members already are.

Adding a link between two existing nodes does not move either of them.

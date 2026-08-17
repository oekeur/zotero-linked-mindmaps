# Why node positions are stored

A graph view has two ways to decide where nodes go. It can run a layout algorithm every time it opens, or it can remember where the nodes were. Zotero Linked Mindmaps remembers.

## Spatial memory is the point

A mindmap is something you build up over months and come back to. You remember that the methodology papers ended up bottom-left and the one contradicting source sits off on its own to the right. That memory is worth more than any arrangement an algorithm can compute, because it encodes what you were thinking when you put them there.

A force-directed layout recomputes on every open. Add one node and everything shifts; the arrangement you knew is gone, and the layout has no way to know it destroyed anything. For a graph you read once that is fine. For one you return to, it throws away the part you contributed.

So the layout runs once per node, to give it a starting position, and never again. Everything after that is yours: drag a node and where it lands is what is stored.

## The layout is a fallback, not a design

Placement exists for a narrow job: a node that has just been added has to appear somewhere, and the origin is a bad answer once there is more than one of them.

That job is scoped as tightly as it can be. The pass runs over unplaced nodes only, with every positioned node locked. It cannot move something you placed. It cannot rearrange the mindmap. A mindmap where every node has a position triggers no layout at all, so reopening it is a pure read.

The cost of that scoping is that new nodes land in a block off to the side of the existing arrangement rather than woven into it by their links. That is the right trade: a mildly awkward starting position is easy to fix by dragging, while a rearranged mindmap is not fixable at all.

## Why the grid exists behind the force layout

Force-directed layouts push connected nodes apart along their edges. Nodes with no edges have nothing pushing them, and a batch of freshly added nodes usually has no edges yet: "Add to mindmap" on a dozen library items creates twelve nodes and zero links.

Run `cose` on twelve unconnected nodes starting from the same coordinate and it can hand back twelve nodes on that same coordinate. Nothing is wrong with the algorithm; there is no force in the system to separate them.

Persisting that outcome is worse than persisting an arbitrary one, because a pile reads as a set of real positions. Nothing downstream can tell it apart from twelve nodes you deliberately stacked, so no later pass would fix it.

The plugin therefore checks its own result. If any node it just placed landed on another one, it discards the whole layout and lays the batch out on a plain grid instead: sorted by node id, square-ish, evenly spaced. The grid is dull and it is deterministic, which is exactly what a fallback should be. Rebuilding the same document twice produces the same grid.

## The coincidence tolerance

"Landed on another one" is judged with a tolerance of 0.5 units in each axis rather than exact equality.

Exact equality would be the wrong test. A force layout does floating-point arithmetic, so two nodes that are visually identical in position can differ in the twelfth decimal place, and an exact test would call that a successful spread. Nodes render 50 units wide, so anything closer than 0.5 units is one node hiding another.

The tolerance also stays small on purpose. It is a test for "these are the same point", not for "these are too close together". Nodes 10 units apart overlap heavily on screen and the plugin does not care, because that is a position a user can reach by dragging and undoing their work would be worse than the overlap.

## Recovering a mindmap that stored a pile

Storing positions has one failure mode that storing nothing does not: a bad position is permanent, because a node with a position is a node the layout leaves alone.

That failure was reachable. Rendering the mindmap tab starts a layout immediately after Zotero creates the tab container, before the container has been measured, and a force layout given a zero-size viewport has nowhere to spread. It writes every node onto the origin, and every open after that reads back a fully placed mindmap and does nothing.

The layout now gets an explicit bounding box computed from the node count, so it no longer depends on the container having been measured. The pile-recovery rule is the second half of the fix, for documents that stored a pile before that: on open, a mindmap whose placed nodes are all on the origin hands them all back to the layout.

That rule is narrow by design. It fires only when every placed node is on the origin and there are at least two of them, which is a state no user gesture produces and only a layout with no room produces. Any other overlap is left alone, because the plugin cannot distinguish a bad layout from an arrangement you meant, and guessing wrong would silently rearrange work.

## What this costs

Positions are part of the stored mindmap, so they sync, and two devices editing the same mindmap can conflict over them the same way they can conflict over anything else in the document. Dragging a node writes to the mindmap's storage note; the last write wins.

Positions also outlive the thing they were for. Remove a node and its position goes with it, but a mindmap that has been reshaped heavily over time keeps positions chosen against a graph that no longer looks like that. Nothing recomputes them, by design, and re-laying out an existing mindmap is not something the plugin offers.

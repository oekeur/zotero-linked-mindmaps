# Why node positions are stored

A graph view has two ways to decide where nodes go. It can run a layout algorithm every time it opens, or it can remember where the nodes were. Zotero Linked Mindmaps remembers.

## Spatial memory is the point

A mindmap is something you build up over months and keep coming back to. You remember that the methodology papers ended up bottom-left, and that the one contradicting source sits off on its own to the right. That memory is worth more than any arrangement an algorithm can compute, because it encodes what you were thinking when you put them there.

A force-directed layout recomputes on every open. Add one node and everything shifts, the arrangement you knew is gone, and the layout has no idea it destroyed anything. For a graph you read once, fine. For one you return to, it throws away the part you contributed.

So the layout runs once per node, to give it a starting position, and never runs on it again. Everything after that is yours. Drag a node and where it lands is what gets stored.

## The layout is only a fallback

Placement exists for a narrow job. A node that has just been added has to appear somewhere, and the origin is a bad answer as soon as there is more than one of them.

That job is scoped as tightly as it will go. The pass runs over unplaced nodes only, with every positioned node locked. It cannot move anything you placed. It cannot rearrange the mindmap. And a mindmap where every node already has a position triggers no layout at all, so reopening it is a pure read.

The cost of scoping it that tightly is that new nodes land in a block off to the side of the existing arrangement, rather than woven into it by their links. That trade is worth making. A mildly awkward starting position takes one drag to fix; a rearranged mindmap can't be fixed at all.

## Why the grid exists behind the force layout

Force-directed layouts push connected nodes apart along their edges. Nodes with no edges have nothing pushing them, and a batch of freshly added nodes usually has no edges yet. "Add to Mindmap" on a dozen library items creates twelve nodes and zero links.

Run `cose` on twelve unconnected nodes all starting from the same coordinate and it can hand you back twelve nodes on that same coordinate. Nothing is wrong with the algorithm. There is simply no force in the system to separate them.

Persisting that outcome would be worse than persisting an arbitrary one, because a pile reads as a set of real positions. Nothing downstream can tell it apart from twelve nodes you deliberately stacked, so no later pass would ever fix it.

The plugin therefore checks its own result. If any node it just placed landed on another one, it throws the whole layout away and lays the batch out on a plain grid: sorted by node id, square-ish, evenly spaced. The grid is dull and it is deterministic, which is what you want from a fallback. Rebuild the same document twice and you get the same grid.

## The coincidence tolerance

"Landed on another one" is judged with a tolerance of 0.5 units in each axis instead of exact equality.

Exact equality would be the wrong test. A force layout does floating-point arithmetic, so two nodes that are visually identical in position can differ in the twelfth decimal place, and an exact test would happily call that a successful spread. Nodes render 50 units wide, so anything closer than 0.5 units means one node is hiding another.

The tolerance stays small on purpose too. It tests for "these are the same point", not for "these are too close together". Nodes 10 units apart overlap heavily on screen and the plugin doesn't care, because that is a position you can reach by dragging, and undoing your work would be worse than the overlap.

## Recovering a mindmap that stored a pile

Storing positions has one failure mode that storing nothing doesn't have: a bad position is permanent, because a node with a position is a node the layout leaves alone.

That failure used to be reachable. Rendering the mindmap tab starts a layout immediately after Zotero creates the tab container, before the container has been measured, and a force layout handed a zero-size viewport has nowhere to spread. It wrote every node onto the origin, and every open after that read back a fully placed mindmap and did nothing about it.

The layout now gets an explicit bounding box computed from the node count, so it no longer depends on the container having been measured. Pile recovery is the second half of that fix, for documents that stored a pile before it landed: on open, a mindmap whose placed nodes all sit on the origin hands them back to the layout.

That rule stays deliberately narrow. It fires only when every placed node is on the origin and there are at least two of them, which is a state no user gesture produces and a layout with no room produces every time. Any other overlap gets left alone, because the plugin can't tell a bad layout from an arrangement you meant, and guessing wrong would silently rearrange your work.

## What this costs

Positions are part of the stored mindmap, so they sync, and two devices editing the same mindmap can conflict over them the same way they conflict over anything else in the document. Dragging a node writes to the mindmap's storage note, and the last write wins.

Positions also outlive the thing they were chosen for. Remove a node and its position goes with it, but a mindmap that has been reshaped heavily over time will still be carrying positions picked against a graph that no longer looks like that. Nothing recomputes them, by design, and the plugin offers no way to re-lay-out an existing mindmap.

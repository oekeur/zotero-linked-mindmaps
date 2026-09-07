# Group nodes on a mindmap

Grouping draws a labelled region around a set of nodes. For what a group is and what it does not do, see [groups](grouping-reference.md).

All of it happens on the graph canvas in the Mindmap tab.

## Group several nodes

1. Open the mindmap in the Mindmap tab.
2. Select the nodes: Shift-click each one in turn, or hold Shift and drag a box across them. Each selected node gets a highlighted border, so you can see the selection growing as you go.
3. Right-click one of the selected nodes, or right-click empty canvas.
4. Click "Group selected nodes". From a selected node, it appears next to "Add link"; from empty canvas, it's the only item on the menu.

A tinted region appears around the nodes, in a colour of its own, and each node picks up a dot in that colour. The group has no name yet, so its label is blank. Renaming it is the next section.

Two nodes is enough to group. Right-clicking a node that isn't itself part of the selection only offers "Add link" - to reach "Group selected nodes" from a node, right-click one of the selected ones.

Your nodes stay exactly where they were. Grouping never rearranges anything.

## Name a group, or rename it

1. Right-click anywhere on the group's region, not on one of its nodes.
2. Type the name into the text field at the top of the menu. The field starts with the current name.
3. Click "Rename group".

The name appears above the region.

Clearing the field and clicking "Rename group" does nothing at all. A blank name reads as you backing out of the field rather than asking for an unnamed group. If you genuinely want the name gone, ungroup and group the nodes again.

## Ungroup

1. Right-click the group's region.
2. Click "Ungroup".

The region disappears. Its members stay where they were, keep every link they had, and keep every other group they were in, so the only thing you lose is the fact that they were clustered by this one.

There's no undo, though. To get the group back you select the nodes, group them again, and retype the name.

## Take one node out of a group

The graph's own menu has no per-node ungroup, so use the Mindmaps section:

1. Click the node on the graph. The dock opens on the right of the tab.
2. Click the "Remove from ..." button naming the group you want it out of.

There's one button per group the node is in, and a node in no group gets none. Leaving one group leaves the node's other groups alone. The group and its remaining members are left alone too, and the region reshapes itself to fit what's left.

You'll find the same button in the item pane's Mindmaps section, so you can do this from the library without opening the mindmap at all. See [the Mindmaps section](mindmaps-panel-howto.md).

## Put a node in a second group

Select it together with whatever else belongs in the new group and use "Group selected nodes". It joins the new group and stays in the ones it was already in. A source can be both a chapter-3 source and a methodology one, and nothing makes you choose.

The node then carries one dot per group it's in, each in that group's colour, so you can tell at a glance which groups share it. Where two regions overlap, the tints mix into a colour that isn't either group's - the dots are what answer "which two".

To move a node rather than copy it, do both steps: group it into the new one, then use "Remove from ..." for the old one.

Watch out for one thing here: "Group selected nodes" always creates a new group rather than extending an existing one. The old group's name doesn't carry over, and a group stops being drawn once it has no members left, so you'll want to retype the name on the new one.

## Move a group somewhere else on the canvas

Drag its members. The region itself can't be dragged, because dragging it would move every member at once and overwrite positions you set deliberately.

Drag a member out of the region and the region shrinks to fit the rest. The node stays in the group however far you drag it, since membership has nothing to do with position.

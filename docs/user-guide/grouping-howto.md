# Group nodes on a mindmap

Grouping draws a labelled region around a set of nodes. For what a group is and what it does not do, see [groups](grouping-reference.md).

All of it happens on the graph canvas in the Mindmap tab.

## Group several nodes

1. Open the mindmap in the Mindmap tab.
2. Select the nodes: Shift-click each one in turn, or hold Shift and drag a box across them.
3. Right-click on empty canvas, away from any node.
4. Click "Group selected nodes".

A dashed region appears around the nodes. It has no name yet, so its label is blank; rename it next.

Nothing appears on right-click when fewer than two nodes are selected. Check the selection if the menu does not open.

The nodes stay exactly where they are. Grouping never rearranges anything.

## Name a group, or rename it

1. Right-click anywhere on the group's dashed region, not on one of its nodes.
2. Type the name into the text field at the top of the menu. The field starts with the current name.
3. Click "Rename group".

The name appears above the region.

Clearing the field and clicking "Rename group" does nothing: a blank name is read as backing out of the field, not as a request for an unnamed group. To lose the name, ungroup and group the nodes again.

## Ungroup

1. Right-click the group's dashed region.
2. Click "Ungroup".

The region disappears. Its members stay where they were and keep every link they had. Only the fact that they were clustered goes away.

There is no undo. Regrouping means selecting the nodes and grouping them again, then retyping the name.

## Take one node out of a group

The graph's own menu has no per-node ungroup. Use the Connections panel:

1. Click the node on the graph. The dock opens on the right of the tab.
2. Click "Remove from group".

That button only appears when the node is in a group. The group and its remaining members are untouched, and the region reshapes to fit what is left.

The same button is in the item pane's Connections section, so you can do this from the library without opening the mindmap. See [the Connections panel](connections-panel-howto.md).

## Move a node into a different group

Select it together with the nodes of the target group and use "Group selected nodes". A node is in at most one group, so it moves rather than joining both.

That creates a new group rather than extending the existing one, so the old group's name is not carried over, and the old group stops being drawn once it has no members left. Retype the name on the new group.

## Move a group somewhere else on the canvas

Drag its members. The region itself cannot be dragged: dragging it would move every member at once and overwrite positions you set deliberately.

Dragging a member out of the region shrinks the region to fit the rest. The node stays in the group however far you drag it; membership is not positional.

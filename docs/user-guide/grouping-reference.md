# Groups

A group is a visual cluster of nodes on one mindmap: a dashed region drawn around them with an optional name above it.

A group makes no claim about how its members relate. It says they belong together, which is a different statement from any link between them, and it adds nothing to the link vocabulary. Use a group for "these are the sources for chapter 3"; use a link for "this one contradicts that one". See [link types](link-types-explanation.md).

## What a group holds

| Property | Detail                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Id       | Generated when the group is created. Not shown anywhere in the interface.                                 |
| Name     | Optional. A group created from the graph has no name until you rename it, and renders with a blank label. |
| Members  | Recorded on the nodes, not on the group: each node carries the id of the group it is in.                  |

Groups live inside one mindmap's stored document. A group cannot span two mindmaps, and a node borrowed from another mindmap can be put in a group on the mindmap it was borrowed into.

## Membership rules

A node is in at most one group. Grouping a node that is already in another group moves it into the new one rather than putting it in both. Overlapping groups are not supported.

That falls out of how a group is drawn (a graph node has one parent container) rather than from a product decision, so it is the first thing that would have to change if overlapping groups were ever wanted.

A group needs two or more nodes to be created; two is enough. The grouping menu does not appear for a single selected node: a group of one says nothing the node does not already say.

A group can end up with one member afterwards, by removing the others from it. It still renders.

A group with no members left is not drawn at all. Its record stays in the stored document, but nothing in the interface shows it or can act on it.

## How groups render

The group is drawn as a dashed round rectangle behind its members, with a pale low-opacity fill and its name centred above the cluster. It reads as a backdrop rather than as another node sitting among the others.

The region is sized to fit its members wherever they already are. Grouping never moves a node, and neither does ungrouping.

The region cannot be dragged. Dragging it would carry every member along and rewrite positions you set deliberately, so the region is fixed and its members are draggable individually. Moving a member out from under the region reshapes the region to follow it.

Clicking a group's region does nothing: there is no Zotero item behind it, so it does not open the dock. Right-clicking it opens the group menu.

"Group selected nodes" is reached two ways: right-click one of the selected nodes (it appears alongside "Add link"), or right-click empty canvas while two or more nodes are selected. Right-clicking a node that is not part of the selection offers only "Add link".

A selected node - shift-clicked, or caught in a shift-drag box - gets a highlighted border. That's the only feedback selection gives before you group anything, so it's what to check if a click or drag seems to have done nothing.

## Controls

| Where                                                        | Control                        | Effect                                                                      |
| ------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------- |
| Right-click a node that's part of a selection of two or more | "Group selected nodes"         | Creates an unnamed group holding the selection.                             |
| Right-click empty canvas with a selection of two or more     | "Group selected nodes"         | Creates an unnamed group holding the selection.                             |
| Right-click on a group's region                              | Text field plus "Rename group" | Sets the group's name. A blank field leaves the name unchanged.             |
| Right-click on a group's region                              | "Ungroup"                      | Removes the group. Members keep their positions and their links.            |
| Mindmaps section, for a node in a group                      | "Remove from group"            | Takes that one node out of its group. The group and its other members stay. |

Everything above is mouse-driven; there are no keyboard equivalents.

A grouping change is saved immediately and the graph redraws from what was stored. A failed save is logged but not shown in the interface, so a change that did not land reverts on screen with no message.

## Related

[Grouping how-to](grouping-howto.md) for the steps.

[Node layout](node-layout-reference.md) for why grouping leaves positions alone.

[Mindmaps section](mindmaps-panel-reference.md) for the "Remove from group" control.

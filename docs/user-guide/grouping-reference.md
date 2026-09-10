# Groups

A group is a visual cluster of nodes on one mindmap: a tinted region drawn over them with an optional name above it.

A group makes no claim about how its members relate. It says they belong together, which is a different statement from any link between them, and it adds nothing to the link vocabulary. Use a group for "these are the sources for chapter 3"; use a link for "this one contradicts that one". See [link types](link-types-explanation.md).

## What a group holds

| Property | Detail                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Id       | Generated when the group is created. Not shown anywhere in the interface.                                 |
| Name     | Optional. A group created from the graph has no name until you rename it, and renders with a blank label. |
| Members  | Recorded on the nodes, not on the group: each node carries the ids of the groups it is in.                |

Groups live inside one mindmap's stored document. A group cannot span two mindmaps, and a node borrowed from another mindmap can be put in a group on the mindmap it was borrowed into.

## Membership rules

A node can be in any number of groups. Grouping a node that is already in another group adds the new membership and keeps the old one, so "chapter 3" and "methodology" can both cover the same source. Groups overlap wherever they share a member.

Removing a node from one group leaves its other memberships alone, and ungrouping affects only the group you ungrouped.

A group needs two or more nodes to be created; two is enough. The grouping menu does not appear for a single selected node: a group of one says nothing the node does not already say.

A group can end up with one member afterwards, by removing the others from it. It still renders.

A group with no members left is not drawn at all. Its record stays in the stored document, but nothing in the interface shows it or can act on it.

## How groups render

The group is drawn behind its members as a tinted region: a rounded halo around each member, joined by bands running between them. The group's name sits above the topmost member. It reads as a backdrop rather than as another node sitting among the others.

The region follows the members rather than boxing them in. That matters because grouping never moves a node, and neither does ungrouping: members sit wherever the layout or you left them, and a box fitted around scattered members would cover most of the canvas and take in everything between them.

The region takes in no node that is not a member. A band that would run over one is left out, which can leave a widely spread group drawn as two or more separate patches, and a halo stops short of a non-member standing close by. The one exception is a node overlapping a member on screen, where there is no room to stop short.

Each group draws in its own colour, taken in turn from a set of six and repeating past the sixth group. Where two regions overlap their tints mix, so the mixed colour names neither group. What answers that is the row of dots under each node in a group: one dot per group it is in, each in that group's colour, drawn at full strength so it never mixes. A node with two dots is in two groups, and the dot colours say which two.

Group names are placed so they do not cover each other. A name sits above its region's topmost member; where that would put two names in the same place, the lower one drops by a line.

The region redraws while a member is being dragged, not when the drag ends.

The region is not clickable and does not take the pointer: clicking it selects nothing and does not open the dock, and a click passes through to whatever is under it. Right-clicking the region opens the group menu, unless the pointer is over one of its members, in which case that node's own menu opens instead.

"Group selected nodes" is reached two ways: right-click one of the selected nodes (it appears alongside "Add link"), or right-click the canvas while two or more nodes are selected. Right-clicking a node that is not part of the selection offers only "Add link".

A right-click inside a region while two or more nodes are selected offers all three: "Group selected nodes", the rename field and "Ungroup". The click is not made to mean one thing or the other.

A selected node - shift-clicked, or caught in a shift-drag box - gets a highlighted border. That's the only feedback selection gives before you group anything, so it's what to check if a click or drag seems to have done nothing.

## Controls

| Where                                                        | Control                        | Effect                                                                                                 |
| ------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Right-click a node that's part of a selection of two or more | "Group selected nodes"         | Creates an unnamed group holding the selection.                                                        |
| Right-click empty canvas with a selection of two or more     | "Group selected nodes"         | Creates an unnamed group holding the selection.                                                        |
| Right-click inside a group's region                          | Text field plus "Rename group" | Sets the group's name. A blank field leaves the name unchanged.                                        |
| Right-click inside a group's region                          | "Ungroup"                      | Removes the group. Members keep their positions and their links.                                       |
| Mindmaps section, for a node in a group                      | "Remove from ..."              | One button per group the node is in, each naming its group. Takes the node out of that one group only. |

Everything above is mouse-driven; there are no keyboard equivalents.

A grouping change is saved immediately and the graph redraws from what was stored. A failed save is logged but not shown in the interface, so a change that did not land reverts on screen with no message.

## Related

[Grouping how-to](grouping-howto.md) for the steps.

[Node layout](node-layout-reference.md) for why grouping leaves positions alone.

[Mindmaps section](mindmaps-panel-reference.md) for the "Remove from group" control.

[Why grouping is stored on the node](../internals/grouping-explanation.md) for how membership is recorded and why an emptied group leaves a record behind.

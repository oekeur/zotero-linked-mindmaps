# Cross-mindmap links reference

A link whose other end is a node belonging to a different mindmap. The link is drawn against a stub, called an external node, standing in for that node on this mindmap.

## How one is created

From the add-link form's second target button, "Link to another mindmap…" ([links-add-reference.md](links-add-reference.md)). It reveals two dropdowns:

The first lists every mindmap in the library except the one being edited. Excluding the current one is deliberate: a link inside this mindmap is what the ordinary "Choose target…" button is for. With no other mindmap in the library, the message "No other mindmaps yet." appears instead of the dropdowns.

The second lists that mindmap's own member nodes, by the same labels the graph uses, minus any node standing for the item the form was opened for. External stubs in the other mindmap are not offered either, so a mindmap can only lend out what belongs to it, and a chain of stubs pointing at stubs cannot be built.

Saving writes two things into the mindmap being edited, and nothing at all into the other one:

- An external node carrying the target's Zotero reference plus the pair (home mindmap id, home node id), with no position yet.
- An ordinary link pointing at that external node's local id.

An external node for the same (mindmap, node) pair is reused rather than duplicated, so linking to the same borrowed node a second time adds a link and no second stub.

A self-link is refused on this route as it is on the local one, and refused twice over. The node dropdown never offers a node standing for the source item, so there is nothing to pick; a selection that turns into one anyway between picking and saving (the other mindmap changed under the form) is discarded at save, writing neither the stub nor the link. Neither refusal prints a message: the local route's "An item can't be linked to itself." belongs to the item picker, and this route has nothing to reject.

## How they render

An external node is drawn on the graph as an ordinary node with two differences: a paler fill and a dashed two-pixel border. Shape and size are unchanged, and the label resolves exactly as any other node's does (item title, note preview, or "(missing item)").

The links themselves are drawn as ordinary edges. Type, name, direction and parallel-edge fanning all behave the same as for a link between two local nodes.

An external stub is a full node on this mindmap in every other respect: it can be dragged and its position persists, it can be put in a group, and it takes a parent-child connector to an item node when the stub stands for that item's child note.

## Limits

A cross-mindmap link is one-directional in terms of ownership. The mindmap you authored it in holds it; the other mindmap has no record of it and shows nothing. Opening the other mindmap gives no indication that anything points at it.

Nothing keeps a stub's label in step with a change on the other side beyond what the Zotero item itself provides. The stub carries a reference to the Zotero object, so a retitled item reads correctly, but a node moved, grouped or renamed in its home mindmap does not affect the stub.

A stub can outlive what it points at, because nothing tells this mindmap when the other one changes. Deleting the other mindmap, or removing that node from it, leaves a stub pointing at nothing until a reconciliation pass runs.

## When dangling stubs are cleaned up

Reconciliation reads every mindmap in the library, works out which (mindmap, node) pairs still exist, and drops every external stub pointing at a pair that does not, along with every link touching such a stub. A mindmap with nothing to drop is not written at all.

It runs at two moments:

- After "Remove from mindmap" in the Mindmaps section, scoped to that item's library.
- After Zotero reports an item deletion the plugin cleans up for, which is also what covers a deleted mindmap, since a mindmap is deleted by deleting its storage note.

It does not run on opening a mindmap or on a timer. Between the change and the next trigger, a stale stub stays on the graph and is drawn like any other external node.

## Related

- [cross-mindmap-links-howto.md](cross-mindmap-links-howto.md)
- [cross-mindmap-links-explanation.md](cross-mindmap-links-explanation.md)
- [node-overview-reference.md](node-overview-reference.md)

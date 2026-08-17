# Link to a node in another mindmap

Use this when the item you want to point at already belongs to a different mindmap and you want the relation recorded here without moving it. What gets written is described in [cross-mindmap-links-reference.md](cross-mindmap-links-reference.md).

## Steps

1. Open the add-link form for the item the link starts from, from any of its entry points ([links-add-howto.md](links-add-howto.md)).
2. Check which mindmap the form is writing to. That is the mindmap named after "Mindmap:" at the top of the panel, or the one you picked from the library context menu. The link and the stub both land there. Only when the item is in no mindmap yet does the form ask, under "Add to mindmap:"; pick one and click "Continue".
3. Choose the link type, and fill in Name and Direction if you want them.
4. Click "Choose from another mindmap" instead of "Choose target".
5. Pick the other mindmap in the first dropdown. Its member nodes load into the second one.
6. Pick the node in the second dropdown. The chosen target appears next to the buttons as the node's name with the mindmap's title in parentheses, and "Save" becomes available.
7. Click "Save".

The graph for the mindmap you were editing now shows the borrowed node with a dashed border, connected by the link you authored.

## If the button reports "No other mindmaps to link to yet."

The library holds only the mindmap you are editing. Create the second one first, from the mindmap tab's sidebar ([mindmaps-manage-howto.md](mindmaps-manage-howto.md)), and add the target item to it.

## If the node you want is not in the second dropdown

The dropdown lists only nodes that belong to the other mindmap. Three cases produce a missing entry:

- The item is not on that mindmap at all. Add it there first ([library-menu-howto.md](library-menu-howto.md)), then come back.
- The node in that mindmap is itself borrowed from a third mindmap. Borrowed nodes are not offered on. Link to the mindmap that actually owns the node instead.
- The node stands for the item you are linking from. Borrowing it would put that one item on the graph twice, so it is left out. A dropdown that ends up empty for this reason leaves "Save" disabled.

## Undoing one

Remove the link from the Connections panel with its "Remove" button, or remove the stub node itself with "Remove from mindmap" while the stub is selected on the graph. Removing the stub takes every link touching it. Neither touches the other mindmap.

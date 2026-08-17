# Create, rename and delete mindmaps

All of it happens in the Mindmap tab's sidebar, and only there. No menu entry, no preferences pane, no library right-click route.

Expand the sidebar with `›` first if it's collapsed, since every control below is hidden while it is.

## Create a mindmap

1. Open the Mindmap tab (File, then "Mindmap", or Shift+G).
2. Click "New" below the last row of the mindmap list.
3. Type a title into "Title".
4. Optionally type a "Description (optional)".
5. Click "Save".

The list comes back with the new mindmap in it and the graph switches over to it, empty of nodes and links.

A blank title gets rejected, and rather unhelpfully: "Save" simply does nothing, the form stays open, and no message explains why. Type something and save again.

Titles don't have to be unique. Two mindmaps with the same title are two separate mindmaps, and in the list only their descriptions tell them apart.

Opening the Mindmap tab in a library with no mindmaps creates one for you, titled "Mindmap". If that's the one you wanted, rename it rather than making a second.

There's one exception, and it's the important one. When the library's plugin data is in the trash, the tab creates nothing and warns you instead: "Mindmap data for this library is in the trash. Nothing new was created - restore it to get your mindmaps back." Your mindmaps are still there and out of the plugin's reach until you restore the trashed item. See [plugin data](plugin-data-howto.md).

## Rename a mindmap, or change its description

1. Click "Edit" on the mindmap's row.
2. Change "Title", "Description (optional)", or both.
3. Click "Save".

Nothing else moves. Your nodes, links, groups and node positions are all untouched, and only the title and description change.

Clear the description and save and it goes, leaving the row showing just the title.

"Edit" acts on the row you clicked, not on whatever the graph happens to be drawing. So you can edit a mindmap you aren't looking at and the graph stays where it was.

Click "Cancel" to leave the form without saving.

## Delete a mindmap

1. Click "Delete" on the mindmap's row.
2. A dialog titled "Delete mindmap" asks: `Delete "<title>"? Its links and layout go with it. The items and notes it points at stay in your library.`
3. Confirm.

The row disappears. If you deleted the mindmap the graph was showing, the tab loads the first mindmap in the list instead, or shows "No mindmaps yet. Create one to start linking items." if that was the last one.

### What deletion removes

Everything that lived inside the mindmap: its nodes, its links, its groups, and every node position you set by dragging.

The Zotero note the mindmap was stored in gets erased outright rather than moved to the trash, so there's nothing in the trash to recover afterwards. Delete the library's last mindmap and the "Zotero Linked Mindmaps (plugin data)" container item that held it goes too, leaving no plugin row behind. See [plugin data](plugin-data-reference.md).

### What deletion leaves alone

Every Zotero item and note the mindmap pointed at. Those are separate objects that the mindmap only ever referenced, and deleting it never touches them.

Other mindmaps too, nodes and links included. There's one exception worth knowing about: a link in another mindmap that reached into a node of the deleted one now has nothing to point at, and the stub standing in for it gets dropped the next time reconciliation runs. See [cross-mindmap links](cross-mindmap-links-explanation.md).

### Recovering from a deletion

You can't. There's no undo, and the storage note is erased rather than trashed, so Zotero's trash holds nothing to restore.

And if the library syncs and another device still has the deleted mindmap's note in its own copy, the deletion will propagate there too once that device syncs.

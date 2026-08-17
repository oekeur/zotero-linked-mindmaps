# Create, rename and delete mindmaps

All of it happens in the Mindmap tab's sidebar. There is no other place to manage mindmaps: no menu entry, no preferences pane, no library right-click route.

Expand the sidebar first with `›` if it is collapsed. Every control below is hidden while it is collapsed.

## Create a mindmap

1. Open the Mindmap tab (File, then "Mindmap", or Shift+G).
2. Click "New" below the last row of the mindmap list.
3. Type a title into "Title".
4. Optionally type a "Description (optional)".
5. Click "Save".

The list comes back with the new mindmap in it, and the graph switches to it. A new mindmap starts with no nodes and no links.

A blank title is rejected: "Save" does nothing and the form stays open with no message. Type something and save again.

Titles are not required to be unique. Two mindmaps with the same title are two separate mindmaps, told apart only by their descriptions in the list.

Opening the Mindmap tab in a library with no mindmaps creates one for you, titled "Mindmap". Rename it rather than making a second one if that is the one you want.

## Rename a mindmap, or change its description

1. Click "Edit" on the mindmap's row.
2. Change "Title", "Description (optional)", or both.
3. Click "Save".

The mindmap's nodes, links, groups and node positions are untouched. Only the title and the description change.

Clearing the description and saving removes it; the row then shows only the title.

"Edit" acts on the row you clicked, not on the mindmap currently drawn in the graph. Editing a mindmap you are not looking at leaves the graph where it was.

Click "Cancel" to leave the form without saving.

## Delete a mindmap

1. Click "Delete" on the mindmap's row.
2. A dialog titled "Delete mindmap" asks: `Delete "<title>"? Its links and layout go with it. The items and notes it points at stay in your library.`
3. Confirm.

The row disappears. If you deleted the mindmap the graph was showing, the tab loads the first mindmap in the list, or shows "No mindmaps yet. Create one to start linking items." when that was the last one.

### What deletion removes

Everything that lives inside the mindmap: its nodes, its links, its groups, and every node position you set by dragging.

The Zotero note the mindmap was stored in is erased outright rather than moved to the trash, so it cannot be recovered from the trash afterwards. Deleting the library's last mindmap also removes the "Zotero Linked Mindmaps (plugin data)" container item that held it, leaving no plugin row behind. See [plugin data](plugin-data-reference.md).

### What deletion leaves alone

Every Zotero item and note the mindmap pointed at. Those are separate objects; the mindmap only referenced them and deleting it never opens them.

Other mindmaps, including their nodes and links. One exception is worth knowing about: a link in another mindmap that reached into a node of the deleted one has nothing left to point at, and the stub standing in for it is dropped when that reconciliation runs. See [cross-mindmap links](cross-mindmap-links-explanation.md).

### Recovering from a deletion

There is no undo. The storage note is erased, not trashed, so Zotero's trash holds nothing to restore.

If the library syncs and another device still holds the deleted mindmap's note in its own copy, the deletion propagates there as well once that device syncs.

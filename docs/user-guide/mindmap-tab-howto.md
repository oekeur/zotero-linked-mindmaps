# Work with the Mindmap tab

Opening, moving around, and closing the tab. For what each control is, see the [mindmap tab reference](mindmap-tab-reference.md).

## Open the tab

Either:

1. Open the File menu.
2. Click "Mindmap".

Or press Shift+G. The shortcut is ignored while the cursor is in a text field, a search box, or a note editor, so it will not fire mid-typing.

Either route reselects the existing Mindmap tab when one is already open.

## Switch to a different mindmap

1. Expand the sidebar with `›` if it is collapsed.
2. Click the row for the mindmap you want.

The graph reloads. The row you clicked is highlighted while its mindmap is loaded.

## Hide and show the mindmap list

Click `‹` at the top of the sidebar to collapse it to a narrow bar, and `›` to bring it back. The choice is remembered across restarts.

Collapse it when the graph needs the width. Nothing but the toggle stays visible while collapsed, so creating, renaming and deleting mindmaps all need the sidebar expanded again.

## Pan and zoom the graph

Drag empty canvas to pan. Scroll to zoom. Both are Cytoscape's defaults; the plugin adds nothing on top of them and has no zoom-to-fit control.

## Select several nodes

Shift-click each node in turn, or hold Shift and drag a box across empty canvas. The selection is what the grouping menu acts on. See [grouping](grouping-howto.md).

## Find a node's item in the library

1. Click the node. The dock opens on the right of the tab.
2. Click "Show in library".

Zotero switches to the Library tab and selects that item. The Mindmap tab stays open; go back to it through the tab bar.

Clicking a node never jumps to the library on its own. Losing sight of the graph is something you have to ask for, which is why this is a button.

For a node showing "(missing item)", the dock has no "Show in library" button: the Zotero item behind that node is gone. Remove the node from the mindmap through the [Connections panel](connections-panel-howto.md), or restore the item from the trash.

## Close the tab

Close it like any Zotero tab, with its close button or the tab-close shortcut.

Nothing is lost. Positions, groups and links are saved as you make them, not when the tab closes. Reopening the tab loads the first mindmap in the list again rather than the one you were last looking at.

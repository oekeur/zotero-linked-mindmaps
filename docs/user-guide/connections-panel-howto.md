# Work with the Connections panel

The panel lives in the item pane under the heading "Connections", and again in the docked panel beside the graph in the mindmap tab. States and controls are listed in [connections-panel-reference.md](connections-panel-reference.md).

## Put an item on a mindmap

An item joins a mindmap as the side effect of its first link. There is no "add me" button in the panel.

1. Select the item and open the Connections section. It reads "Not in any mindmap yet."
2. Click the "+" in the section header.
3. Choose the mindmap under "Add to mindmap:" and click "Continue". This is the one moment you are asked, and it only comes up when the library holds more than one mindmap.
4. Fill in the add-link form and click "Save".

The item is now a node in that mindmap, positioned by the layout on the next render.

To add items without authoring a link, use the library context menu instead: select them, right-click, "Add to mindmap" ([library-menu-howto.md](library-menu-howto.md)).

## Add a link

1. Click the "+" in the section header, or the "Add link" button in the body when the panel is the one in the mindmap tab.
2. Fill in Type, Name, Direction and target, then click "Save".

The link goes into the mindmap named after "Mindmap:" at the top of the panel, without asking. You are only asked to choose when the item is in no mindmap yet and the library holds more than one.

Full field reference: [links-add-reference.md](links-add-reference.md).

## Remove a link

1. Find the link in the list.
2. Click "Remove" on that entry.

The link goes; both nodes stay on the mindmap. There is no confirmation and no undo, so re-authoring the link is the only way back.

## Remove the item from a mindmap

1. Check the mindmap named after "Mindmap:" at the top of the panel. That is the one the removal applies to.
2. Click "Remove from mindmap".

The node and every link touching it are removed from that mindmap. The Zotero item and any notes stay in the library. If another mindmap was reaching into the removed node with a cross-mindmap link, that stub and its links are cleaned up too.

An item that is a node in several mindmaps is only removed from the one shown. Repeat for the others.

## Change which mindmap the panel shows

The panel has no selector for this. What it shows depends on where it is:

- In the mindmap tab, the panel follows the graph. Load a different mindmap from the sidebar ([mindmaps-manage-howto.md](mindmaps-manage-howto.md)) and click the node again.
- In the item pane, it shows the first mindmap holding the item, by storage note id, and there is no way to move it off that one. Adding a link no longer offers a choice once the panel has resolved a mindmap, so the link goes into the same mindmap the panel is already showing.

This is a real limitation: an item in several mindmaps has no way to browse its links per mindmap from the item pane. Open the other mindmap in the mindmap tab and click the node there instead.

# Getting started with Zotero Linked Mindmaps

A guided path from a Zotero install with no plugin to a mindmap with two linked items on screen. Follow the steps in order; each one leaves you somewhere the next one can start from.

You need Zotero 7 and a library with at least two regular items in it (any two: articles, books, whatever you already have).

## 1. Build and install the plugin

No release build is published yet, so you build the `.xpi` from the repository.

1. Clone the repository and run `npm install` in it.
2. Run `npm run build`. The packaged `.xpi` lands in `.scaffold/build/`.
3. In Zotero, open Tools, then Plugins.
4. Click the gear icon at the top right of the Plugins window and choose "Install Plugin From File...".
5. Pick the `.xpi` from `.scaffold/build/` and confirm.
6. Restart Zotero.

If you are working on the plugin rather than using it, `npm start` builds and loads it into a dev profile instead. See [development setup](../contributing/development-setup.md).

## 2. Check that it loaded

After the restart, a small popup appears in the bottom right of the Zotero window reading "Addon is loading", and a second later "[100%] Addon is ready". That popup is the plugin's own startup signal.

If you missed it, open Tools, then Plugins, and look for Zotero Linked Mindmaps in the list. A plugin that fails to load leaves no error dialog behind, so the Plugins list is the check that matters.

## 3. Open the Mindmap tab

Open the File menu and click "Mindmap". The keyboard shortcut Shift+G does the same thing from anywhere that isn't a text field.

A tab titled "Mindmap" opens and stays selected. Opening it again later reselects this tab rather than making a second one.

The first time you open it in a library with no mindmap yet, the plugin creates one for you, titled "Mindmap". The graph area is blank because that mindmap has no nodes.

## 4. Find your mindmap in the sidebar

The strip on the left of the tab is the mindmap list. It is headed "Mindmaps" and holds one row per mindmap in the library. You should see a single row reading "Mindmap".

The `‹` button at the top of the strip collapses it down to a narrow bar; `›` brings it back. The tab remembers which state you left it in.

## 5. Give the mindmap a name of your own

1. Click "Edit" on the "Mindmap" row. The list is replaced by a short form.
2. Clear the "Title" field and type something, for example `Reading map`.
3. Type anything you like into "Description (optional)", or leave it empty.
4. Click "Save".

The list comes back with the new title, and the description underneath it in smaller text. Nothing else about the mindmap changes; renaming touches only the title and the description.

Leave this mindmap as the only one in the library for the rest of the tutorial. Step 6 relies on that, for a reason spelled out there.

## 6. Add two items from the library

1. Click the Library tab to switch back to your items.
2. Select two items, holding Ctrl (Cmd on macOS) to pick the second one.
3. Right-click the selection and choose "Add to mindmap".

A popup confirms with "Added 2 item(s) to mindmap". Both items are now nodes.

"Add to mindmap" always writes to the library's first mindmap, not to whichever one the tab is showing. With one mindmap that distinction does not exist, which is why this tutorial keeps you at one. Once you have several, use the Connections panel in the item pane to put an item into a specific mindmap. See [the library right-click menu](library-menu-howto.md) and [the Connections panel](connections-panel-howto.md).

## 7. Look at the graph

Switch back to the Mindmap tab. The two items are on the canvas as labelled circles. You did not have to reopen the tab: the graph watches the mindmap it is showing and redraws when it changes.

Each node is labelled with the item's title. A note's node is labelled with the first 60 characters of its text instead, since note titles are often unhelpful.

Drag a node somewhere else on the canvas. Where you drop it is saved straight away, and it will be in that spot the next time you open the tab. See [node layout](node-layout-reference.md) for what happens to nodes that have never been placed.

## 8. Open a node in the dock

Click one of the nodes. A panel opens on the right of the tab showing the item's title in bold, its item type, first creator and date, a "Show in library" button, and the item's mindmap links underneath.

Right now the links section reads "No links yet." Leave the panel open.

"Close" hides the panel. "Show in library" jumps Zotero to that item in the Library tab, which means leaving the graph, so it is a button rather than something a click on a node does by accident. See [the node overview panel](node-overview-reference.md).

## 9. Link the two items

1. Right-click the node you just clicked. A small menu appears at the pointer with one entry, "Add link".
2. Click "Add link". The panel on the right switches to the link form.
3. Pick a value in "Type". The list ships with `cites`, `supports`, `contradicts`, `primary source for` and `related to`.
4. Type something into "Name (optional)" if you want this one link labelled beyond its type, for example `chapter 3`.
5. If the type you picked is directional, a "Direction" field appears. "Forward" means the link runs from the node you right-clicked to the target you are about to pick.
6. Click "Choose target". Zotero's item picker opens.
7. Pick the other item and confirm. Its title appears next to the button, and "Save" becomes clickable.
8. Click "Save".

The graph redraws with a line between the two nodes, labelled with the type (or `type: name` when you gave it a name). A directional type draws as a dashed line with an arrowhead; a non-directional one as a plain solid line.

If the library has more than one mindmap, the form asks "Add to mindmap:" before it appears, even when you opened it from a node in a specific graph. Pick the mindmap and click "Continue".

For everything the link form can do, including linking to a node that lives in another mindmap, see [adding links](links-add-howto.md) and [link types](link-types-reference.md).

## Where to go next

Grouping several nodes into a labelled region: [grouping how-to](grouping-howto.md).

Creating, renaming and deleting mindmaps: [managing mindmaps](mindmaps-manage-howto.md).

Every control in the tab, listed: [mindmap tab reference](mindmap-tab-reference.md).

Where your mindmaps are actually stored, and why an item called "Zotero Linked Mindmaps (plugin data)" exists in your library: [plugin data](plugin-data-explanation.md).

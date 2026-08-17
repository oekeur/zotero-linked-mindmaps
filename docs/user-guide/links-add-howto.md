# Add a link

Four places open the add-link form. All of them produce the same link record; they differ only in what the source item is and how the form is presented. Field by field detail is in [links-add-reference.md](links-add-reference.md).

## From the Connections section in the item pane

1. Select a regular item or a note in the library. The Connections section is disabled for anything else: attachments, and the plugin's own "Zotero Linked Mindmaps (plugin data)" item and storage notes.
2. Open the Connections section in the item pane. Click the "+" button in its header (tooltip "Add link"). The section expands if it was collapsed.
3. If the panel already names a mindmap after "Mindmap:", that is the one the link goes into and nothing is asked. Otherwise, when the item is in no mindmap yet and the library holds more than one, pick one under "Add to mindmap:" and click "Continue".
4. Pick a link type under "Type".
5. Type a label under "Name (optional)" if you want one. Leave it blank otherwise.
6. If a "Direction" dropdown appeared, choose "Forward" (this item points at the target) or "Backward" (the target points at this item).
7. Click "Choose target" and pick the item or note to link to in Zotero's item selector.
8. Click "Save". The Connections list redraws with the new link.

## From a node in the mindmap tab

1. Open the mindmap tab and load the mindmap you want (see [mindmap-tab-howto.md](mindmap-tab-howto.md)).
2. Right-click the node you want to link from. A small menu opens at the click point with one action, "Add link".
3. Click "Add link". The node is docked in the panel beside the graph and the add-link form opens under its summary, on the mindmap the graph is drawing. Nothing asks you which mindmap that is.
4. Fill in the form as in steps 4 to 8 above. The link appears on the graph in front of you.

Left-clicking a node docks it without opening the form. Right-clicking empty canvas or a group region opens the grouping menu instead, not this one (see [grouping-howto.md](grouping-howto.md)).

## From the docked panel's own button

The panel in the mindmap tab has no section header, so it carries an in-body "Add link" button under the link list. Click it to open the form, and click it again to hide the form. It writes to the same mindmap the panel is showing, so it asks nothing either. The button is not present in the item-pane mount, which uses the header "+" instead.

## From the library context menu

1. Select one or more items in the library list.
2. Right-click the selection. With more than one mindmap in the library you get an "Add link" submenu; open it and click the mindmap the link belongs in. With one mindmap or none you get a plain "Add link…" entry instead, which uses the library's default mindmap.
3. A dialog titled "Add link" opens for the first eligible item, already on the mindmap chosen in step 2. Fill it in and click "Save", or close it to skip that item.
4. The dialog for the next eligible item opens once the previous one has closed. Items that are neither regular items nor notes are skipped without a dialog, as are the plugin's own data item and storage notes.

Each dialog waits for the one before it, so a multi-item run cannot have two saves racing each other. See [library-menu-reference.md](library-menu-reference.md).

## Link to a node that lives in another mindmap

Use "Choose from another mindmap" instead of "Choose target" at step 7. The steps are in [cross-mindmap-links-howto.md](cross-mindmap-links-howto.md).

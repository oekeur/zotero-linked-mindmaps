# Add a link

Four places open the add-link form. All of them produce the same link record; they differ only in what the source item is and how the form is presented. Field by field detail is in [links-add-reference.md](links-add-reference.md).

## From the Connections section in the item pane

1. Select a regular item or a note in the library. The Connections section is disabled for anything else, attachments included.
2. Open the Connections section in the item pane. Click the "+" button in its header (tooltip "Add link"). The section expands if it was collapsed.
3. If the library holds more than one mindmap, pick one under "Add to mindmap:" and click "Continue".
4. Pick a link type under "Type".
5. Type a label under "Name (optional)" if you want one. Leave it blank otherwise.
6. If a "Direction" dropdown appeared, choose "Forward" (this item points at the target) or "Backward" (the target points at this item).
7. Click "Choose target" and pick the item or note to link to in Zotero's item selector.
8. Click "Save". The Connections list redraws with the new link.

## From a node in the mindmap tab

1. Open the mindmap tab and load the mindmap you want (see [mindmap-tab-howto.md](mindmap-tab-howto.md)).
2. Right-click the node you want to link from. A small menu opens at the click point with one action, "Add link".
3. Click "Add link". The node is docked in the panel beside the graph and the add-link form opens under its summary.
4. If the library holds more than one mindmap, the "Add to mindmap:" chooser appears here too, with nothing preselected. Pick the mindmap the graph is already showing and click "Continue". The form is not told which mindmap the graph has open, so picking the wrong entry (or leaving the first one selected) writes the link into a different mindmap and it will not appear on the graph in front of you.
5. Fill in the form as in steps 4 to 8 above.

Left-clicking a node docks it without opening the form. Right-clicking empty canvas or a group region opens the grouping menu instead, not this one (see [grouping-howto.md](grouping-howto.md)).

## From the docked panel's own button

The panel in the mindmap tab has no section header, so it carries an in-body "Add link" button under the link list. Click it to open the form, and click it again to hide the form. The button is not present in the item-pane mount, which uses the header "+" instead.

## From the library context menu

1. Select one or more items in the library list.
2. Right-click the selection and choose "Add link…".
3. A dialog titled "Add link" opens for the first eligible item. Fill it in and click "Save", or close it to skip that item. This dialog does not ask which mindmap to write to; it always uses the library's default mindmap.
4. The dialog for the next eligible item opens once the previous one has closed. Items that are neither regular items nor notes are skipped without a dialog.

Each dialog waits for the one before it, so a multi-item run cannot have two saves racing each other. The entry is hidden when the selection holds no eligible item. See [library-menu-reference.md](library-menu-reference.md).

## Link to a node that lives in another mindmap

Use "Choose from another mindmap" instead of "Choose target" at step 7. The steps are in [cross-mindmap-links-howto.md](cross-mindmap-links-howto.md).

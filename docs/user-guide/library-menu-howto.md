# Add items to a mindmap from the library

Puts items on a mindmap as nodes without authoring links and without opening the item pane. Behaviour details are in [library-menu-reference.md](library-menu-reference.md).

## Add one item

1. Select the item in the library list.
2. Right-click it and choose "Add to mindmap".
3. Read the popup that appears in the corner: "Added 1 item(s) to mindmap".

If the library holds more than one mindmap, "Add to mindmap" opens a submenu instead of acting straight away. Pick the mindmap you want from it; the entries are the mindmap titles, oldest first.

The item is now a node, with no position yet. Open the mindmap tab to see it placed ([mindmap-tab-howto.md](mindmap-tab-howto.md)).

## Add several items at once

1. Select them in the library list, with Ctrl-click or Shift-click.
2. Right-click the selection and choose "Add to mindmap", then a mindmap if you are asked.
3. The popup reports how many nodes were added.

All of them are written in one pass. The count covers only items that were not already on the mindmap, so adding a selection that overlaps what is there reports fewer than you selected, and a selection that is entirely there reports 0.

Attachments in the selection are skipped, as are the plugin's own "Zotero Linked Mindmaps (plugin data)" item and the mindmap notes under it. A selection of nothing but those still shows the entry, and clicking it reports "Added 0 item(s) to mindmap".

## Notes on where they land

With one mindmap in the library, or none, there is nothing to choose and the entry writes without asking. An empty library gets a mindmap titled "Mindmap" created on the spot; rename it afterwards from the mindmap tab's sidebar ([mindmaps-manage-howto.md](mindmaps-manage-howto.md)).

A mindmap missing from the submenu is either in the trash or has a storage note the plugin can no longer read. Restore it from Zotero's trash to get it back in the list.

The Connections panel is the other way to put an item on a specific mindmap, and the one to use when you want to author a link at the same time ([connections-panel-howto.md](connections-panel-howto.md)).

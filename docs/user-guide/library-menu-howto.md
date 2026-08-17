# Add items to a mindmap from the library

Puts items on a mindmap as nodes without authoring links and without opening the item pane. Behaviour details are in [library-menu-reference.md](library-menu-reference.md).

## Add one item

1. Select the item in the library list.
2. Right-click it and choose "Add to mindmap".
3. Read the popup that appears in the corner: "Added 1 item(s) to mindmap".

The item is now a node on the library's default mindmap, with no position yet. Open the mindmap tab to see it placed ([mindmap-tab-howto.md](mindmap-tab-howto.md)).

## Add several items at once

1. Select them in the library list, with Ctrl-click or Shift-click.
2. Right-click the selection and choose "Add to mindmap".
3. The popup reports how many nodes were added.

All of them are written in one pass. The count covers only items that were not already on the mindmap, so adding a selection that overlaps what is there reports fewer than you selected, and a selection that is entirely there reports 0.

Attachments in the selection are skipped. If the selection is nothing but attachments, the menu entry does not appear at all.

## Notes on where they land

The entry always writes to the library's default mindmap, which is the oldest mindmap storage note in that library. It does not ask, and it cannot be pointed at another mindmap. To put an item on a specific mindmap, add a link from the Connections panel and choose the mindmap there ([connections-panel-howto.md](connections-panel-howto.md)).

If the library has no mindmap yet, this creates one titled "Mindmap". Rename it afterwards from the mindmap tab's sidebar ([mindmaps-manage-howto.md](mindmaps-manage-howto.md)).

# Library context menu reference

Two entries the plugin adds to the right-click menu of the library item list. Both work without the item pane open.

## "Add to mindmap"

Adds every selected item that can be a node, and is not one already, to the library's default mindmap in one write.

Visible when the selection holds at least one regular item or note. Hidden entirely when it holds none, so a selection of only attachments shows no entry rather than a disabled one.

Accepts regular items and notes, standalone or child. Attachments are ignored, and produce no message of their own.

The filter is item type only, with no exception for the plugin's own data. The container item is a document item and each mindmap is a note, so both count as eligible and can be added as nodes if they are visible in the library and selected. Hiding them is the way to keep that from happening by accident (see [hide-plugin-data-reference.md](hide-plugin-data-reference.md)).

The mindmap written to is the library's default: the storage note with the lowest item id, or a new mindmap titled "Mindmap" when the library holds none. The entry does not ask which mindmap, and there is no way to point it at a different one.

Items already present as a node are skipped rather than duplicated. New nodes are created unplaced, with no position, so the mindmap tab's layout places them the next time the graph is drawn ([node-layout-reference.md](node-layout-reference.md)). No links are created.

The library is taken from the first eligible item in the selection. A selection spanning two libraries is not a case the entry handles.

### What it reports

A progress popup headed with the plugin name, reading

> Added 3 item(s) to mindmap

and closing itself after three seconds. The count is nodes actually added, so items already on the mindmap are not counted. A selection where everything was already a node reports 0 and writes nothing.

A failed write is not reported here. The count popup shows regardless of whether the write succeeded.

## "Add link…"

Opens the standalone add-link dialog for each eligible selected item in turn, waiting for each dialog to close before opening the next.

Visible under the same condition as "Add to mindmap": at least one regular item or note in the selection.

The dialog is titled "Add link" and holds the same form as the Connections panel ([links-add-reference.md](links-add-reference.md)), with one difference: it does not ask which mindmap to use, and always writes to the library's default mindmap. A dialog that cannot read that mindmap shows `Failed to load mindmap:` and the error in place of the form.

Closing a dialog without saving skips that item and moves on to the next.

## Related

- [library-menu-howto.md](library-menu-howto.md)
- [connections-panel-reference.md](connections-panel-reference.md) for the item-pane alternative

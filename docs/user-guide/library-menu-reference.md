# Library context menu reference

Two entries the plugin adds to the right-click menu of the library item list. Both work without the item pane open.

## One entry, two shapes

Each entry is registered twice: as a plain menu item that acts on its own, and as a submenu listing the library's mindmaps. Exactly one of the two shows, decided each time the menu opens.

- Library with no mindmap or exactly one: the plain entry, a single click. With none, the write creates a mindmap titled "Mindmap" first.
- Library with two or more: the submenu, one entry per mindmap.

The mindmap list is read from the library's storage notes when the menu opens, once per right-click and shared by both entries. A mindmap created or deleted from the mindmap tab shows up on the next right-click; nothing is cached beyond that.

Submenu entries carry the mindmap's title as their label and its description, when it has one, as the tooltip. They are ordered by storage-note item id, oldest first, the same order the default falls out of. A storage note whose contents no longer parse is left out of the list, so a corrupt mindmap cannot be picked here; the rest still list.

If the list cannot be read at all, the plugin logs the reason to the debug output and treats the library as holding no mindmaps, which shows the plain entry.

## Eligibility

Regular items and notes count, standalone or child. Attachments do not, and produce no message of their own.

The plugin's own bookkeeping is excluded: the "Zotero Linked Mindmaps (plugin data)" container item and every mindmap storage note under it. The check is by tag, not by visibility, so it holds in the trash view and whether or not the plugin-data row is hidden ([hide-plugin-data-reference.md](hide-plugin-data-reference.md)).

The plain entry stays visible for a selection with nothing eligible in it, so a selection of only attachments, or only plugin data, still shows "Add to mindmap" and "Add link…". Clicking them acts on an empty selection: "Add to mindmap" writes nothing and reports 0, "Add link…" opens no dialog. The submenu shape is hidden in that case.

## "Add to mindmap"

Adds every selected item that can be a node, and is not one already, in one write.

The target is the mindmap picked from the submenu, or the library's default when the plain entry was used. The default is the storage note with the lowest item id, created on demand when the library has none.

Items already present as a node are skipped rather than duplicated. New nodes are created unplaced, with no position, so the mindmap tab's layout places them the next time the graph is drawn ([node-layout-reference.md](node-layout-reference.md)). No links are created.

The library is taken from the first eligible item in the selection. A selection spanning two libraries is not a case the entry handles.

### What it reports

A progress popup headed with the plugin name, reading

> Added 3 item(s) to mindmap

and closing itself after three seconds. The count is nodes actually added, so items already on the mindmap are not counted. A selection where everything was already a node reports 0 and writes nothing.

A failed write reports nothing. The popup only appears after the write succeeds, and the error goes to the debug output. The case to know about is a trashed container: with "Zotero Linked Mindmaps (plugin data)" in the trash and no reachable mindmap left, the write is refused rather than allowed to create a second copy, and the menu says nothing about it. Opening the mindmap tab is what surfaces it, with

> Mindmap data for this library is in the trash. Nothing new was created - restore it to get your mindmaps back.

Trashing a single mindmap's storage note takes that mindmap out of the submenu. The plugin reports that once, when it happens:

> A mindmap's data note was moved to the trash. That mindmap stays hidden until you restore it.

## "Add link…"

Opens the standalone add-link dialog for each eligible selected item in turn, waiting for each dialog to close before opening the next.

The submenu shape drops the ellipsis and reads "Add link", since a submenu parent opens nothing by itself.

The dialog is titled "Add link" and holds the same form as the Connections panel ([links-add-reference.md](links-add-reference.md)). It writes to the mindmap picked from the submenu, or the library's default when the plain entry was used; the form itself has no mindmap field. A dialog that cannot read that mindmap shows `Failed to load mindmap:` and the error in place of the form.

Closing a dialog without saving skips that item and moves on to the next.

## Related

- [library-menu-howto.md](library-menu-howto.md)
- [connections-panel-reference.md](connections-panel-reference.md) for the item-pane alternative

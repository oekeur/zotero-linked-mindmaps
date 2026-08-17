# Show or hide the plugin's data items

The plugin stores your mindmaps in a Zotero item called `Zotero Linked Mindmaps (plugin data)` and in notes under it. By default they are hidden from your library view. Turn that off when you want to see them, for instance while troubleshooting or before backing something up by hand.

## Show the plugin's data items

1. Open Zotero's settings: Edit > Settings on Linux and Windows, Zotero > Settings on macOS.
2. Select the Link Types pane in the list on the left. The checkbox sits below the link types table.
3. Clear the checkbox labelled: Hide the "Zotero Linked Mindmaps (plugin data)" item from the library
4. Close the settings window. The open item tree refreshes on the spot and keeps your current selection, so no restart is needed.

The container item now appears in the library, and under Unfiled Items, because it belongs to no collection. Expand it to see one child note per mindmap.

## Hide them again

1. Open the Link Types pane in Zotero's settings.
2. Tick the same checkbox.
3. Close the settings window.

The setting is stored per Zotero profile and is not synced, so you set it again on each machine where you want it changed from the default.

## When the checkbox does nothing

The row stays visible with the checkbox ticked when the plugin could not install its filter, which happens if a Zotero update changed the internal method it hooks into. The plugin is written to give up rather than break the item tree, and it records the reason in the debug log (Help > Debug Output Logging).

Leaving the row visible is harmless. Do not delete it: it holds every mindmap in that library. See [Recovering plugin data](plugin-data-howto.md) if you already have.

## Finding the item when it is hidden

Two things to know before you go looking:

Quick search will not find it while the setting is on, since the filter runs on the same search the library view uses. Turn the setting off first.

The trash is never filtered. A trashed container is visible under Trash whether the setting is on or off, which is what makes recovery possible without changing the setting.

## Related

- [Hiding plugin data: setting reference](hide-plugin-data-reference.md)
- [Plugin data reference](plugin-data-reference.md)
- [Recovering plugin data](plugin-data-howto.md)

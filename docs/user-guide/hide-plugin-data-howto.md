# Show or hide the plugin's data items

The plugin stores your mindmaps in a Zotero item called `Zotero Linked Mindmaps (plugin data)`, with a note under it per mindmap. Both are hidden from your library view by default. Turn that off when you actually want to see them, which usually means troubleshooting, or backing something up by hand.

## Show the plugin's data items

1. Open Zotero's settings: Edit > Settings on Linux and Windows, Zotero > Settings on macOS.
2. Select the "Mindmaps" pane in the list on the left. The checkbox sits below the link types table.
3. Clear the checkbox labelled: Hide the Zotero Linked Mindmaps item from my library
4. Close the settings window. The open item tree refreshes on the spot and keeps your selection, so there's no restart involved.

The container item now shows up in the library, and under Unfiled Items too, since it belongs to no collection. Expand it and you'll find one child note per mindmap.

## Hide them again

1. Open the "Mindmaps" pane in Zotero's settings.
2. Tick the same checkbox.
3. Close the settings window.

The setting lives in your Zotero profile and doesn't sync, so you'll need to set it again on each machine where you want it away from the default.

## When the checkbox does nothing

If the row stays visible with the checkbox ticked, the plugin couldn't install its filter. That happens when a Zotero update changes the internal method it hooks into. The plugin is written to give up in that situation rather than break your item tree, and it records the reason in the debug log (Help > Debug Output Logging).

A visible row is harmless, so leave it be. What you must not do is delete it, because it holds every mindmap in that library. If you already have, see [Recovering plugin data](plugin-data-howto.md).

## Finding the item when it is hidden

Two things to know before you go looking.

Quick search won't find it while the setting is on, because the filter runs on the same search the library view uses. Turn the setting off first.

The trash, on the other hand, is never filtered. A trashed container shows up under Trash whether the setting is on or off, which is what makes recovery possible without touching the setting at all.

## Related

- [Hiding plugin data: setting reference](hide-plugin-data-reference.md)
- [Plugin data reference](plugin-data-reference.md)
- [Recovering plugin data](plugin-data-howto.md)

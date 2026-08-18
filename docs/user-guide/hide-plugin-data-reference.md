# Hiding plugin data: setting reference

The plugin keeps its data in a Zotero item and its child notes (see [Plugin data reference](plugin-data-reference.md)). One setting controls whether those items appear in your library view.

## The setting

|                |                                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| Checkbox label | Hide the Zotero Linked Mindmaps item from my library                         |
| Location       | Zotero Settings, in the pane labelled Link Types, below the link types table |
| Default        | on (checked)                                                                 |
| Preference key | `extensions.zotero.zoterolinkedmindmaps.hideMindmapNotes`                    |
| Type           | boolean                                                                      |
| Scope          | this Zotero profile only; the setting is not synced to your other devices    |

Hiding is opt-out. On a fresh profile the plugin's items are hidden with no interaction from you.

Toggling the checkbox takes effect straight away. The plugin refreshes every open item tree and keeps your selection; no restart is needed.

## What it hides

While the setting is on, the item tree leaves out every item in the library that carries either of the plugin's tags:

- `_zoterolinkedmindmaps-container-v1`, the container item titled `Zotero Linked Mindmaps (plugin data)`
- `_zoterolinkedmindmaps-storage-v1`, the mindmap storage notes

Both tags have to be excluded, not just the container's. A library view's search matches child items too, and Zotero's item tree answers a matching child whose parent is missing by adding a row for the parent, so excluding the container alone would put it straight back on screen.

The filter applies to views that are scoped to a library: the library root, collections, and other rows that carry a library id.

## What it does not hide

**The trash.** The trash view is left unfiltered. Filtering it would empty it of everything, because the trash view searches for deleted items and the filter the plugin wraps around it excludes them. The practical effect is useful: a trashed container is visible in the trash even with this setting on, which is what makes [recovery](plugin-data-howto.md) possible without turning the setting off first.

**Feeds.** Feed rows and the Feeds pseudo-library are left unfiltered. The pseudo-library has no library id to scope a search to.

**Search results in the library view.** Because the container is filtered out of the view's search, quick search cannot find it by name while the setting is on. Turning the setting off is the way to find it.

**Anything outside the item tree.** The setting changes what the item tree shows. The items themselves are untouched: they still exist, still sync, and still count as items in your library.

## Known limits

The setting works by replacing an internal Zotero method that is not part of any documented plugin API, and the code around it is being reworked between Zotero versions. The replacement is written to fail open: if anything in it throws, the plugin returns Zotero's own unmodified result and writes the reason to the debug log. A Zotero update that changes the method costs you one visible row, never an item tree that renders nothing.

If the method is missing altogether when the plugin starts, the plugin logs that the container stays visible and does not patch anything. The checkbox then has no effect.

The plugin restores Zotero's original method when it shuts down or reloads.

## Related

- [Show or hide the plugin's data items](hide-plugin-data-howto.md)
- [Plugin data reference](plugin-data-reference.md)
- [Recovering plugin data](plugin-data-howto.md)

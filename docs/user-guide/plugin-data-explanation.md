# Why mindmaps live in a Zotero note

A mindmap is a graph over your Zotero items. It could have been stored in a database of the plugin's own, or in a JSON file next to your Zotero data. Both were rejected for the same reason: neither travels. Zotero already syncs your library between machines, and a plugin file sitting in one profile directory does not go with it. You would build a mindmap on your laptop, open Zotero on your desktop, and find the items there but not the map over them.

Storing mindmaps as Zotero items means they ride the sync you already have. No account, no server, no second sync mechanism to configure or to break. A mindmap follows the library it belongs to, including a group library, where it reaches every member of the group the same way the items do.

## Why a note, and why not synced settings

Zotero offers a per-library key-value store, `SyncedSettings`, which would have kept plugin data out of the item tree entirely. It does not work for this. The Zotero sync server whitelists which setting names it accepts (six literal names plus two patterns) and caps a value at 30,000 characters. A plugin's own key is rejected on upload, so the data would sit in the local database and never leave the machine. That fails the one requirement the design starts from.

Note items sync, hold arbitrary text, and have no practical size limit. So each mindmap is one note, holding its whole document as JSON inside a `<pre>` block, with a warning paragraph above it for anyone who opens the note by accident.

## Why a container item

One note per mindmap means one item-tree row per mindmap. Five mindmaps put five notes in your library, on top of the items you actually collect.

The fix uses Zotero's own view behaviour rather than anything clever. Zotero's library and collection views add a `noChildren` condition to the search behind them, so a child note never renders as a top-level row. Parent every storage note to one item, and any number of mindmaps collapses to a single row: the container item, titled `Zotero Linked Mindmaps (plugin data)`. The same behaviour covers Zotero's native item picker, which would otherwise offer storage notes as things you could link to.

One row is still one row, which is why the plugin also ships a setting that hides it, on by default. That setting works by patching an internal Zotero method, so it is allowed to fail: if a Zotero update changes the method, the patch gives up and you see the container row again rather than an item tree that renders nothing. See [Hiding plugin data](hide-plugin-data-reference.md).

The container is identified by a tag, not by a preference recording its item id. A preference is local to one device, and every synced device has to arrive at the same container from library data alone. For the same reason the container's title stays in English in every locale: it is stored data that two devices in different languages must both recognise, not text the plugin renders for you.

## Why the plugin reconciles containers at startup

The plugin cannot assume the container exists, or that there is only one, and it cannot assume its own storage notes are already under it.

Libraries that predate the container hold storage notes at the top level. Sync creates a genuine race: two devices can each create a container before either sees the other's, and both are valid until they meet. A user can move a note, file it in a collection, or trash something. None of that is an error state the plugin can refuse to handle; it is just what a synced, user-editable library does.

So instead of asserting a shape, the plugin converges on one at every startup. It adopts the container with the lowest item key (the key, not the item id, because ids are assigned per device and both devices have to pick the same winner), moves every stray storage note under it in a single transaction, and erases the duplicates left empty. A library already in that shape is not written to at all, so the second run costs nothing.

The reconciliation runs after the main windows have loaded rather than before. If it finds a library whose container is in the trash, it has to tell you, and a popup needs a window to appear in.

## The trash hazard, and why the plugin only warns

Zotero hides the child notes of a trashed item from search. Trash the container, and every mindmap in that library disappears from the plugin at once, with nothing in Zotero's own interface connecting the two ends of it. This is the sharpest edge in the design, and it was known before the container shipped.

The plugin warns when the container goes into the trash, and again at every startup while it is still there. It does nothing else. It does not take the item back out, because that reverses a deliberate action you took, and a plugin that quietly undoes your deletions is worse than one that lets you make them. It also does not create a replacement container, which would be the more damaging repair: the next write would land in the fresh container while your real mindmaps sat in the trashed one, and you would be told nothing while every new change went somewhere the old data could never be recovered into.

The limit of a warning is that it is only a warning. Empty the trash and the data is gone, with no copy anywhere else. Recovery instructions are in [Recovering plugin data](plugin-data-howto.md); read them before you need them.

The same hazard exists in a smaller form for an individual storage note, and there the plugin says nothing at all: the note is not tagged as the container, so the trash observer ignores it, and one mindmap goes quiet while the rest keep working.

## The sync conflict this design accepts

A mindmap is one JSON document in one note, rewritten in full on every change, and Zotero does not merge note content across devices. Edit the same mindmap on two machines and the edit made on one of them can be overwritten by the other device's stale copy when it syncs, without warning. Not just the conflicting change: the whole document, so nodes and links you added on the losing side go with it.

This was accepted for the first version rather than solved. Splitting a mindmap into smaller synced units so that a conflict lands on one node or one link is possible, and it is the way out if this turns out to cost real work. It also makes a graph that can sync into a half-state, with links whose endpoints did not arrive, so it is not a change worth making on speculation. The assumption behind the current choice is a single user who rarely edits the same mindmap on two devices before they sync. If that assumption is wrong for you, the failure is quiet, which is the part to watch for.

Within a single Zotero session the plugin does protect you. Every read-modify-write cycle goes through one queue, so two changes landing at once (your layout being saved while a deleted item is being pruned out of the same mindmap, for example) cannot overwrite each other. That queue is local. It says nothing about a second machine.

## Related

- [Plugin data reference](plugin-data-reference.md)
- [Recovering plugin data](plugin-data-howto.md)
- [Hiding plugin data](hide-plugin-data-reference.md)
- [Cross-mindmap links](cross-mindmap-links-explanation.md)

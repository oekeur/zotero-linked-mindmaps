# Why mindmaps live in a Zotero note

A mindmap is a graph over your Zotero items. It could have been stored in a database of the plugin's own, or in a JSON file next to your Zotero data. Both got rejected for the same reason: neither travels. Zotero already syncs your library between machines, and a plugin file sitting in one profile directory doesn't go with it. You would build a mindmap on your laptop, open Zotero on your desktop, and find the items there but no map over them.

Store mindmaps as Zotero items and they ride the sync you already have. No account, no server, no second sync mechanism to configure or to break. A mindmap follows the library it belongs to, and in a group library it reaches every member the same way the items do.

## Why a note, and why not synced settings

Zotero offers a per-library key-value store, `SyncedSettings`, which would have kept plugin data out of the item tree entirely. It doesn't work for this. The Zotero sync server whitelists which setting names it accepts (six literal names plus two patterns) and caps a value at 30,000 characters. A plugin's own key gets rejected on upload, so the data would sit in the local database and never leave the machine. That fails the one requirement the whole design starts from.

Note items sync, hold arbitrary text, and have no practical size limit. So each mindmap is one note, holding its entire document as JSON inside a `<pre>` block, with a warning paragraph above it for anyone who opens the note by accident.

## Why a container item

One note per mindmap means one item-tree row per mindmap. Five mindmaps put five notes in your library, on top of the items you actually collect.

The fix leans on Zotero's own view behaviour instead of anything clever. Zotero's library and collection views add a `noChildren` condition to the search behind them, so a child note never renders as a top-level row. Parent every storage note to one item and any number of mindmaps collapses to a single row: the container item, titled `Zotero Linked Mindmaps (plugin data)`. That same behaviour covers Zotero's native item picker, which would otherwise offer storage notes as things you could link to.

One row is still one row, so the plugin also ships a setting that hides it, on by default. The setting works by patching an internal Zotero method, which means it is allowed to fail. If a Zotero update changes that method, the patch gives up and you get the container row back rather than an item tree that renders nothing at all. See [Hiding plugin data](hide-plugin-data-reference.md).

A tag identifies the container, not a preference recording its item id. Preferences are local to one device, and every synced device has to arrive at the same container using library data alone. The container's title stays in English in every locale for the same reason: it is stored data that two devices running different languages both have to recognise, so it isn't really text the plugin renders for you.

## Why the plugin reconciles containers at startup

The plugin can't assume the container exists. It can't assume there is only one, and it can't assume its own storage notes are already sitting under it.

Libraries that predate the container hold storage notes at the top level. Sync creates a genuine race, where two devices each create a container before either sees the other's, and both are valid right up until they meet. You might move a note, file it in a collection, or trash something. None of that is an error state the plugin gets to refuse; it is just what a synced, user-editable library does.

So rather than asserting a shape, the plugin converges on one at every startup. It adopts the container with the lowest item key (the key, not the item id, because ids are assigned per device and both devices have to pick the same winner), moves every stray storage note under it in a single transaction, and erases the duplicates left empty. A library already in that shape never gets written to, so the second run costs nothing.

The reconciliation runs after the main windows have loaded, not before. If it finds a library whose container is in the trash it has to tell you, and a popup needs a window to appear in.

## The trash hazard, and why the plugin only warns

Zotero hides the child notes of a trashed item from search. So trash the container and every mindmap in that library vanishes from the plugin at once, with nothing in Zotero's own interface connecting the two ends of it. This is the sharpest edge in the design, and it was known before the container ever shipped.

The plugin warns when the container goes into the trash, then warns again at every startup while it is still there. It won't take the item back out, because that reverses a deliberate action you took, and a plugin that quietly undoes your deletions is worse company than one that lets you make them. It also won't create a replacement container, which would be the more damaging repair of the two: the next write would land in the fresh container while your real mindmaps sat in the trashed one, and nobody would tell you, while every new change went somewhere the old data could never be recovered into. Every path that needs a container refuses instead of building one, so opening the Mindmap tab in that state warns you rather than handing you a blank mindmap laid over the top of the real ones.

A warning is only a warning, though. Empty the trash and the data is gone, with no copy anywhere else. Recovery instructions are in [Recovering plugin data](plugin-data-howto.md), and it is worth reading them before you need them.

The same hazard exists in smaller form for an individual storage note, which gets its own warning at trash time. That case costs you one mindmap instead of the library's whole set, and the message says so. What it doesn't get is a repeat at startup. Reconciliation looks at containers, and a library with a live container and one trashed note under it reads as perfectly healthy. So a note trashed in a session you have since closed goes missing with nothing to say why. That is the thin spot left in the trash story, and it is a known one.

## The sync conflict this design accepts

A mindmap is one JSON document in one note, rewritten in full on every change, and Zotero does not merge note content across devices. Edit the same mindmap on two machines and one machine's edit can be overwritten by the other's stale copy when it syncs, without warning. What you lose isn't only the conflicting change: it is the whole document, so nodes and links you added on the losing side go with it.

This was accepted for the first version rather than solved. Splitting a mindmap into smaller synced units, so a conflict lands on one node or one link, is possible, and it is the way out if this turns out to cost real work. It also produces a graph that can sync into a half-state, with links whose endpoints never arrived, so it isn't a change worth making on speculation. The assumption behind the current choice is a single user who rarely edits the same mindmap on two devices before they sync. If that assumption doesn't hold for you, the failure is quiet, which is the part to watch for.

Within a single Zotero session you are protected. Every read-modify-write cycle goes through one queue, so two changes landing at once (your layout being saved while a deleted item is pruned out of the same mindmap, say) can't overwrite each other. That queue is local, though. It has nothing to say about a second machine.

## Related

- [Plugin data reference](plugin-data-reference.md)
- [Recovering plugin data](plugin-data-howto.md)
- [Hiding plugin data](hide-plugin-data-reference.md)
- [Cross-mindmap links](cross-mindmap-links-explanation.md)

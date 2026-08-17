# Why storage notes live under a container item

The design behind `src/modules/mindmap/containerGuard.ts` and the container half of `storage.ts`. For the API see [container-guard-reference.md](container-guard-reference.md) and [storage-reference.md](storage-reference.md).

## The problem the container solves

Zotero has no hidden item type. A mindmap is stored in a note item, so every mindmap the user creates adds a row to their library, and by the fourth one there are four rows of `_zoterolinkedmindmaps` noise sitting among their actual research. The storage notes also turned up in the native `selectItemsDialog` that the link-target picker opens, which meant the plugin was cheerfully offering its own internals as things to link to.

The first idea was to filter them out of the item tree by patching Zotero internals. That is a lot of undocumented surface to depend on for what is basically a cosmetic problem, and a broken patch breaks the item tree.

Zotero's own view behavior does most of the work instead. `collectionTreeRow.js` (checked at 10.0-beta.25, lines 452 and 457) adds `noChildren` to the search behind library and collection views, so a child note never renders as a top-level row. Parent every storage note to one item and any number of mindmaps collapses into a single visible row, on behavior Zotero already guarantees rather than an internal you have to patch. The same behavior covers the target picker's dialog, so the notes stop being offered as link targets there too.

The one remaining row is then hidden by a default-on preference, which does patch an internal (`getSearchObject`) and fails open. That lives in a separate module: see [library-filter-explanation.md](library-filter-explanation.md). Losing that patch costs you one visible row and not the tree.

The container is a `document` item titled "Zotero Linked Mindmaps (plugin data)", tagged `_zoterolinkedmindmaps-container-v1`. Its title is deliberately untranslated, because it is stored, synced data rather than UI text, and two devices running different locales have to recognise the same item.

## Why the container is found by tag, not by preference

A preference recording "the container is item 4127" would be faster and simpler, and it would be wrong the moment you opened Zotero on a second machine. Preferences are device-local, item ids are database-local, and the container arrives on the other machine through sync as an ordinary item with a different id. Every synced device has to reach the same container using library data alone, and the tag is the only thing that travels with it.

The tag lookup has a cost the plugin has to absorb. Two devices that each create a mindmap before syncing each create their own container, and after sync the library has two. `reconcileContainer` deals with that by adopting the lowest-key container, reparenting stray notes into it, and erasing whichever duplicates are left empty. Lowest _key_, not lowest id, because ids differ per device and only the key gives both machines the same answer about which container wins.

A duplicate that still has children gets left alone. Erasing an item in Zotero takes its children with it, and a user who hung a note of their own off the container would lose it.

## Why reconciliation runs after windows load

`hooks.ts` awaits `Zotero.uiReadyPromise`, registers everything, loads every main window, and only then calls `reconcileContainers()`.

That ordering is about the warning, not the migration. A library whose container is in the trash gets reported through a `ztoolkit.ProgressWindow`, and a ProgressWindow needs a window to appear in. Run reconciliation before `onMainWindowLoad` and the warning for the one condition that silently costs the user every mindmap in a library goes precisely nowhere.

The migration work itself is safe at either point. It runs on the storage queue and touches nothing the UI is holding, so waiting costs nothing. What it does cost is that `addon.data.initialized` gets set after an operation that walks every library and can write, which makes startup slower on a library that needs migrating. That happens once.

Reconciliation runs at startup instead of on demand because the states it fixes are arrival states: notes written by a version of the plugin that predates the container, and duplicate containers landing through sync. Nothing the user does inside a session triggers either one, and checking on every read would put a library-wide search in front of every mindmap open.

## What a trashed container does to the user's data

It hides every mindmap in that library at once.

Zotero's search excludes child notes of deleted items unless `includeDeleted` is set (`search.js:1281`). Trashing the container therefore makes `findAllMindmapNotes` return nothing. The registry is empty, the mindmap list is empty, and short of asking the trash, the plugin can't tell that apart from a library that never had a mindmap at all. One trash action takes out every mindmap in the library, with nothing in Zotero's own interface connecting the two ends of it.

Worse, the plugin could make that permanent by writing a replacement. A fresh container would start taking writes while the real mindmaps sat in the trash under a container nothing would ever adopt them out of. Restore the trashed container at that point and you have two containers and a split registry. Empty the trash instead and everything is erased, with no warning ever having been shown.

So both levels refuse. `reconcileContainer` returns `"trashed"` and writes nothing at all when a library has no untrashed container but at least one trashed one: no new container, no reparenting. `findOrCreateContainer` throws `StorageError("container-trashed")` in the same situation, which covers every other write path, since creating a storage note goes through it. `containerGuard` turns the startup case into a warning that stays on screen until the user clicks it, and `mindmapTab` does the same for the tab-open case, through the same `warn` helper.

Two containers as a repair state is now something the plugin can only reach through sync, which is the case reconciliation was built for. It can no longer get there by answering a trashed container with a new one.

The notifier observer adds a warning at trash time, so a user who trashes the container from the library UI hears about it in the same session instead of at the next restart.

## Why a trashed storage note gets its own message

A trashed storage note is the same hazard at one-mindmap scale, and Zotero's UI says nothing about that either. The note carries no title a user would recognise, and it stops being listed with no other trace. So the observer matches `STORAGE_TAG` alongside `CONTAINER_TAG`.

The note case gets its own string instead of reusing the container's, because the container message claims every mindmap in the library is hidden, and here that would be false. Where one batch trashes both, the observer warns about the container and stops, since the wider claim is the true one in that case.

What remains is the startup half. Reconciliation checks containers, so a library with a live container and a trashed note under it converges to `"ok"` and says nothing at all. A note trashed in a session the user has since closed goes missing with no message behind it. `hasHiddenMindmapData` covers part of that: if the trashed note was the library's only mindmap, opening the Mindmap tab finds an empty registry, checks the trash, and warns instead of creating a replacement. A library with three mindmaps and one of them trashed gets nothing at the next startup.

What the plugin will not do is un-trash. Trashing was a deliberate user action on a visible item, and reversing it would be the plugin fighting the user over their own library. The warnings say what it costs and how to undo it. The undo itself is theirs.

That leaves a hole, and it is worth naming plainly: trash the container, empty the trash, and the mindmaps are gone with no recovery path. The plugin warns about it. It doesn't solve it.

## Where the container still shows up

Under "Unfiled Items". Filing it into a plugin-created collection would hide it from there, at the cost of a permanent entry in the left pane, which is more intrusive than one unfiled row.

And with the hide preference on, nowhere the item-tree quicksearch reaches, which means a user troubleshooting can't find the container by name while the preference is on. The preference is the escape hatch from that, and it is why the hiding is opt-out rather than mandatory.

# Why storage notes live under a container item

The design behind `src/modules/mindmap/containerGuard.ts` and the container half of `storage.ts`. For the API see [container-guard-reference.md](container-guard-reference.md) and [storage-reference.md](storage-reference.md).

## The problem the container solves

Zotero has no hidden item type. A mindmap is stored in a note item, so every mindmap the user creates adds a row to their library, and a fourth mindmap means four rows of `_zoterolinkedmindmaps` noise sitting among their actual research. The storage notes also showed up in the native `selectItemsDialog` the link-target picker opens, so the plugin was offering its own internals as things to link to.

The first idea was to filter them out of the item tree by patching Zotero internals. That is a lot of undocumented surface to depend on for a cosmetic problem, and a broken patch breaks the item tree.

Zotero's own view behavior does most of the work instead. `collectionTreeRow.js` (checked at 10.0-beta.25, lines 452 and 457) adds `noChildren` to the search behind library and collection views, so a child note never renders as a top-level row. Parent every storage note to one item and any number of mindmaps collapses into a single visible row, using behavior Zotero already guarantees rather than an internal being patched. The same behavior covers the target picker's dialog, so the notes stop being offered as link targets there too.

The remaining single row is then hidden by a default-on preference, which does patch an internal (`getSearchObject`) and fails open. That is a separate module: see [library-filter-explanation.md](library-filter-explanation.md). Losing that patch costs one visible row, not the tree.

The container is a `document` item titled "Zotero Linked Mindmaps (plugin data)", tagged `_zoterolinkedmindmaps-container-v1`. The title is deliberately untranslated, because it is stored, synced data rather than UI text: two devices in different locales must recognise the same item.

## Why the container is found by tag, not by preference

A preference recording "the container is item 4127" would be faster and simpler, and it would be wrong on the second machine. Preferences are device-local, item ids are database-local, and the container arrives on the other machine through sync as an ordinary item with a different id. Every synced device has to reach the same container from library data alone, and the tag is the only thing that travels with it.

The tag lookup has a cost the plugin has to absorb: two devices that each create a mindmap before syncing each create their own container, and after sync the library has two. `reconcileContainer` handles that by adopting the lowest-key container, reparenting stray notes into it, and erasing the duplicates that are left empty. Lowest _key_, not lowest id, because ids differ per device and only the key gives both machines the same answer about which container wins.

A duplicate that still has children is left alone. Erasing an item in Zotero takes its children with it, and a user who hung a note of their own off the container would lose it.

## Why reconciliation runs after windows load

`hooks.ts` awaits `Zotero.uiReadyPromise`, registers everything, loads every main window, and only then calls `reconcileContainers()`.

The ordering is about the warning, not the migration. A library whose container is in the trash is reported through a `ztoolkit.ProgressWindow`, and a ProgressWindow needs a window to appear in. Run the reconciliation before `onMainWindowLoad` and the warning for the one condition that silently costs the user every mindmap in a library goes nowhere.

The migration work itself is safe at either point (it runs on the storage queue and touches nothing the UI is holding), so nothing is lost by waiting. The cost is that `addon.data.initialized` is set after an operation that walks every library and can write, which makes startup slower on a library that needs migrating. That only happens once.

Reconciliation runs at startup rather than on demand because the states it fixes are arrival states: notes written by a version of the plugin that predates the container, and duplicate containers landing through sync. Neither is triggered by anything the user does inside the session, and checking on every read would put a library-wide search in front of every mindmap open.

## What a trashed container does to the user's data

It hides every mindmap in that library at once.

Zotero's search excludes child notes of deleted items unless `includeDeleted` is set (`search.js:1281`). Trashing the container therefore makes `findAllMindmapNotes` return nothing: the registry is empty, the mindmap list is empty, and the plugin behaves exactly as it would in a library that never had a mindmap. One trash action, silently, for every mindmap in the library.

Worse, the plugin could make it permanent. `findOrCreateContainer` ignores trashed containers, so the next write would create a fresh one and start filling it, while the real mindmaps sat in the trash under a container nothing would ever adopt them out of. Restoring the trashed container at that point would leave two containers and a split registry; emptying the trash instead would erase everything with no warning ever shown.

So `reconcileContainer` refuses. A library with no untrashed container but at least one trashed one returns `"trashed"` and writes nothing at all: no new container, no reparenting. `containerGuard` turns that into a warning that stays on screen until the user clicks it.

There is a second warning at trash time, from the notifier observer, so a user who trashes the container from the library UI hears about it in the same session rather than at the next restart.

What the plugin will not do is un-trash. Trashing was a deliberate user action on a visible item, and reversing it would be the plugin fighting the user over their own library. The warnings say what it costs and how to undo it; the undo is theirs.

The hole this leaves is honest and unfixed: trash the container, empty the trash, and the mindmaps are gone with no recovery path. That is the same hazard the per-note case already carries (trashing a single storage note silently erases the mindmap it held), with the blast radius widened from one mindmap to a whole library. Accepted, warned about twice, not solved.

## Where the container still shows up

Under "Unfiled Items". Filing it into a plugin-created collection would hide it from there, at the cost of a permanent entry in the left pane, which is more intrusive than one unfiled row.

And, with the hide preference on, nowhere the item-tree quicksearch reaches: a user troubleshooting cannot find the container by name while the preference is on. The preference is the escape hatch, and it is why the hiding is opt-out rather than mandatory.

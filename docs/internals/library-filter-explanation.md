# Why the library filter is a monkey patch

The plugin keeps its data in real Zotero items: one container item per library, with a child note per mindmap. That makes the data sync, back up, and survive uninstall like anything else in the library. It also means the container turns up in the item tree as a row the user never created and can't do anything useful with.

Zotero offers no API for filtering rows out of the item tree. There is no `itemTreeManager` hook for it, no per-plugin row predicate, nothing in `itemPaneManager` that reaches the list. So the choice was between leaving the row visible and reaching into Zotero's internals.

## What the patch attaches to, and why that spot

`Zotero.CollectionTreeRow.prototype.getSearchObject` is the seam. Every item-tree view asks the selected collection-tree row for a `Zotero.Search`, then renders whatever that search returns. Replace that one method and you change what every view lists without touching the tree code at all.

The replacement never reimplements the original. It calls through, then wraps the returned search in a fresh one scoped to it with two `tag isNot` conditions. Wrapping instead of editing is what makes this safe: `getSearchObject` builds a new search on each call rather than handing back a reference to something the user owns, so nothing the plugin adds to the wrapper can leak into a saved search.

Two row kinds are excluded from wrapping, because scoping them would change what the row means rather than narrow it. The trash view searches for deleted items, and a plain `Zotero.Search` excludes deleted items, so a scoped wrapper would empty the trash of everything rather than just of plugin rows. The feeds pseudo-library has no `libraryID` to scope to in the first place.

## Why the patch is global, not per window

Every other UI registration in this plugin is per main window: the File-menu item, the item context-menu entries, each with its own toolkit, for reasons covered in [lifecycle-explanation.md](lifecycle-explanation.md).

The item-tree filter is the exception, and `onStartup` says so in a comment on the call. `Zotero.CollectionTreeRow` is one constructor shared by every window, and its prototype is one object. Patch it once and the behavior changes everywhere. Patch it per window and you stack N wrappers on the same prototype, each calling through to the one below. The rows would get filtered N times, which is harmless, but unregistering one window's wrapper would restore whichever function happened to be underneath it, which very much isn't.

So `registerLibraryFilter()` runs once in `onStartup` and `unregisterLibraryFilter()` once in `onShutdown`, and the register function guards on `original` being set so a second call is a no-op.

`refreshItemTrees()` is the piece that still has to iterate windows. The patch is shared but the rendered views aren't, so a preference toggle has to redraw each of them.

## Why the whole subtree is hidden, not just the container

The first version excluded only the container tag. The container came straight back.

A library row's search matches child items, not just top-level ones. When the item tree gets a match whose parent isn't itself in the result set, it draws a row for that parent so the child has somewhere to live. Each mindmap storage note is a child of the container and carries its own tag, so excluding the container alone left every storage note matching, and each of those pulled the container back up as a top-level row.

Hence two conditions: `tag isNot CONTAINER_TAG` and `tag isNot STORAGE_TAG`. Hiding a parent means hiding everything under it.

`test/mindmap/libraryFilter.test.ts` asserts both ids are absent from the filtered result, with a comment recording why the note id is checked and not just the container id.

## Restoring the method is not tidiness

`unregisterLibraryFilter()` writes the saved function back onto the prototype, and the test suite asserts strict identity: the prototype has to end up holding the exact function object it started with.

The reason is hot reload. `npm start` reinstalls the plugin into a running Zotero on every source change, which runs `onShutdown` and then a fresh `onStartup`. If the patch survived the shutdown, the next `registerLibraryFilter()` would save the previous wrapper as its `original` and wrap that. Reload a few times and every item-tree query runs through a stack of closures. Worse, the first unregister would restore the second-to-last wrapper instead of Zotero's own method, and each one after that would leave the prototype further from where it started, with no error at any point along the way.

## Failing open, and the upgrade risk

`getSearchObject` is undocumented internal API, and the code around it moves. The item tree was refactored onto a row provider in Zotero 10.0-beta.25.

A Zotero release can break this in two ways, and the code is built for both.

If the method is gone or is no longer a function, `registerLibraryFilter()` logs through `logFailure` and returns without patching anything. The plugin runs, and the container row is visible.

If the method is still there but the wrap throws (a condition name changed, `setScope` behaves differently, the row shape moved), the `catch` inside the replacement logs and returns the original search. One visible row, rather than an item tree that renders nothing.

What neither path gives you is a signal. There is no error dialog, no failed startup, no test that runs against a future Zotero. A user on a version where this stops working just sees the plugin's container item appear in their library, with no way to connect it to a Zotero upgrade. That is the honest cost of the approach: it degrades quietly, and the only detection mechanism is somebody noticing the row.

The mitigation available today is the preference. `hideMindmapNotes` defaults to on but can be turned off, and the container is a normal item, so a user who does see it can work out what it is. That is why it is named "Zotero Linked Mindmaps (plugin data)" instead of something opaque. See [plugin-data-explanation.md](../user-guide/plugin-data-explanation.md).

## Related

- [library-filter-reference.md](library-filter-reference.md) for the function-level detail.
- [storage-explanation.md](storage-explanation.md) for why the data lives in library items at all.
- [container-guard-explanation.md](container-guard-explanation.md) for the other consequence of the container being a real, user-reachable item.

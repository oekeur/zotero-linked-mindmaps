# Library item-tree filter reference

`src/modules/mindmap/libraryFilter.ts` hides the plugin's container item, and the storage notes under it, from Zotero's item tree while the `hideMindmapNotes` preference is on.

It does this by replacing `Zotero.CollectionTreeRow.prototype.getSearchObject`. Nothing in the file touches the item tree directly.

## Module state

Three module-level values, all reset by `unregisterLibraryFilter()`:

- `original: GetSearchObject | undefined` holds the method that was on the prototype before the patch. Its presence is also the "already registered" flag.
- `prefObserver: symbol | undefined` holds the handle returned by `Zotero.Prefs.registerObserver`.
- `PREF_KEY` is `` `${config.prefsPrefix}.hideMindmapNotes` ``, which resolves to `extensions.zotero.zoterolinkedmindmaps.hideMindmapNotes`.

The tags it filters on, `CONTAINER_TAG` and `STORAGE_TAG`, are imported from `storage.ts`. See [storage-reference.md](storage-reference.md).

## `registerLibraryFilter(): void`

Returns early if `original` is already set, so calling it twice does not stack a second wrapper.

Reads `Zotero.CollectionTreeRow?.prototype`. If `getSearchObject` on it is not a function, logs `no CollectionTreeRow.getSearchObject to patch; the plugin container stays visible` through `logFailure` and returns without patching. The plugin keeps working; the container row stays visible.

Otherwise it saves the original into `original`, and installs a replacement with the same signature:

```ts
(this: Zotero.CollectionTreeRow, options?: { unfiltered?: boolean }) =>
  Promise<Zotero.Search>;
```

The replacement always calls through first: `const result = await callThrough.call(this, options)`. Everything after that call is inside a `try`/`catch` that logs and returns `result` unchanged on any error.

Inside the `try`:

- Returns `result` untouched when `options?.unfiltered` is set or when `getPref("hideMindmapNotes")` is falsy.
- Otherwise returns `withoutContainer(this, result)` when `isFilterable(this)`, and `result` when not.

It then registers the pref observer:

```ts
prefObserver = Zotero.Prefs.registerObserver(PREF_KEY, refreshItemTrees, true);
```

The third argument marks the key as a plugin pref, matching the `true` that `getPref`/`setPref` pass.

## `unregisterLibraryFilter(): void`

Unregisters the pref observer if one is held, and clears `prefObserver`.

Returns early if `original` is unset. Otherwise it writes `original` back onto `Zotero.CollectionTreeRow.prototype.getSearchObject`, clears `original`, and calls `refreshItemTrees()` so open views stop filtering immediately.

Restoring the method is required rather than tidiness. A patch that survives an unload is what the next load wraps, so `npm start`'s hot reload would leave the previous closure calling through to itself. `test/mindmap/libraryFilter.test.ts` asserts the prototype ends up holding the exact function object it started with.

## `isFilterable(row): boolean`

Decides whether wrapping the row's search would only narrow the result rather than change what it means. Returns `false` for:

- `row.isTrash()`. The trash view searches for deleted items, and a plain `Zotero.Search` excludes deleted items, so scoping it would empty the trash of everything.
- `row.isFeed()` and `row.isFeeds?.()`. The feeds pseudo-library has no `libraryID` to scope to.

Otherwise returns `typeof row.ref?.libraryID === "number"`.

## `withoutContainer(row, result): Zotero.Search`

Builds a new `Zotero.Search` and returns it. The new search:

- adds condition `libraryID` `is` `row.ref.libraryID`;
- adds condition `tag` `isNot` `CONTAINER_TAG`;
- adds condition `tag` `isNot` `STORAGE_TAG`;
- calls `filtered.setScope(result, false)`, scoping itself to the search that came back from the original method.

Both tags are excluded, not just the container tag. A library row's search matches child items too, and the item tree answers a matching child whose parent is missing by drawing a row for the parent, which puts the container straight back on screen.

Wrapping the original result is safe because `getSearchObject` always builds and returns a fresh search rather than handing back a reference to a user's saved search.

## `refreshItemTrees(): void`

Iterates `Zotero.getMainWindows()` and calls `ZoteroPane?.itemsView?.refreshAndMaintainSelection?.()` on each, discarding the promise. Every call is optional-chained, so a window without a pane or a view is skipped.

The row's search is cached per row, and the refresh clears that cache before rebuilding, so toggling the preference takes effect without a restart.

## The unfiltered escape hatch

`getSearchObject({ unfiltered: true })` returns the original, unwrapped search. Callers that need to reach the container, including the plugin's own storage lookups and anything in Zotero that asks for the unfiltered view, are unaffected by the patch.

`test/mindmap/libraryFilter.test.ts` covers this directly: with the preference on, `libraryItemIDs({ unfiltered: true })` still includes the container id.

## Preference

`hideMindmapNotes` is a boolean defaulting to `true` (`addon/prefs.js`, prefixed at build time). The preferences pane exposes it as a checkbox; see [prefs-reference.md](prefs-reference.md) and [hide-plugin-data-reference.md](../user-guide/hide-plugin-data-reference.md).

## Failure behavior

The wrap fails open. Any exception from `isFilterable` or `withoutContainer` is caught, logged through `logFailure` as `hiding the plugin container failed, leaving it visible: <message>`, and the original search is returned. A Zotero change that breaks the wrap costs one visible row rather than an item tree that renders nothing. `test/mindmap/libraryFilter.test.ts` exercises this by throwing from `Zotero.Search.prototype.addCondition` for the container tag and asserting the container id is still in the result.

## See also

- [library-filter-explanation.md](library-filter-explanation.md) for why this is a monkey patch and what breaks it.
- [container-guard-reference.md](container-guard-reference.md) for the container item this hides.
- [hide-plugin-data-howto.md](../user-guide/hide-plugin-data-howto.md) for the user-facing toggle.

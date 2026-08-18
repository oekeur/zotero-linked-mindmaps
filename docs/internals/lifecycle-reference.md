# Plugin lifecycle reference

Every entry point the plugin exposes, in the order Zotero calls it, with the registrations each one makes and where the matching teardown lives.

Source: `addon/bootstrap.js`, `src/index.ts`, `src/addon.ts`, `src/hooks.ts`.

## Bootstrap entry points

`addon/bootstrap.js` is the file Zotero loads directly. It is copied into the build verbatim except for the `__addonRef__` and `__addonInstance__` placeholders, which the scaffold replaces with `zoterolinkedmindmaps` and `ZoteroLinkedMindmaps`.

`install(data, reason)` and `uninstall(data, reason)` are empty.

`startup({ id, version, resourceURI, rootURI }, reason)` does four things in order:

1. Registers a chrome mapping through `amIAddonManagerStartup.registerChrome`, pointing `content/zoterolinkedmindmaps` at `rootURI + "content/"`. The returned handle is kept in the module-level `chromeHandle`. This is what makes `chrome://zoterolinkedmindmaps/content/addLink.xhtml` resolve, the document `openAddLinkDialog` opens.
2. Builds the plugin sandbox context: `const ctx = { rootURI }; ctx._globalThis = ctx;`. Everything assigned to `_globalThis` inside the bundle becomes a plugin-global.
3. Loads the bundle with `Services.scriptloader.loadSubScript(rootURI + "/content/scripts/zoterolinkedmindmaps.js", ctx)`.
4. Awaits `Zotero.ZoteroLinkedMindmaps.hooks.onStartup()`.

`onMainWindowLoad({ window }, reason)` and `onMainWindowUnload({ window }, reason)` forward the window to the matching hook, using optional chaining on the plugin instance so a window event arriving before or after the instance exists is a no-op.

`shutdown({ id, version, resourceURI, rootURI }, reason)` returns immediately when `reason === APP_SHUTDOWN`; Zotero is closing, so nothing needs unwinding. Otherwise it awaits `hooks.onShutdown()` and then calls `chromeHandle.destruct()`, clearing the handle.

`manifest.json` declares `strict_min_version` `6.999` and `strict_max_version` `10.*` under `applications.zotero`. A `strict_max_version` below the running Zotero blocks the plugin with no console error and no install failure; see [configuration-reference.md](../contributing/configuration-reference.md).

## Bundle entry point

`src/index.ts` runs the moment `loadSubScript` evaluates the bundle.

Its first statement is `import "./utils/consolePolyfill"`, before any other import, because Cytoscape reaches for `console` at module top level. See [polyfills-reference.md](polyfills-reference.md).

It then constructs a `BasicTool` and checks `Zotero.ZoteroLinkedMindmaps`. When that is unset it:

- assigns `_globalThis.addon = new Addon()`;
- defines `ztoolkit` on `_globalThis` as a getter returning `_globalThis.addon.data.ztoolkit`, so every module reading the bare `ztoolkit` global follows whatever `addon.data.ztoolkit` currently points at rather than capturing one instance;
- assigns `Zotero.ZoteroLinkedMindmaps = addon`.

The guard means a second evaluation of the bundle in the same Zotero session (hot reload) leaves the existing singleton in place.

`defineGlobal(name, getter?)` is a local helper: with a getter it installs that getter, without one it falls back to `basicTool.getGlobal(name)`.

## The `Addon` singleton

`src/addon.ts` exports the `Addon` class. One instance lives at `Zotero.ZoteroLinkedMindmaps` and at the plugin-global `addon`.

`addon.data`:

| Field         | Type                                | Set by                                                                                             |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `alive`       | `boolean`                           | `true` in the constructor, `false` at the end of `onShutdown`                                      |
| `config`      | `typeof config` from `package.json` | constructor                                                                                        |
| `env`         | `"development" \| "production"`     | constructor, from the build-time `__env__` define                                                  |
| `initialized` | `boolean \| undefined`              | `false` in the constructor, `true` at the end of `onStartup`                                       |
| `ztoolkit`    | `ZToolkit`                          | constructor via `createZToolkit()`, then reassigned by `onMainWindowLoad` and `onMainWindowUnload` |
| `locale`      | `{ current: any } \| undefined`     | `initLocale()`                                                                                     |
| `dialog`      | `DialogHelper \| undefined`         | assigned by whichever module opens a dialog; closed in `onMainWindowUnload` and `onShutdown`       |

`addon.hooks` is the default export of `src/hooks.ts`. `addon.api` is an empty object; nothing writes to it yet.

`addon.data.initialized` is the flag the test harness polls. `zotero-plugin.config.ts` sets `waitForPlugin: "() => Zotero.ZoteroLinkedMindmaps.data.initialized"`, and `zotero-plugin test` fails the run with a nonzero exit if the flag never becomes true within its window. `test/startup.test.ts` separately asserts that `Zotero[config.addonInstance]` is non-empty.

## `onStartup()`

Async. Called once, from `bootstrap.js` `startup()`.

1. Awaits `Zotero.initializationPromise`, `Zotero.unlockPromise` and `Zotero.uiReadyPromise` in parallel.
2. `initLocale()`. Builds the Fluent bundle over `LOCALE_FILES` and stores it at `addon.data.locale.current`. See [locale-reference.md](locale-reference.md).
3. `ConnectionsPanelFactory.register()`. Calls `Zotero.ItemPaneManager.registerSection` with paneID `zotero-linked-mindmaps-connections` and keeps the returned id in a module-level `registeredPaneID`.
4. `registerDeletionObserver()`. `Zotero.Notifier.registerObserver` on type `item` with observer id `zoterolinkedmindmaps-deletion-cleanup`. The returned id is stored in the module-level `deletionObserverID` in `hooks.ts`.
5. `registerContainerObserver()`. `Zotero.Notifier.registerObserver` on type `item` with observer id `zoterolinkedmindmaps-container-guard`, stored in `containerObserverID`.
6. `registerLibraryFilter()`. Replaces `Zotero.CollectionTreeRow.prototype.getSearchObject` and registers a `Zotero.Prefs` observer on `extensions.zotero.zoterolinkedmindmaps.hideMindmapNotes`. See [library-filter-reference.md](library-filter-reference.md).
7. `await Zotero.PreferencePanes.register({ pluginID, id: "zoterolinkedmindmaps-link-types-pane", src: rootURI + "content/preferences.xhtml", label: getString("preferences-pane-label"), image: rootURI + "content/icons/favicon.png", stylesheets: [rootURI + "content/preferences.css"] })`.
8. `startupToolkit = addon.data.ztoolkit`, then `registerMindmapShortcut()`, which calls `ztoolkit.Keyboard.register` on that toolkit and opens the mindmap tab on `Shift+G` unless the event target is an input, textarea, or contenteditable element.
9. `await Promise.all(Zotero.getMainWindows().map((win) => onMainWindowLoad(win)))`. Zotero does not replay `onMainWindowLoad` for windows already open when the plugin starts, so startup drives them itself.
10. `await reconcileContainers()`. Runs after step 9 on purpose; see [lifecycle-explanation.md](lifecycle-explanation.md).
11. `addon.data.initialized = true`.

## `onMainWindowLoad(win)`

Async. Called from `bootstrap.js` for every main window opened after startup, and directly from `onStartup` for windows already open.

1. `createZToolkit()` produces a toolkit for this window. It goes into the module-level `windowToolkits: Map<Window, ZToolkit>` keyed by the window, and into `addon.data.ztoolkit`, which the bare `ztoolkit` global resolves through. Everything registered below therefore lands on this window's toolkit.
2. `win.MozXULElement.insertFTLIfNeeded("zoterolinkedmindmaps-mainWindow.ftl")` adds the main-window Fluent file to that window's l10n context, which is what `data-l10n-id` attributes resolve against.
3. `insertStylesheet(win)` appends a `<link id="zoterolinkedmindmaps-stylesheet" rel="stylesheet">` pointing at `content/zoteroPane.css` to the window's `documentElement`, unless one is already there. This is the only route the plugin's own CSS reaches a main window; the preferences window and the standalone Add link document each load their sheet separately.
4. `registerMindmapMenu()`. `ztoolkit.Menu.register("menuFile", …)` adds a File-menu item labelled from `menuitem-mindmap-open` whose command listener calls `openMindmapTab()`.
5. `LibraryContextMenuFactory.register(win)`. Two `ztoolkit.Menu.register("item", …)` calls, each carrying an icon and preceded by a separator: "Add to Mindmap" (`itemmenu-add-to-mindmap`) and "Add Link…" (`itemmenu-add-link`). Both hide themselves when the window's selection contains no eligible item. See [library-menu-reference.md](../user-guide/library-menu-reference.md).
6. Shows a `ztoolkit.ProgressWindow` reading `startup-begin`, waits 1000 ms via `Zotero.Promise.delay`, rewrites the line to `[100%] ` plus `startup-finish`, and starts a 5000 ms close timer. This is template scaffolding that has not been removed.

The registrations in steps 4 and 5 have no direct unregister call anywhere. They are torn down through `toolkit.unregisterAll()` in `onMainWindowUnload` and `onShutdown`. The stylesheet is not a toolkit registration and is removed explicitly, by id, in both.

## `onMainWindowUnload(win)`

Async, though it awaits nothing.

1. `removeStylesheet(win)` drops the `<link>` added on load, by id.
2. Looks the window's toolkit up in `windowToolkits`, deletes the entry, and calls `toolkit?.unregisterAll()`. That removes the File-menu item, both item context-menu items, and any other element that toolkit created in that window.
3. If `addon.data.ztoolkit` was the toolkit just torn down, reassigns it to the first remaining value in `windowToolkits`, falling back to `startupToolkit`, falling back to leaving it as it was.
4. `addon.data.dialog?.window?.close()`.

## `onShutdown()`

Synchronous. Called from `bootstrap.js` `shutdown()` for every reason except `APP_SHUTDOWN`.

| Step                                                                                                    | Undoes                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ConnectionsPanelFactory.unregister()`                                                                  | the item-pane section from step 3 of startup; logs and returns early if `registeredPaneID` is falsy   |
| `unregisterDeletionObserver(deletionObserverID)`, then clears the id                                    | the deletion observer                                                                                 |
| `unregisterContainerObserver(containerObserverID)`, then clears the id                                  | the container-guard observer                                                                          |
| `unregisterLibraryFilter()`                                                                             | the `getSearchObject` patch and the pref observer                                                     |
| `closeMindmapTab()`                                                                                     | closes the mindmap tab through `Zotero_Tabs.close` if one is open, and clears the module-level tab id |
| `for (const toolkit of windowToolkits.values()) toolkit.unregisterAll()`, then `windowToolkits.clear()` | every per-window menu registration                                                                    |
| `startupToolkit?.unregisterAll()`, then clears it                                                       | the `Shift+G` keyboard shortcut                                                                       |
| `ztoolkit.unregisterAll()`                                                                              | whatever the current global toolkit still holds                                                       |
| `addon.data.dialog?.window?.close()`                                                                    | an open dialog                                                                                        |
| `addon.data.alive = false`                                                                              | marks the instance dead for code that checks it                                                       |
| `delete Zotero.ZoteroLinkedMindmaps`                                                                    | the singleton                                                                                         |

The preference pane registered in step 7 of startup has no explicit unregister. `Zotero.PreferencePanes.register` takes a `pluginID` and Zotero unregisters the pane itself when that plugin shuts down.

Live-refresh observers registered by `attachLiveRefresh` in the graph renderer are not on this list. Each one is unregistered by the teardown function that `attachLiveRefresh` returns, which the mindmap tab controller calls from its own `teardown()`, reached through `closeMindmapTab()` and through the tab's `onClose` callback. See [rendering-reference.md](rendering-reference.md).

## `onPrefsEvent(type, data)`

Async. Not called by Zotero: `addon/content/preferences.xhtml` calls it from its link-types groupbox's `onload` attribute, and `test/mindmap/preferencesPane.test.ts` calls it directly to re-render the pane without a fresh load.

`"link-types-pane-load"` with `data.container` renders the link-type editor into that element through `renderLinkTypesSettings`. See [link-types-reference.md](../user-guide/link-types-reference.md).

The library groupbox's checkbox and help text no longer go through this hook: they carry `data-l10n-id` directly and resolve through the pane's own `<linkset>`; see [locale-reference.md](locale-reference.md).

Any other `type` falls through the `default` branch and does nothing.

## `onNotify`, `onShortcuts`, `onDialogEvents`

Template leftovers with no callers anywhere in `src/`, `addon/`, or `test/`.

`onNotify(event, type, ids, extraData)` calls `ztoolkit.log("notify", …)`. It is not registered with `Zotero.Notifier`; the plugin's real observers live in `deletionCleanup.ts`, `containerGuard.ts`, `libraryFilter.ts` (a prefs observer) and `graphRenderer.ts`.

`onShortcuts(type)` and `onDialogEvents(type)` are switch statements with only a `default: break`.

## See also

- [lifecycle-explanation.md](lifecycle-explanation.md) for why the toolkit is per window and why `reconcileContainers` runs last.
- [notifier-queue-explanation.md](notifier-queue-explanation.md) for the constraint every notifier observer registered above has to respect.
- [container-guard-reference.md](container-guard-reference.md) and [deletion-cleanup-reference.md](deletion-cleanup-reference.md) for what the two observers do once they fire.

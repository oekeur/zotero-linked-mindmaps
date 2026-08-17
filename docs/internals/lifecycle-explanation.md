# Why the lifecycle looks like this

Three decisions in `src/hooks.ts` don't become obvious from reading it: one toolkit per main window instead of one shared toolkit, a separately tracked `startupToolkit`, and `reconcileContainers()` running after the windows load instead of before. Each one came out of a failure you could see in the UI.

## One toolkit per main window

`zotero-plugin-toolkit`'s `unregisterAll()` removes every element the toolkit it is called on created, in whichever window it created them. That is the whole mechanism: the toolkit keeps a registry of what it made, and tearing it down walks that registry.

With a single shared toolkit, `onMainWindowUnload` had exactly one thing it could call. So closing either of two open main windows tore down every registration the plugin had made across both. The File-menu "Mindmap" entry and the "Add to mindmap" item context-menu entry vanished from the window still on screen, and nothing short of restarting Zotero put them back.

`windowToolkits: Map<Window, ZToolkit>` fixes that by making the teardown unit match the registration unit. `onMainWindowLoad` builds a toolkit, files it under the window, and points `addon.data.ztoolkit` at it, so `registerMindmapMenu()` and `LibraryContextMenuFactory.register(win)` register against the toolkit belonging to the window they are decorating. `onMainWindowUnload` looks up that one toolkit, drops it from the map, and unregisters only it.

The global `ztoolkit` is a getter (installed in `src/index.ts`) that reads `addon.data.ztoolkit` on every access, so "the current toolkit" is a single mutable pointer instead of something modules capture at import time. Registration code never has to know which window it is targeting. It reads the global and gets whatever `onMainWindowLoad` most recently set.

Following a pointer like that has a cost. Code running outside a window-load that reads `ztoolkit` gets the most recently loaded window's toolkit, not any particular one. For the ProgressWindow calls that is fine, since a progress window belongs to whichever window is frontmost anyway. Anything that needs a specific window gets it passed explicitly, which is why `LibraryContextMenuFactory.register` takes `win` and closes over it.

## Why the global toolkit is handed to a surviving window

`addon.data.ztoolkit` points at the last window that loaded. Close that window and the pointer is left aiming at a toolkit that has just had `unregisterAll()` called on it, attached to a dead window.

Anything reading the global afterwards (a ProgressWindow from the container guard, a menu registration from a window loading a moment later) would be operating against a torn-down toolkit in a closed window. So `onMainWindowUnload` checks whether the toolkit it just destroyed was the one the global pointed at, and if so moves the pointer to the first toolkit still in `windowToolkits`, falling back to `startupToolkit`, falling back to leaving it alone. That last fallback covers the case where every main window is gone, where there is no better answer available and a stale pointer is no worse than an undefined one.

## Why `startupToolkit` is tracked separately

The keyboard shortcut is the reason. `registerMindmapShortcut()` runs in `onStartup`, before the loop over `Zotero.getMainWindows()`, so it registers against `addon.data.ztoolkit` as it stands at that moment: the toolkit the `Addon` constructor built, not any per-window one. `onStartup` captures that toolkit in `startupToolkit` on the line above.

Without the capture, the first `onMainWindowLoad` would overwrite `addon.data.ztoolkit` and the shortcut's owning toolkit would become unreachable. `onShutdown` would then unregister every window toolkit and the current global, and the `Shift+G` handler would outlive the plugin, still firing into torn-down code. `startupToolkit?.unregisterAll()` in `onShutdown` closes that gap. It also gives `onMainWindowUnload` a last-resort target for the global pointer when the final main window closes.

## Why `reconcileContainers()` runs after the windows load

`reconcileContainers()` walks every editable library, migrates and de-duplicates the plugin's container item, and reports any library whose container is sitting in the trash. That report is a `ztoolkit.ProgressWindow`.

A ProgressWindow needs a window to appear in, which is what the ordering comment in `onStartup` records. Run the reconciliation ahead of the `onMainWindowLoad` loop and the warning gets constructed at a point where the plugin hasn't set up any window yet, so it goes nowhere. The user's mindmaps have all disappeared, because a trashed parent hides its child notes from `Zotero.Search`, and the one message explaining why never appears. (The exact reason a pre-loop ProgressWindow fails isn't recorded beyond that comment, and the ordering hasn't been re-tested since.)

Moving the call after the window loop costs nothing else. The reconciliation touches storage rather than UI, and no other startup step depends on it having run. What you trade is a slightly later `addon.data.initialized = true`, which only the test harness ever observes.

The same warning has a second delivery path for a trash that happens while Zotero is already running, through the container-guard notifier observer. See [container-guard-explanation.md](container-guard-explanation.md).

## What `onShutdown` has to get right

Zotero calls `shutdown()` with `reason === APP_SHUTDOWN` when the whole application is closing, and `addon/bootstrap.js` returns early on that. The process is going away, so unwinding registrations is wasted work.

Every other reason (disable, uninstall, upgrade, and the reinstall that `npm start`'s hot reload performs) does run the teardown, and hot reload is what makes it matter. A registration left behind isn't merely untidy. It is what the next load stacks on top of. `unregisterLibraryFilter()` spells this out for the item-tree patch, where a patch that outlives an unload leaves the previous closure calling through to itself. See [library-filter-explanation.md](library-filter-explanation.md).

The `onShutdown` ordering isn't load-bearing except at one point. `closeMindmapTab()` runs before the toolkits are torn down, because closing the tab is what reaches the tab controller's `teardown()`, and that is what unregisters the graph's live-refresh notifier observer and destroys the Cytoscape instance.

## Related

- [lifecycle-reference.md](lifecycle-reference.md) for the ordered list of hooks and registrations.
- [notifier-queue-explanation.md](notifier-queue-explanation.md) for the constraint the observers registered at startup operate under.
- [development-setup.md](../contributing/development-setup.md) and [testing-explanation.md](../contributing/testing-explanation.md) for the hot-reload workflow that exercises shutdown most often.

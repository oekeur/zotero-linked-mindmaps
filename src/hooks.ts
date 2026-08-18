import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { ConnectionsPanelFactory } from "./modules/mindmap/connectionsPanel";
import { LibraryContextMenuFactory } from "./modules/mindmap/libraryContextMenu";
import {
  closeMindmapTab,
  registerMindmapMenu,
  registerMindmapShortcut,
} from "./modules/mindmap/mindmapTab";
import {
  registerDeletionObserver,
  unregisterDeletionObserver,
} from "./modules/mindmap/deletionCleanup";
import { renderLinkTypesSettings } from "./modules/mindmap/linkTypesSettings";
import {
  reconcileContainers,
  registerContainerObserver,
  unregisterContainerObserver,
} from "./modules/mindmap/containerGuard";
import {
  registerLibraryFilter,
  unregisterLibraryFilter,
} from "./modules/mindmap/libraryFilter";

let deletionObserverID: string | undefined;
let containerObserverID: string | undefined;

/**
 * One toolkit per main window. `unregisterAll()` takes down every element the
 * toolkit it is called on created, in whichever window it created them - so a
 * single shared toolkit meant closing either of two main windows stripped the
 * File-menu entry and the "Add to mindmap" context-menu entry from the one
 * still open.
 */
const windowToolkits = new Map<Window, ZToolkit>();

/**
 * The toolkit in place at startup, before any window replaced it. The keyboard
 * shortcut is registered against that one, so shutdown has to take it down
 * alongside the per-window toolkits.
 */
let startupToolkit: ZToolkit | undefined;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  ConnectionsPanelFactory.register();
  deletionObserverID = registerDeletionObserver();
  containerObserverID = registerContainerObserver();
  // Zotero.CollectionTreeRow is shared by every window, so this patch is
  // registered once here rather than per window.
  registerLibraryFilter();

  await Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    id: `${addon.data.config.addonRef}-link-types-pane`,
    src: rootURI + "content/preferences.xhtml",
    label: getString("preferences-pane-label"),
    image: `${rootURI}content/icons/favicon.png`,
    stylesheets: [`${rootURI}content/preferences.css`],
  });

  startupToolkit = addon.data.ztoolkit;
  registerMindmapShortcut();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // After the windows, not before: a library whose container is in the trash
  // is reported through a ProgressWindow, which needs a window to appear in.
  await reconcileContainers();

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Its own toolkit, tracked per window, so closing this window unregisters
  // only what this window registered. The global `ztoolkit` follows the most
  // recently loaded window, which is what the registrations below use.
  const toolkit = createZToolkit();
  windowToolkits.set(win, toolkit);
  addon.data.ztoolkit = toolkit;

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  insertStylesheet(win);

  registerMindmapMenu();
  LibraryContextMenuFactory.register(win);

  const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("startup-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  await Zotero.Promise.delay(1000);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(5000);
}

/**
 * The plugin's own styles, scoped to one <link> per main window so the same
 * element can be found and dropped again when that window closes. Every rule
 * in the sheet is written against Zotero's CSS variables: a hardcoded colour
 * would survive a theme switch, and on Linux the selection colour resolves to
 * the OS accent rather than to anything the plugin picks.
 */
const STYLESHEET_ID = "zoterolinkedmindmaps-stylesheet";

function insertStylesheet(win: Window): void {
  const doc = win.document;
  if (doc.getElementById(STYLESHEET_ID)) {
    return;
  }
  const link = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "link",
  ) as HTMLLinkElement;
  link.id = STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = `${rootURI}content/zoteroPane.css`;
  doc.documentElement?.appendChild(link);
}

function removeStylesheet(win: Window): void {
  win.document.getElementById(STYLESHEET_ID)?.remove();
}

async function onMainWindowUnload(win: Window): Promise<void> {
  removeStylesheet(win);
  const toolkit = windowToolkits.get(win);
  windowToolkits.delete(win);
  toolkit?.unregisterAll();
  // The global points at whichever window loaded last; hand it to a window
  // that is still open rather than leaving it on a closed one.
  if (addon.data.ztoolkit === toolkit) {
    addon.data.ztoolkit =
      windowToolkits.values().next().value ??
      startupToolkit ??
      addon.data.ztoolkit;
  }
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  for (const win of Zotero.getMainWindows()) {
    removeStylesheet(win);
  }
  ConnectionsPanelFactory.unregister();
  if (deletionObserverID) {
    unregisterDeletionObserver(deletionObserverID);
    deletionObserverID = undefined;
  }
  if (containerObserverID) {
    unregisterContainerObserver(containerObserverID);
    containerObserverID = undefined;
  }
  unregisterLibraryFilter();
  closeMindmapTab();
  for (const toolkit of windowToolkits.values()) {
    toolkit.unregisterAll();
  }
  windowToolkits.clear();
  startupToolkit?.unregisterAll();
  startupToolkit = undefined;
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "link-types-pane-load":
      if (data.container) {
        renderLinkTypesSettings(data.container as HTMLElement);
      }
      break;
    default:
      break;
  }
}

function onShortcuts(type: string) {
  switch (type) {
    default:
      break;
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    default:
      break;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};

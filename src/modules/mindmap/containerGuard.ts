/**
 * Keeps each library's storage notes under one container item and tells the
 * user when that container lands in the trash.
 *
 * The trash case is worth a warning of its own because nothing in Zotero's UI
 * connects the two ends of it: a trashed parent hides its child notes from
 * Zotero.Search, so one trash action makes every mindmap in the library
 * disappear from the plugin at once. The warning is all this does. Un-trashing
 * would reverse a deliberate user action, and creating a replacement container
 * would send the next write somewhere the trashed mindmaps can never be
 * recovered into.
 */
import { getString } from "../../utils/locale";
import { CONTAINER_TAG, reconcileContainer } from "./storage";

const OBSERVER_ID = "zoterolinkedmindmaps-container-guard";

function warn(text: string): void {
  new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({ text, type: "fail" })
    .show();
}

/**
 * Migrates and de-duplicates the container in every library the user can write
 * to, warning about any whose container is in the trash. Runs at startup and
 * is a no-op on the second run.
 */
export async function reconcileContainers(): Promise<void> {
  for (const library of Zotero.Libraries.getAll()) {
    if (!library.editable) {
      continue;
    }
    try {
      if ((await reconcileContainer(library.libraryID)) === "trashed") {
        warn(getString("container-trashed-startup"));
      }
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] container reconciliation failed for library ${library.libraryID}: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Returns nothing rather than a promise, for the reason spelled out in
 * storage.ts: Zotero awaits every observer inside the commit of the
 * transaction that fired the notification, so an observer that awaits a
 * storage-queue write wedges the queue for the session. Nothing here touches
 * the queue, and nothing here may start to.
 */
function notify(
  event: _ZoteroTypes.Notifier.Event,
  type: _ZoteroTypes.Notifier.Type,
  ids: string[] | number[],
): void {
  if (event !== "trash" || type !== "item") {
    return;
  }
  void (async () => {
    try {
      for (const id of ids) {
        const item = (await Zotero.Items.getAsync(Number(id))) as
          Zotero.Item | false;
        // The same event fires on restore, so the deleted flag is what
        // separates "moved to trash" from "taken back out of it".
        if (item && item.deleted && item.hasTag(CONTAINER_TAG)) {
          warn(getString("container-trashed-now"));
          return;
        }
      }
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] container trash check failed: ${(err as Error).message}`,
      );
    }
  })();
}

export function registerContainerObserver(): string {
  return Zotero.Notifier.registerObserver({ notify }, ["item"], OBSERVER_ID);
}

export function unregisterContainerObserver(id: string): void {
  Zotero.Notifier.unregisterObserver(id);
}

/**
 * Hides the plugin's container item, and the storage notes under it, from the
 * item tree while the hideMindmapNotes preference is on.
 *
 * Zotero has no supported way to filter rows out of the item tree, so this
 * replaces Zotero.CollectionTreeRow.prototype.getSearchObject: it calls the
 * original, then wraps what came back in a fresh search scoped to it that
 * excludes both plugin tags. Wrapping is safe because getSearchObject always
 * hands back a search it just built rather than a reference to a user's saved
 * search.
 *
 * Everything after the call-through is inside a catch that returns the
 * original result. getSearchObject is undocumented internal API, and the code
 * around it is moving - itemTree was refactored onto a row provider in
 * 10.0-beta.25. Failing open means a Zotero update costs one visible row
 * instead of an item tree that renders nothing.
 */
import { getPref } from "../../utils/prefs";
import { logFailure } from "../../utils/logging";
import { config } from "../../../package.json";
import { CONTAINER_TAG, STORAGE_TAG } from "./storage";

type SearchOptions = { unfiltered?: boolean };
type GetSearchObject = (
  this: Zotero.CollectionTreeRow,
  options?: SearchOptions,
) => Promise<Zotero.Search>;

const PREF_KEY = `${config.prefsPrefix}.hideMindmapNotes`;

let original: GetSearchObject | undefined;
let prefObserver: symbol | undefined;

/**
 * Rows whose results the wrap would change the meaning of, rather than just
 * narrow. The trash view searches for deleted items, and a plain search
 * excludes those, so scoping it would empty the trash of everything; the feeds
 * pseudo-library has no libraryID to scope to.
 */
function isFilterable(row: Zotero.CollectionTreeRow): boolean {
  const anyRow = row as unknown as {
    isFeeds?: () => boolean;
    ref?: { libraryID?: unknown };
  };
  if (row.isTrash() || row.isFeed() || anyRow.isFeeds?.()) {
    return false;
  }
  return typeof anyRow.ref?.libraryID === "number";
}

/**
 * Drops the storage notes as well as the container. A library row's search
 * matches child items too, and the item tree answers a matching child whose
 * parent is missing by adding a row for the parent - so excluding the
 * container alone puts it straight back on screen.
 */
function withoutContainer(
  row: Zotero.CollectionTreeRow,
  result: Zotero.Search,
): Zotero.Search {
  const filtered = new Zotero.Search();
  filtered.addCondition(
    "libraryID",
    "is",
    (row.ref as { libraryID: number }).libraryID,
  );
  filtered.addCondition("tag", "isNot", CONTAINER_TAG);
  filtered.addCondition("tag", "isNot", STORAGE_TAG);
  filtered.setScope(result, false);
  return filtered;
}

/**
 * Redraws every open item tree. The row's own search is cached per row, and
 * the refresh clears that cache before rebuilding, so a toggle lands without a
 * restart.
 */
function refreshItemTrees(): void {
  for (const win of Zotero.getMainWindows()) {
    const view = (win as _ZoteroTypes.MainWindow).ZoteroPane?.itemsView as
      { refreshAndMaintainSelection?: () => Promise<void> } | undefined;
    void view?.refreshAndMaintainSelection?.();
  }
}

export function registerLibraryFilter(): void {
  if (original) {
    return;
  }
  const proto = (
    Zotero as unknown as { CollectionTreeRow?: { prototype: any } }
  ).CollectionTreeRow?.prototype;
  if (typeof proto?.getSearchObject !== "function") {
    logFailure(
      "[zoteroLinkedMindmaps] no CollectionTreeRow.getSearchObject to patch; the plugin container stays visible",
    );
    return;
  }

  original = proto.getSearchObject as GetSearchObject;
  const callThrough = original;
  proto.getSearchObject = async function (
    this: Zotero.CollectionTreeRow,
    options?: SearchOptions,
  ): Promise<Zotero.Search> {
    const result = await callThrough.call(this, options);
    try {
      if (options?.unfiltered || !getPref("hideMindmapNotes")) {
        return result;
      }
      return isFilterable(this) ? withoutContainer(this, result) : result;
    } catch (err) {
      logFailure(
        `[zoteroLinkedMindmaps] hiding the plugin container failed, leaving it visible: ${(err as Error).message}`,
        err,
      );
      return result;
    }
  };

  prefObserver = Zotero.Prefs.registerObserver(
    PREF_KEY,
    refreshItemTrees,
    true,
  );
}

/**
 * Puts Zotero's own method back. Required, not tidiness: a patch that outlives
 * an unload gets stacked on by the next load, so `npm start`'s hot reload would
 * leave the previous closure calling through to itself.
 */
export function unregisterLibraryFilter(): void {
  if (prefObserver) {
    Zotero.Prefs.unregisterObserver(prefObserver);
    prefObserver = undefined;
  }
  if (!original) {
    return;
  }
  (
    Zotero as unknown as { CollectionTreeRow: { prototype: any } }
  ).CollectionTreeRow.prototype.getSearchObject = original;
  original = undefined;
  refreshItemTrees();
}

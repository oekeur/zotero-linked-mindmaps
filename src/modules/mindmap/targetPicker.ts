/**
 * Link-target picker: a search-filtered dialog for choosing which Zotero
 * item a link should point to. Live-filters via Zotero.Search rather than
 * a client-side substring filter, and renders results with
 * VirtualizedTableHelper so a large library stays responsive.
 */
import { config } from "../../../package.json";
import type { VirtualizedTableHelper } from "zotero-plugin-toolkit";
import type { ZoteroObjectRef } from "./schema";

const RESULT_CAP = 200;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Runs a live Zotero.Search for top-level, non-note, non-attachment items
 * matching `query` (title/creator/year, per Zotero's own quicksearch
 * condition). Results are capped client-side since Zotero.Search has no
 * server-side LIMIT; `totalCount` reports the uncapped match count.
 */
export async function searchTargetItems(
  query: string,
  libraryID: number = Zotero.Libraries.userLibraryID,
): Promise<{ items: Zotero.Item[]; totalCount: number }> {
  const s = new Zotero.Search();
  s.addCondition("libraryID", "is", libraryID);
  s.addCondition("noChildren", "true");
  s.addCondition("itemType", "isNot", "attachment");
  s.addCondition("itemType", "isNot", "note");
  const trimmed = query.trim();
  if (trimmed) {
    s.addCondition("quicksearch-titleCreatorYear", "contains", trimmed);
  }
  const itemIDs = await s.search();
  const items = (await Zotero.Items.getAsync(
    itemIDs.slice(0, RESULT_CAP),
  )) as Zotero.Item[];
  return { items, totalCount: itemIDs.length };
}

export function toRef(item: Zotero.Item): ZoteroObjectRef {
  return { kind: "item", libraryID: item.libraryID, key: item.key };
}

function creatorYearLabel(item: Zotero.Item): string {
  const parts: string[] = [];
  if (item.firstCreator) {
    parts.push(item.firstCreator);
  }
  const date = item.getField("date", true, true) as string;
  const year = date && date.slice(0, 4);
  if (year && year !== "0000") {
    parts.push(`(${year})`);
  }
  return parts.join(" ");
}

/**
 * Opens the picker dialog and resolves with the chosen item's
 * ZoteroObjectRef, or null if the user cancels/closes without selecting.
 */
export function openTargetPicker(): Promise<ZoteroObjectRef | null> {
  return new Promise((resolve) => {
    let results: Zotero.Item[] = [];
    let selectedRef: ZoteroObjectRef | null = null;
    let tableHelper: VirtualizedTableHelper | undefined;
    let searchToken = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const tableContainerId = `${config.addonRef}-target-picker-table-${Zotero.Utilities.randomString()}`;
    const capLabelId = `${config.addonRef}-target-picker-cap-label`;

    async function runSearch(query: string) {
      const token = ++searchToken;
      const { items, totalCount } = await searchTargetItems(query);
      if (token !== searchToken) {
        // A newer search started before this one resolved; discard.
        return;
      }
      results = items;
      tableHelper?.render();
      const capLabel = dialog.window.document.getElementById(capLabelId);
      if (capLabel) {
        capLabel.textContent =
          totalCount > RESULT_CAP
            ? `Showing top ${RESULT_CAP} of ${totalCount} results — refine your search`
            : "";
      }
    }

    function buildTable() {
      tableHelper = new ztoolkit.VirtualizedTable(dialog.window)
        .setContainerId(tableContainerId)
        .setProp({
          id: `${config.addonRef}-target-picker-vtable`,
          columns: [
            { dataKey: "title", label: "Title", flex: 4 },
            { dataKey: "creator", label: "Creator/Year", flex: 2 },
          ],
          showHeader: true,
          multiSelect: false,
          disableFontSizeScaling: true,
          getRowCount: () => results.length,
          getRowData: (index: number) => {
            const item = results[index];
            return {
              title: item.getField("title") || item.getDisplayTitle(),
              creator: creatorYearLabel(item),
            };
          },
          onActivate: (_e, indices: number[]) => {
            const index = indices[0];
            if (index === undefined || !results[index]) {
              return;
            }
            selectedRef = toRef(results[index]);
            dialog.window.close();
          },
        })
        .render();
    }

    const dialog = new ztoolkit.Dialog(3, 1)
      .addCell(
        0,
        0,
        {
          tag: "input",
          namespace: "html",
          id: "target-picker-search",
          attributes: {
            type: "text",
            placeholder: "Search items…",
          },
          styles: { width: "100%" },
          listeners: [
            {
              type: "input",
              listener: (e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                if (debounceTimer !== undefined) {
                  clearTimeout(debounceTimer);
                }
                debounceTimer = setTimeout(
                  () => runSearch(value),
                  SEARCH_DEBOUNCE_MS,
                );
              },
            },
          ],
        },
        false,
      )
      .addCell(
        1,
        0,
        {
          tag: "div",
          namespace: "html",
          id: capLabelId,
          styles: { fontSize: "0.9em", color: "GrayText" },
        },
        false,
      )
      .addCell(2, 0, {
        tag: "div",
        namespace: "html",
        id: tableContainerId,
        styles: { width: "100%", height: "320px" },
      })
      .addButton("Cancel", "cancel")
      .setDialogData({
        loadCallback: () => {
          buildTable();
          void runSearch("");
        },
        unloadCallback: () => {
          if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer);
          }
          resolve(selectedRef);
        },
      })
      .open("Select an item to link", {
        centerscreen: true,
        resizable: true,
        fitContent: false,
        width: 500,
        height: 450,
      });
  });
}

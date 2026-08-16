/**
 * Library right-click context menu entries: "Add to mindmap" appends every
 * eligible selected item as a mindmap node in one batch; "Add link..." opens
 * the standalone Add-link dialog for each eligible selected item in turn.
 * Both work directly on the library item list, without the item pane open.
 */
import { getString } from "../../utils/locale";
import { updateMindmapDocument } from "./storage";
import { openAddLinkDialog } from "./addLinkForm";
import { canBeMindmapNode, createMemberNode, refFor } from "./mutations";
import { refsMatch } from "./schema";

const ADD_TO_MINDMAP_MENU_ID = "zotero-linked-mindmaps-itemmenu-add-to-mindmap";
const ADD_LINK_MENU_ID = "zotero-linked-mindmaps-itemmenu-add-link";

function eligibleSelection(win: _ZoteroTypes.MainWindow): Zotero.Item[] {
  return win.ZoteroPane.getSelectedItems().filter(canBeMindmapNode);
}

/**
 * Adds every item in `items` that isn't already a mindmap node, as a new
 * unplaced node, in a single read-modify-write pass. Returns the number of
 * nodes actually added (items already present as a node are skipped).
 */
export async function addToMindmap(items: Zotero.Item[]): Promise<number> {
  const eligible = items.filter(canBeMindmapNode);
  if (eligible.length === 0) {
    return 0;
  }

  const libraryID = eligible[0].libraryID;
  let addedCount = 0;
  await updateMindmapDocument(
    (doc) => {
      addedCount = 0;
      for (const item of eligible) {
        const ref = refFor(item);
        if (doc.nodes.some((node) => refsMatch(node.ref, ref))) {
          continue;
        }
        doc.nodes.push(createMemberNode(ref));
        addedCount++;
      }
      return addedCount === 0 ? null : doc;
    },
    undefined,
    libraryID,
  );
  return addedCount;
}

/**
 * Opens the "Add link" dialog for each eligible item in `items`, one at a
 * time - each dialog only opens once the previous one has closed, so
 * concurrent dialogs can't race each other's read-modify-write save.
 */
async function addLinkForSelection(
  win: Window,
  items: Zotero.Item[],
): Promise<void> {
  for (const item of items.filter(canBeMindmapNode)) {
    await openAddLinkDialog(win, item);
  }
}

export class LibraryContextMenuFactory {
  static register(win: _ZoteroTypes.MainWindow): void {
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: ADD_TO_MINDMAP_MENU_ID,
      label: getString("itemmenu-add-to-mindmap"),
      commandListener: () => {
        void addToMindmap(eligibleSelection(win)).then((addedCount) => {
          new ztoolkit.ProgressWindow(addon.data.config.addonName)
            .createLine({
              text: getString("add-to-mindmap-progress", {
                args: { count: addedCount },
              }),
              type: "success",
            })
            .show()
            .startCloseTimer(3000);
        });
      },
      isHidden: () => eligibleSelection(win).length === 0,
    });

    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: ADD_LINK_MENU_ID,
      label: getString("itemmenu-add-link"),
      commandListener: () => {
        void addLinkForSelection(win, eligibleSelection(win));
      },
      isHidden: () => eligibleSelection(win).length === 0,
    });
  }
}

/**
 * Library right-click context menu entries: "Add to mindmap" appends every
 * eligible selected item as a mindmap node in one batch; "Add link..." opens
 * the standalone Add-link dialog for each eligible selected item in turn.
 * Both work directly on the library item list, without the item pane open.
 *
 * Each is a submenu of the library's mindmaps rather than a single action, so
 * the target is the user's to pick. Without that they wrote to whichever
 * mindmap happened to have the lowest-numbered storage note, with nothing on
 * screen saying which one that was.
 */
import { getString } from "../../utils/locale";
import { listMindmaps, updateMindmapDocument } from "./storage";
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
 *
 * `mindmapId` names the mindmap to add to; leaving it out means the library's
 * default one, which is created on demand.
 */
export async function addToMindmap(
  items: Zotero.Item[],
  mindmapId?: string,
): Promise<number> {
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
    mindmapId,
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
  mindmapId?: string,
): Promise<void> {
  for (const item of items.filter(canBeMindmapNode)) {
    await openAddLinkDialog(win, item, mindmapId);
  }
}

/**
 * Rebuilds a submenu from the library's mindmaps, one entry each, and reports
 * whether the parent entry should be hidden.
 *
 * Rebuilt on every open rather than at registration: mindmaps are created and
 * deleted from the tab while the menu sits registered, and a list captured
 * once would go stale with no way to notice. The toolkit only wires its
 * onShowing hook for menuitem and menuseparator, so for a menu the visibility
 * hook - which it does attach to the parent popup's popupshowing, and awaits -
 * is where this has to happen.
 *
 * A library with no mindmap yet gets a single entry that adds to the default
 * one, created on save. That keeps the entry usable before the user has been
 * anywhere near the mindmap tab.
 */
async function rebuildMindmapSubmenu(
  menu: Element,
  win: _ZoteroTypes.MainWindow,
  onPick: (mindmapId: string | undefined) => void,
): Promise<boolean> {
  const selection = eligibleSelection(win);
  if (selection.length === 0) {
    return true;
  }
  const popup = menu.querySelector("menupopup");
  if (!popup) {
    return true;
  }

  const doc = menu.ownerDocument as Document & {
    createXULElement: (tag: string) => Element;
  };
  popup.textContent = "";

  let mindmaps: { id: string; title: string; description?: string }[] = [];
  try {
    mindmaps = await listMindmaps(selection[0].libraryID);
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] could not list mindmaps for the item menu: ${(err as Error).message}`,
    );
  }

  const entries =
    mindmaps.length > 0
      ? mindmaps.map((mindmap) => ({
          id: mindmap.id as string | undefined,
          label: mindmap.title,
          tooltip: mindmap.description,
        }))
      : [
          {
            id: undefined,
            label: getString("itemmenu-default-mindmap"),
            tooltip: undefined,
          },
        ];

  for (const entry of entries) {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("label", entry.label);
    if (entry.tooltip) {
      menuitem.setAttribute("tooltiptext", entry.tooltip);
    }
    menuitem.addEventListener("command", () => onPick(entry.id));
    popup.appendChild(menuitem);
  }
  return false;
}

export class LibraryContextMenuFactory {
  static register(win: _ZoteroTypes.MainWindow): void {
    ztoolkit.Menu.register("item", {
      tag: "menu",
      id: ADD_TO_MINDMAP_MENU_ID,
      popupId: `${ADD_TO_MINDMAP_MENU_ID}-popup`,
      label: getString("itemmenu-add-to-mindmap"),
      isHidden: (elem) =>
        rebuildMindmapSubmenu(elem as unknown as Element, win, (mindmapId) => {
          void addToMindmap(eligibleSelection(win), mindmapId).then(
            (addedCount) => {
              new ztoolkit.ProgressWindow(addon.data.config.addonName)
                .createLine({
                  text: getString("add-to-mindmap-progress", {
                    args: { count: addedCount },
                  }),
                  type: "success",
                })
                .show()
                .startCloseTimer(3000);
            },
          );
        }),
    });

    ztoolkit.Menu.register("item", {
      tag: "menu",
      id: ADD_LINK_MENU_ID,
      popupId: `${ADD_LINK_MENU_ID}-popup`,
      label: getString("itemmenu-add-link"),
      isHidden: (elem) =>
        rebuildMindmapSubmenu(elem as unknown as Element, win, (mindmapId) => {
          void addLinkForSelection(win, eligibleSelection(win), mindmapId);
        }),
    });
  }
}

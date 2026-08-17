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
import {
  listMindmaps,
  updateMindmapDocument,
  type MindmapSummary,
} from "./storage";
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
 * A library with nothing to choose between gets no submenu at all - see the
 * pair of registrations below.
 */
async function rebuildMindmapSubmenu(
  menu: Element,
  mindmaps: MindmapSummary[],
  onPick: (mindmapId: string) => void,
): Promise<void> {
  const popup = menu.querySelector("menupopup");
  if (!popup) {
    return;
  }

  const doc = menu.ownerDocument as Document & {
    createXULElement: (tag: string) => Element;
  };
  popup.textContent = "";

  for (const mindmap of mindmaps) {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("label", mindmap.title);
    if (mindmap.description) {
      menuitem.setAttribute("tooltiptext", mindmap.description);
    }
    menuitem.addEventListener("command", () => onPick(mindmap.id));
    popup.appendChild(menuitem);
  }
}

/**
 * The library's mindmaps, read once per opening of the item menu.
 *
 * Four entries share this - a flat one and a submenu for each of the two
 * actions - and each has its own visibility hook, so without it one right
 * click parses every storage note in the library four times over.
 */
const listedPerPopup = new WeakMap<Event, Promise<MindmapSummary[]>>();

function mindmapsForPopup(
  event: Event,
  libraryID: number,
): Promise<MindmapSummary[]> {
  const cached = listedPerPopup.get(event);
  if (cached) {
    return cached;
  }
  const listing = listMindmaps(libraryID).catch((err: Error) => {
    Zotero.debug(
      `[zoteroLinkedMindmaps] could not list mindmaps for the item menu: ${err.message}`,
    );
    return [] as MindmapSummary[];
  });
  listedPerPopup.set(event, listing);
  return listing;
}

/**
 * Registers one action twice: a plain entry that acts on its own, and a
 * submenu of the library's mindmaps. Exactly one of the two is ever shown.
 *
 * Splitting it is what keeps the common case a single click. With no mindmap
 * yet, or exactly one, there is nothing to choose and the plain entry acts
 * directly - the no-mindmap case still creating the default mindmap on save,
 * as it always has. Only a library holding several shows the submenu. A
 * toolkit menu cannot become a menuitem after registration, so the two are
 * registered up front and the choice is made each time the menu opens.
 */
function registerMindmapAction(
  win: _ZoteroTypes.MainWindow,
  id: string,
  labels: { flat: string; submenu: string },
  act: (mindmapId?: string) => void,
): void {
  async function count(event: Event): Promise<number> {
    const selection = eligibleSelection(win);
    if (selection.length === 0) {
      return -1;
    }
    return (await mindmapsForPopup(event, selection[0].libraryID)).length;
  }

  // The ellipsis belongs on the entry that opens a dialog, not on a submenu
  // parent - and the two never appear at the same time, so each gets the
  // label that is right for it.
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id,
    label: labels.flat,
    commandListener: () => act(),
    isHidden: async (_elem, event) => (await count(event)) > 1,
  });

  ztoolkit.Menu.register("item", {
    tag: "menu",
    id: `${id}-submenu`,
    popupId: `${id}-popup`,
    label: labels.submenu,
    isHidden: async (elem, event) => {
      const selection = eligibleSelection(win);
      if (selection.length === 0) {
        return true;
      }
      const mindmaps = await mindmapsForPopup(event, selection[0].libraryID);
      if (mindmaps.length <= 1) {
        return true;
      }
      await rebuildMindmapSubmenu(elem as unknown as Element, mindmaps, act);
      return false;
    },
  });
}

export class LibraryContextMenuFactory {
  static register(win: _ZoteroTypes.MainWindow): void {
    registerMindmapAction(
      win,
      ADD_TO_MINDMAP_MENU_ID,
      {
        flat: getString("itemmenu-add-to-mindmap"),
        submenu: getString("itemmenu-add-to-mindmap"),
      },
      (mindmapId) => {
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
      },
    );

    registerMindmapAction(
      win,
      ADD_LINK_MENU_ID,
      {
        flat: getString("itemmenu-add-link"),
        submenu: getString("itemmenu-add-link-submenu"),
      },
      (mindmapId) => {
        void addLinkForSelection(win, eligibleSelection(win), mindmapId);
      },
    );
  }
}

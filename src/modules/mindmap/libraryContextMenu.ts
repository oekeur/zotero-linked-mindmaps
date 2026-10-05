/**
 * Library right-click context menu entries: "Add to mindmap" appends every
 * eligible selected item as a mindmap node in one batch; "Add link..." opens
 * the standalone Add-link dialog for each eligible selected item in turn;
 * "Group items on mindmap" does both the add and the grouping in one write,
 * then a native dialog for the group's name. All three work directly on the
 * library item list, without the item pane open.
 *
 * Each is a submenu of the library's mindmaps rather than a single action, so
 * the target is the user's to pick. Without that they wrote to whichever
 * mindmap happened to have the lowest-numbered storage note, with nothing on
 * screen saying which one that was.
 */
import { getString } from "../../utils/locale";
import { logFailure } from "../../utils/logging";
import {
  listMindmaps,
  updateMindmapDocument,
  type MindmapSummary,
} from "./storage";
import { openAddLinkDialog } from "./addLinkForm";
import {
  canBeMindmapNode,
  createGroup,
  createMemberNode,
  refFor,
} from "./mutations";
import { refsMatch } from "./schema";

type LibraryMenuContext = _ZoteroTypes.MenuManager.LibraryMenuContext;
type LibraryMenuData = _ZoteroTypes.MenuManager.MenuData<LibraryMenuContext>;

const ITEM_MENU_ID = "library-item-actions";

// Rendered via -moz-context-properties/fill: currentColor (set by Zotero's
// own custom-menu styling), so each tracks light and dark on its own.
//
// Built lazily rather than as a module-level constant: `addon` isn't set on
// the global until index.ts's own top-level code runs, which happens after
// this module - one of its importers - has already been evaluated.
function addToMindmapIcon(): string {
  return `chrome://${addon.data.config.addonRef}/content/icons/mindmaps-16.svg`;
}
const ADD_LINK_ICON = "chrome://zotero/skin/16/universal/link.svg";

// Only the entry that opens a dialog earns the ellipsis - see
// registerMindmapAction.
const DIALOG_ELLIPSIS = "…";

function eligibleSelection(win: _ZoteroTypes.MainWindow): Zotero.Item[] {
  return win.ZoteroPane.getSelectedItems().filter(canBeMindmapNode);
}

/**
 * The one library every item in `items` belongs to, or null if they span more
 * than one. Empty input has no library either, so it also returns null.
 *
 * Zotero 10 turned on multi-select in the collection tree, so the items list
 * can show My Library and a group library at once and a selection can span
 * both. A mindmap belongs to one library, so an action over such a selection
 * has no single answer and is refused. `updateMindmapDocument` enforces the
 * same rule at the write itself; this exists so the refusal can be a message
 * rather than a thrown error.
 */
export function singleLibraryOf(items: Zotero.Item[]): number | null {
  if (items.length === 0) {
    return null;
  }
  const first = items[0].libraryID;
  return items.every((item) => item.libraryID === first) ? first : null;
}

function reportCrossLibraryRefusal(): void {
  new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: getString("cross-library-refused"),
      type: "default",
    })
    .show();
}

// Unfiltered, unlike eligibleSelection above: "Group items on mindmap" gates
// on how many items the user picked, not on how many of them turn out to be
// linkable - grouping a mixed selection is still meaningful, it just leaves
// the ineligible ones out and says so.
function rawSelection(win: _ZoteroTypes.MainWindow): Zotero.Item[] {
  return win.ZoteroPane.getSelectedItems();
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
): Promise<{ added: number; mindmapTitle: string; crossLibrary?: true }> {
  const eligible = items.filter(canBeMindmapNode);
  if (eligible.length === 0) {
    return { added: 0, mindmapTitle: "" };
  }

  const libraryID = singleLibraryOf(eligible);
  if (libraryID === null) {
    return { added: 0, mindmapTitle: "", crossLibrary: true };
  }
  let addedCount = 0;
  // Reported back so the confirmation can name where the items landed. The
  // caller may have passed no id at all, in which case only the write knows
  // which mindmap was resolved.
  let mindmapTitle = "";
  await updateMindmapDocument(
    (doc) => {
      addedCount = 0;
      mindmapTitle = doc.title;
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
  return { added: addedCount, mindmapTitle };
}

/**
 * Adds every eligible item in `items` that isn't already a node on
 * `mindmapId` - find, not append, matching how appendLink resolves its own
 * source node - then wraps all of them, the ones just added and the ones
 * already there alike, in one new group named `name`. Ineligible items are
 * left out and counted rather than silently dropped.
 *
 * The add and the group land in the same read-modify-write pass, so there is
 * never a write with the nodes present but ungrouped, and a failure midway
 * leaves the document exactly as it was.
 */
export async function groupOnMindmap(
  items: Zotero.Item[],
  name: string,
  mindmapId?: string,
): Promise<{
  grouped: number;
  skipped: number;
  mindmapTitle: string;
  crossLibrary?: true;
}> {
  const eligible = items.filter(canBeMindmapNode);
  const skipped = items.length - eligible.length;
  if (eligible.length === 0) {
    return { grouped: 0, skipped, mindmapTitle: "" };
  }

  const libraryID = singleLibraryOf(eligible);
  if (libraryID === null) {
    return { grouped: 0, skipped, mindmapTitle: "", crossLibrary: true };
  }
  let mindmapTitle = "";
  await updateMindmapDocument(
    (doc) => {
      mindmapTitle = doc.title;
      const nodeIds = eligible.map((item) => {
        const ref = refFor(item);
        const existing = doc.nodes.find((node) => refsMatch(node.ref, ref));
        if (existing) {
          return existing.id;
        }
        const created = createMemberNode(ref);
        doc.nodes.push(created);
        return created.id;
      });
      createGroup(doc, nodeIds, name || undefined);
      return doc;
    },
    mindmapId,
    libraryID,
  );
  return { grouped: eligible.length, skipped, mindmapTitle };
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
  const eligible = items.filter(canBeMindmapNode);
  // The submenu that supplied `mindmapId` was built from the first selected
  // item's library, so over a selection spanning two it would offer one
  // library's mindmaps for the other library's items. Refuse the whole action
  // rather than open a dialog that cannot be saved.
  if (eligible.length > 0 && singleLibraryOf(eligible) === null) {
    reportCrossLibraryRefusal();
    return;
  }
  for (const item of eligible) {
    await openAddLinkDialog(win, item, mindmapId);
  }
}

/**
 * Rebuilds a submenu from the library's mindmaps, one entry each, and reports
 * whether the parent entry should be hidden.
 *
 * Rebuilt on every open rather than at registration: mindmaps are created and
 * deleted from the tab while the menu sits registered, and a list captured
 * once would go stale with no way to notice. The rows carry no
 * zotero-custom-menu-item class, so Zotero.MenuManager, which clears only its
 * own elements from the submenu's popup, leaves them in place.
 *
 * A library with nothing to choose between gets no submenu at all - see
 * mindmapActionEntries.
 */
async function rebuildMindmapSubmenu(
  menu: Element,
  mindmaps: MindmapSummary[],
  onPick: (mindmapId: string) => void,
  itemSuffix: string,
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
    menuitem.setAttribute("label", `${mindmap.title}${itemSuffix}`);
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
 * Six entries share this - a flat one and a submenu for each of the three
 * actions - and each has its own onShowing, so without it one right click
 * parses every storage note in the library six times over. Keyed on the
 * popupshowing event, which Zotero.MenuManager passes identically to every
 * entry's onShowing for one opening of the menu.
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
    logFailure(
      `[zoteroLinkedMindmaps] could not list mindmaps for the item menu: ${err.message}`,
      err,
    );
    return [] as MindmapSummary[];
  });
  listedPerPopup.set(event, listing);
  return listing;
}

function windowOf(menu: Element): _ZoteroTypes.MainWindow {
  return menu.ownerGlobal as unknown as _ZoteroTypes.MainWindow;
}

/**
 * Which opening of the item menu each entry is currently showing for.
 *
 * onShowing reveals an entry only once the mindmap listing settles, by which
 * time the menu may already have closed. The reveal checks it is still the
 * same opening, so a late answer can't leave an entry visible for the next
 * one - which matters because ZoteroPane skips the plugin's hooks entirely
 * when an annotation is selected, so that opening would show whatever the
 * last one left.
 */
const openingPerEntry = new WeakMap<Element, Event>();

function beginOpening(context: LibraryMenuContext, event: Event): void {
  context.setVisible(false);
  if (context.menuElem) {
    openingPerEntry.set(context.menuElem, event);
  }
}

function endOpening(context: LibraryMenuContext): void {
  context.setVisible(false);
  if (context.menuElem) {
    openingPerEntry.delete(context.menuElem);
  }
}

function stillOpening(menu: Element | undefined, event: Event): boolean {
  return !!menu && openingPerEntry.get(menu) === event;
}

type MindmapAction = {
  /** Unprefixed Fluent ids of the two forms' `.label` messages. */
  l10n: { flat: string; submenu: string };
  icon: string;
  submenuItemSuffix: string;
  act: (win: _ZoteroTypes.MainWindow, mindmapId?: string) => void;
  selection?: (win: _ZoteroTypes.MainWindow) => Zotero.Item[];
  minSelection?: number;
  hideBelowMinimum?: boolean;
};

/**
 * One action as two entries: a plain entry that acts on its own, and a
 * submenu of the library's mindmaps. Exactly one of the two is ever shown.
 *
 * Splitting it is what keeps the common case a single click. With no mindmap
 * yet, or exactly one, there is nothing to choose and the plain entry acts
 * directly - the no-mindmap case still creating the default mindmap on save,
 * as it always has. Only a library holding several shows the submenu. A
 * registered entry cannot change its menuType, so both are registered up
 * front and the choice is made each time the menu opens.
 *
 * Both start hidden and are revealed once the listing settles: Zotero calls
 * onShowing synchronously and does not await it.
 *
 * `selection` and `minSelection` gate whether either shape shows at all,
 * defaulting to the original two entries' rule: at least one eligible item,
 * read through eligibleSelection. Below the minimum, the submenu shape always
 * hides - but the plain shape treats "below minimum" the same as "nothing to
 * choose between", i.e. shown, unless `hideBelowMinimum` says otherwise. "Add
 * to Mindmap" and "Add Link..." rely on that default: they stay visible,
 * inert, over a selection with nothing eligible in it (documented in
 * library-menu-reference.md). "Group items on mindmap" needs the opposite -
 * grouping a single item says nothing a node doesn't already - so it passes
 * `hideBelowMinimum: true` along with its own two-item floor.
 *
 * The selection is read from the window at each use, not taken from the menu
 * context, so a command always acts on what is selected when it is clicked.
 */
function mindmapActionEntries(action: MindmapAction): LibraryMenuData[] {
  const {
    l10n,
    icon,
    submenuItemSuffix,
    act,
    selection = eligibleSelection,
    minSelection = 1,
    hideBelowMinimum = false,
  } = action;
  const prefix = addon.data.config.addonRef;

  async function count(
    win: _ZoteroTypes.MainWindow,
    event: Event,
  ): Promise<number> {
    const selected = selection(win);
    if (selected.length < minSelection) {
      return -1;
    }
    return (await mindmapsForPopup(event, selected[0].libraryID)).length;
  }

  // The ellipsis belongs on the entry that opens a dialog, not on a submenu
  // parent - and the two never appear at the same time, so each gets the
  // label that is right for it.
  return [
    {
      menuType: "menuitem",
      l10nID: `${prefix}-${l10n.flat}`,
      icon,
      onShowing: (event, context) => {
        beginOpening(context, event);
        const menu = context.menuElem;
        void count(windowOf(menu), event).then((mindmapCount) => {
          if (stillOpening(menu, event)) {
            context.setVisible(
              mindmapCount === -1 ? !hideBelowMinimum : mindmapCount <= 1,
            );
          }
        });
      },
      onHidden: (_event, context) => endOpening(context),
      onCommand: (_event, context) => act(windowOf(context.menuElem)),
    },
    {
      menuType: "submenu",
      l10nID: `${prefix}-${l10n.submenu}`,
      icon,
      // Required for a submenu, and left empty: the rows are this plugin's
      // own, rebuilt from the library's mindmaps on each opening.
      menus: [],
      onShowing: (event, context) => {
        beginOpening(context, event);
        const menu = context.menuElem;
        const win = windowOf(menu);
        const selected = selection(win);
        if (selected.length < minSelection) {
          return;
        }
        void mindmapsForPopup(event, selected[0].libraryID).then(
          async (mindmaps) => {
            if (mindmaps.length <= 1 || !stillOpening(menu, event)) {
              return;
            }
            await rebuildMindmapSubmenu(
              menu,
              mindmaps,
              (mindmapId) => act(win, mindmapId),
              submenuItemSuffix,
            );
            context.setVisible(true);
          },
        );
      },
      onHidden: (_event, context) => endOpening(context),
    },
  ];
}

/**
 * Prompts for the new group's name with a native dialog, not ztoolkit.Dialog
 * - the project has recorded traps with the latter and a standing preference
 * for native ones. Returns null on cancel, so the caller can write nothing at
 * all rather than leave items added without a group. An empty field
 * confirmed with OK returns "", which groupOnMindmap reads the same way
 * createGroup already does elsewhere - no name, not a cancelled action.
 */
function promptForGroupName(win: _ZoteroTypes.MainWindow): string | null {
  const name = { value: "" };
  const confirmed = Services.prompt.prompt(
    win as unknown as mozIDOMWindowProxy,
    getString("group-on-mindmap-dialog-title"),
    getString("group-on-mindmap-dialog-message"),
    name,
    "",
    { value: false },
  );
  return confirmed ? name.value.trim() : null;
}

function groupSelectionOnMindmap(
  win: _ZoteroTypes.MainWindow,
  mindmapId?: string,
): void {
  const name = promptForGroupName(win);
  if (name === null) {
    return;
  }
  void groupOnMindmap(rawSelection(win), name, mindmapId).then(
    ({ grouped, skipped, mindmapTitle, crossLibrary }) => {
      if (crossLibrary) {
        reportCrossLibraryRefusal();
        return;
      }
      const popup = new ztoolkit.ProgressWindow(addon.data.config.addonName);
      if (grouped > 0) {
        popup.createLine({
          text: getString("group-on-mindmap-progress", {
            args: { count: grouped, mindmap: mindmapTitle },
          }),
          type: "success",
        });
      }
      if (skipped > 0) {
        popup.createLine({
          text: getString("group-on-mindmap-skipped", {
            args: { count: skipped },
          }),
          type: grouped > 0 ? "default" : "fail",
        });
      }
      popup.show().startCloseTimer(3000);
    },
  );
}

/**
 * Adds the plugin's three actions to the library item menu.
 *
 * Once, from onStartup: Zotero.MenuManager builds the entries into every main
 * window's item menu itself, each time that menu opens, and drops the
 * registration when the plugin shuts down, keyed on pluginID.
 *
 * One registration for all six entries, because Zotero orders separate
 * registrations by menuID and keeps array order only within one. Zotero puts
 * its own separator above plugin entries and refuses one from a plugin here.
 */
export function registerLibraryContextMenu(): string | false {
  return Zotero.MenuManager.registerMenu({
    menuID: ITEM_MENU_ID,
    pluginID: addon.data.config.addonID,
    target: "main/library/item",
    menus: [
      ...mindmapActionEntries({
        l10n: {
          flat: "menu-add-to-mindmap-flat",
          submenu: "menu-add-to-mindmap-submenu",
        },
        icon: addToMindmapIcon(),
        submenuItemSuffix: "",
        act: (win, mindmapId) => {
          void addToMindmap(eligibleSelection(win), mindmapId).then(
            ({ added, mindmapTitle, crossLibrary }) => {
              if (crossLibrary) {
                reportCrossLibraryRefusal();
                return;
              }
              new ztoolkit.ProgressWindow(addon.data.config.addonName)
                .createLine({
                  text: getString("add-to-mindmap-progress", {
                    args: { count: added, mindmap: mindmapTitle },
                  }),
                  type: "success",
                })
                .show()
                .startCloseTimer(3000);
            },
          );
        },
      }),
      ...mindmapActionEntries({
        l10n: {
          flat: "menu-add-link-flat",
          submenu: "menu-add-link-submenu",
        },
        icon: ADD_LINK_ICON,
        submenuItemSuffix: DIALOG_ELLIPSIS,
        act: (win, mindmapId) => {
          void addLinkForSelection(win, eligibleSelection(win), mindmapId);
        },
      }),
      ...mindmapActionEntries({
        l10n: {
          flat: "menu-group-on-mindmap-flat",
          submenu: "menu-group-on-mindmap-submenu",
        },
        icon: addToMindmapIcon(),
        submenuItemSuffix: DIALOG_ELLIPSIS,
        act: (win, mindmapId) => groupSelectionOnMindmap(win, mindmapId),
        selection: rawSelection,
        minSelection: 2,
        hideBelowMinimum: true,
      }),
    ],
  });
}

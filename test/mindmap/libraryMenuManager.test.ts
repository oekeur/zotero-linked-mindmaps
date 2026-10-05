import { assert } from "chai";
import {
  createMindmap,
  readMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { refFor } from "../../src/modules/mindmap/mutations";
import { refsMatch } from "../../src/modules/mindmap/schema";
import { clearStorageNotes } from "./storageNotes";
import { waitFor } from "../waitFor";
import {
  isShown,
  menuL10nID,
  openItemMenu,
  openToolsMenu,
  type OpenMenu,
} from "../itemMenu";

const ACTIONS = ["add-to-mindmap", "add-link", "group-on-mindmap"];
const ENTRIES = ACTIONS.flatMap((action) => [
  `menu-${action}-flat`,
  `menu-${action}-submenu`,
]);

/**
 * The menus the plugin registers through Zotero.MenuManager, built the way a
 * right click and the menubar build them, against a real ZoteroPane selection.
 */
describe("mindmap/libraryContextMenu: the registered menus", function () {
  this.timeout(30000);

  let win: any;
  let items: Zotero.Item[];
  let menu: OpenMenu | undefined;

  async function select(count: number): Promise<void> {
    await win.ZoteroPane.selectItems(items.slice(0, count).map((i) => i.id));
  }

  /** Opens the item menu and waits until the listing has settled. */
  async function openSettled(settledEntry: string): Promise<OpenMenu> {
    menu = await openItemMenu(win);
    const opened = menu;
    await waitFor(
      () => (isShown(opened.entry(settledEntry)) ? true : null),
      `${settledEntry} to be revealed`,
    );
    return opened;
  }

  function shownIds(opened: OpenMenu): string[] {
    return opened
      .pluginEntries()
      .filter(isShown)
      .map((element) => element.getAttribute("data-l10n-id")!);
  }

  before(function () {
    win = Zotero.getMainWindow() as any;
  });

  beforeEach(async function () {
    await clearStorageNotes();
    win.ZoteroPane.itemsView.selection.clearSelection();
    items = [];
    for (const title of ["Menu Article One", "Menu Article Two"]) {
      const item = new Zotero.Item("journalArticle");
      item.libraryID = Zotero.Libraries.userLibraryID;
      item.setField("title", title);
      await item.saveTx({ skipSelect: true });
      items.push(item);
    }
  });

  afterEach(async function () {
    menu?.close();
    menu = undefined;
    for (const item of items) {
      await item.eraseTx();
    }
    await clearStorageNotes();
  });

  it("shows the plain entries and hides the submenus for a library with one mindmap", async function () {
    await createMindmap("Only mindmap");
    await select(2);
    const opened = await openSettled("menu-add-to-mindmap-flat");
    assert.deepEqual(
      shownIds(opened),
      ACTIONS.map((action) => menuL10nID(`menu-${action}-flat`)),
    );
  });

  it("keeps the entries in the order Add to Mindmap, Add Link, Group", async function () {
    await select(2);
    const opened = await openSettled("menu-add-to-mindmap-flat");
    assert.deepEqual(
      opened
        .pluginEntries()
        .map((element) => element.getAttribute("data-l10n-id")),
      ENTRIES.map(menuL10nID),
    );
  });

  it("hides Group for a single selected item", async function () {
    await createMindmap("Only mindmap");
    await select(1);
    const opened = await openSettled("menu-add-to-mindmap-flat");
    assert.deepEqual(shownIds(opened), [
      menuL10nID("menu-add-to-mindmap-flat"),
      menuL10nID("menu-add-link-flat"),
    ]);
  });

  it("shows the submenus, one row per mindmap, for a library with two", async function () {
    await createMindmap("First mindmap");
    await createMindmap("Second mindmap");
    await select(2);
    const opened = await openSettled("menu-add-to-mindmap-submenu");
    assert.deepEqual(
      shownIds(opened),
      ACTIONS.map((action) => menuL10nID(`menu-${action}-submenu`)),
    );
    for (const action of ACTIONS) {
      const rows = opened
        .entry(`menu-${action}-submenu`)!
        .querySelectorAll(":scope > menupopup > menuitem");
      assert.lengthOf(rows, 2, `${action} lists both mindmaps`);
    }
  });

  it("gives every entry a label", async function () {
    await select(2);
    const opened = await openSettled("menu-add-to-mindmap-flat");
    const entries = opened.pluginEntries();
    assert.lengthOf(entries, ENTRIES.length);
    await win.document.l10n.translateElements(entries);
    for (const element of entries) {
      assert.isNotEmpty(
        element.getAttribute("label"),
        `${element.getAttribute("data-l10n-id")} has a label`,
      );
    }
  });

  it("hides every entry again when the menu closes", async function () {
    await select(2);
    const opened = await openSettled("menu-add-to-mindmap-flat");
    opened.close();
    menu = undefined;
    assert.deepEqual(shownIds(opened), []);
  });

  // A submenu's popuphidden bubbles to the item menu, where it consumes any
  // once-only popuphidden listener before the item menu itself closes.
  it("hides every entry again when the menu closes after a submenu was opened", async function () {
    await createMindmap("First mindmap");
    await createMindmap("Second mindmap");
    await select(2);
    const opened = await openSettled("menu-add-link-submenu");
    const subPopup = opened
      .entry("menu-add-link-submenu")!
      .querySelector(":scope > menupopup")!;
    subPopup.dispatchEvent(new win.Event("popupshowing", { bubbles: true }));
    subPopup.dispatchEvent(new win.Event("popuphidden", { bubbles: true }));
    opened.close();
    menu = undefined;
    assert.deepEqual(shownIds(opened), []);
  });

  it("adds the selection from the plain entry's command, on a later opening too", async function () {
    const mindmap = await createMindmap("Only mindmap");
    await select(1);
    (await openSettled("menu-add-to-mindmap-flat")).close();
    const opened = await openSettled("menu-add-to-mindmap-flat");
    opened
      .entry("menu-add-to-mindmap-flat")!
      .dispatchEvent(new win.Event("command"));
    const ref = refFor(items[0]);
    const doc = await waitFor(async () => {
      const current = await readMindmapDocument(mindmap.id);
      return current.nodes.some((node) => refsMatch(node.ref, ref))
        ? current
        : null;
    }, "the selected item to be added");
    assert.lengthOf(
      doc.nodes.filter((node) => refsMatch(node.ref, ref)),
      1,
    );
  });

  it("puts Mindmap into the Tools menu, labelled", async function () {
    const opened = openToolsMenu(win);
    try {
      const entry = opened.entry("menu-tools-mindmap");
      assert.isNotNull(entry, "the Tools menu holds the entry");
      await win.document.l10n.translateElements([entry]);
      assert.isNotEmpty(entry!.getAttribute("label"));
    } finally {
      opened.close();
    }
  });
});

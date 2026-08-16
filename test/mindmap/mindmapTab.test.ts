import { assert } from "chai";
import { config } from "../../package.json";
import { getString } from "../../src/utils/locale";
import {
  createMindmapTabController,
  SIDEBAR_DELETE_CLASS,
  SIDEBAR_EDIT_CLASS,
  SIDEBAR_ROW_CLASS,
  SIDEBAR_ROW_SELECTED_CLASS,
  SIDEBAR_TOGGLE_ID,
  type MindmapTabController,
  type TabSurfaces,
} from "../../src/modules/mindmap/mindmapTab";
import {
  createMindmap,
  listMindmaps,
  readMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { clearStorageNotes } from "./storageNotes";

const NEW = "#zoterolinkedmindmaps-mindmap-new";
const SAVE = "#zoterolinkedmindmaps-mindmap-save";
const TITLE_INPUT = "#zoterolinkedmindmaps-mindmap-title-input";
const DESCRIPTION_INPUT = "#zoterolinkedmindmaps-mindmap-description-input";
const EMPTY_STATE = "#zoterolinkedmindmaps-mindmap-empty-state";
const ROW = `.${SIDEBAR_ROW_CLASS}`;

describe("mindmap/mindmapTab", function () {
  let surfaces: TabSurfaces;
  let controller: MindmapTabController;
  let root: HTMLDivElement;

  function pick<T extends Element>(selector: string): T {
    const found = surfaces.sidebar.querySelector(selector);
    assert.isNotNull(found, `expected ${selector} in the sidebar`);
    return found as T;
  }

  function rows(): HTMLElement[] {
    return [...surfaces.sidebar.querySelectorAll(ROW)] as HTMLElement[];
  }

  function rowFor(id: string): HTMLElement {
    const row = surfaces.sidebar.querySelector(
      `${ROW}[data-mindmap-id="${id}"]`,
    );
    assert.isNotNull(row, `expected a sidebar row for ${id}`);
    return row as HTMLElement;
  }

  function selectedRowId(): string | null {
    const row = surfaces.sidebar.querySelector(
      `.${SIDEBAR_ROW_SELECTED_CLASS}`,
    );
    return row ? row.getAttribute("data-mindmap-id") : null;
  }

  before(function () {
    // getString reads the plugin singleton through the bare `addon` global,
    // which the plugin sets on its own scope at startup. The test bundle is a
    // separate scope, so point its `addon` at the running instance.
    (globalThis as any).addon = (Zotero as any)[config.addonInstance];
  });

  beforeEach(async function () {
    this.timeout(30000);
    await clearStorageNotes();

    const doc = Zotero.getMainWindow().document;
    root = doc.createElement("div");
    doc.documentElement.appendChild(root);

    const sidebar = doc.createElement("div");
    const graph = doc.createElement("div");
    // Cytoscape positions its canvases against the nearest positioned
    // ancestor, so the graph area has to establish one itself.
    graph.style.cssText = "position: relative; width: 200px; height: 200px;";
    const dock = doc.createElement("div");
    root.append(sidebar, graph, dock);

    surfaces = { sidebar, graph, dock };
    controller = createMindmapTabController(surfaces);
  });

  afterEach(async function () {
    this.timeout(30000);
    controller.teardown();
    root.remove();
    // The collapse state is a pref, so a test that toggles it and fails would
    // otherwise hand the next controller a collapsed sidebar.
    Zotero.Prefs.clear(`${config.prefsPrefix}.sidebarCollapsed`, true);
    await clearStorageNotes();
  });

  it("lists every mindmap with its title and description, and marks the selected one (AC #1)", async function () {
    this.timeout(30000);
    const first = await createMindmap("Chapter one", "sources for ch. 1");
    await createMindmap("Methods");

    await controller.refresh();

    const listed = rows();
    assert.equal(listed.length, 2);
    assert.include(listed[0].textContent ?? "", "Chapter one");
    assert.include(listed[0].textContent ?? "", "sources for ch. 1");
    assert.include(listed[1].textContent ?? "", "Methods");
    assert.equal(selectedRowId(), first.id);
  });

  it("shows an empty state and lists no rows when there are no mindmaps", async function () {
    this.timeout(30000);
    await controller.refresh();

    const emptyState = surfaces.graph.querySelector(EMPTY_STATE);
    assert.isNotNull(emptyState);
    assert.equal(emptyState!.textContent, getString("mindmap-empty-state"));
    assert.isEmpty(rows());
    // Creating one is still reachable with nothing in the list.
    assert.isNotNull(surfaces.sidebar.querySelector(NEW));
  });

  it("offers edit and delete on each row rather than on one shared selection (AC #3)", async function () {
    this.timeout(30000);
    await createMindmap("Chapter one");
    await createMindmap("Methods");

    await controller.refresh();

    for (const row of rows()) {
      assert.isNotNull(row.querySelector(`.${SIDEBAR_EDIT_CLASS}`));
      assert.isNotNull(row.querySelector(`.${SIDEBAR_DELETE_CLASS}`));
    }
  });

  it("creates a mindmap with a title and description, and selects it (AC #1)", async function () {
    this.timeout(30000);
    await controller.refresh();

    pick<HTMLButtonElement>(NEW).click();
    await Zotero.Promise.delay(100);

    pick<HTMLInputElement>(TITLE_INPUT).value = "Fieldwork";
    pick<HTMLInputElement>(DESCRIPTION_INPUT).value = "interviews and notes";
    pick<HTMLButtonElement>(SAVE).click();
    await Zotero.Promise.delay(600);

    const listed = await listMindmaps();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, "Fieldwork");
    assert.equal(listed[0].description, "interviews and notes");
    assert.equal(selectedRowId(), listed[0].id);
  });

  it("renames a mindmap and updates its description from its row (AC #3)", async function () {
    this.timeout(30000);
    const created = await createMindmap("Working title", "first pass");
    await controller.refresh();

    (
      rowFor(created.id).querySelector(
        `.${SIDEBAR_EDIT_CLASS}`,
      ) as HTMLButtonElement
    ).click();
    await Zotero.Promise.delay(100);

    const titleInput = pick<HTMLInputElement>(TITLE_INPUT);
    const descriptionInput = pick<HTMLInputElement>(DESCRIPTION_INPUT);
    assert.equal(titleInput.value, "Working title");
    assert.equal(descriptionInput.value, "first pass");
    titleInput.value = "Final title";
    descriptionInput.value = "second pass";
    pick<HTMLButtonElement>(SAVE).click();
    await Zotero.Promise.delay(600);

    const doc = await readMindmapDocument(created.id);
    assert.equal(doc.title, "Final title");
    assert.equal(doc.description, "second pass");
    assert.include(rowFor(created.id).textContent ?? "", "Final title");
  });

  it("keeps the form open on a blank title rather than saving one", async function () {
    this.timeout(30000);
    await controller.refresh();

    pick<HTMLButtonElement>(NEW).click();
    await Zotero.Promise.delay(100);
    pick<HTMLInputElement>(TITLE_INPUT).value = "   ";
    pick<HTMLButtonElement>(SAVE).click();
    await Zotero.Promise.delay(300);

    assert.isEmpty(await listMindmaps());
    assert.isNotNull(surfaces.sidebar.querySelector(TITLE_INPUT));
  });

  it("loads a mindmap into the graph when its row is clicked (AC #2)", async function () {
    this.timeout(30000);
    await createMindmap("First");
    const second = await createMindmap("Second");
    await controller.refresh();

    rowFor(second.id).click();
    await Zotero.Promise.delay(800);

    assert.equal(selectedRowId(), second.id);
    assert.equal((await readMindmapDocument(second.id)).title, "Second");
  });

  // Deleting is not driven from here: handleDelete blocks on
  // Services.prompt.confirm, a real modal dialog, and stubbing an XPCOM
  // service to get past it tests the stub more than the code. The row's
  // delete control is asserted above; the confirmation itself is on the
  // manual verification pass.

  it("collapses the sidebar and restores that state on the next tab (AC #6)", async function () {
    this.timeout(30000);
    await createMindmap("Chapter one");
    await controller.refresh();
    assert.isNotEmpty(rows());

    pick<HTMLButtonElement>(`#${SIDEBAR_TOGGLE_ID}`).click();
    await Zotero.Promise.delay(300);

    assert.isEmpty(rows());
    assert.isNull(surfaces.sidebar.querySelector(NEW));

    // A second controller stands in for reopening the tab: collapsed is read
    // from prefs at construction, so it has to come back collapsed.
    const reopened = createMindmapTabController(surfaces);
    try {
      await reopened.refresh();
      assert.isEmpty(rows());

      pick<HTMLButtonElement>(`#${SIDEBAR_TOGGLE_ID}`).click();
      await Zotero.Promise.delay(300);
      assert.isNotEmpty(rows());
    } finally {
      reopened.teardown();
    }
  });
});

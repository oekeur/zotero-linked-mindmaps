import { assert } from "chai";
import { config } from "../../package.json";
import { getString } from "../../src/utils/locale";
import {
  createMindmapTabController,
  type MindmapTabController,
  type TabSurfaces,
} from "../../src/modules/mindmap/mindmapTab";
import {
  createMindmap,
  findAllMindmapNotes,
  listMindmaps,
  readMindmapDocument,
} from "../../src/modules/mindmap/storage";

const PICKER = "#zoterolinkedmindmaps-mindmap-picker";
const NEW = "#zoterolinkedmindmaps-mindmap-new";
const EDIT = "#zoterolinkedmindmaps-mindmap-edit";
const DELETE = "#zoterolinkedmindmaps-mindmap-delete";
const SAVE = "#zoterolinkedmindmaps-mindmap-save";
const TITLE_INPUT = "#zoterolinkedmindmaps-mindmap-title-input";
const DESCRIPTION_INPUT = "#zoterolinkedmindmaps-mindmap-description-input";
const EMPTY_STATE = "#zoterolinkedmindmaps-mindmap-empty-state";

describe("mindmap/mindmapTab", function () {
  let surfaces: TabSurfaces;
  let controller: MindmapTabController;
  let root: HTMLDivElement;

  function pick<T extends Element>(selector: string): T {
    const found = surfaces.toolbar.querySelector(selector);
    assert.isNotNull(found, `expected ${selector} in the toolbar`);
    return found as T;
  }

  async function clearStorageNotes() {
    for (const item of await findAllMindmapNotes()) {
      await item.eraseTx();
    }
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

    const toolbar = doc.createElement("div");
    const graph = doc.createElement("div");
    // Cytoscape positions its canvases against the nearest positioned
    // ancestor, so the graph area has to establish one itself.
    graph.style.cssText = "position: relative; width: 200px; height: 200px;";
    const dock = doc.createElement("div");
    root.append(toolbar, graph, dock);

    surfaces = { toolbar, graph, dock };
    controller = createMindmapTabController(surfaces);
  });

  afterEach(async function () {
    this.timeout(30000);
    controller.teardown();
    root.remove();
    await clearStorageNotes();
  });

  it("lists every mindmap in the picker and selects one", async function () {
    this.timeout(30000);
    await createMindmap("Chapter one", "sources for ch. 1");
    await createMindmap("Methods");

    await controller.refresh();

    const picker = pick<HTMLSelectElement>(PICKER);
    assert.deepEqual(
      [...picker.options].map((option) => option.textContent),
      ["Chapter one", "Methods"],
    );
    assert.isNotEmpty(picker.value);
    assert.equal(picker.options[0].title, "sources for ch. 1");
  });

  it("shows an empty state with edit and delete unavailable when there are no mindmaps", async function () {
    this.timeout(30000);
    await controller.refresh();

    const emptyState = surfaces.graph.querySelector(EMPTY_STATE);
    assert.isNotNull(emptyState);
    assert.equal(emptyState!.textContent, getString("mindmap-empty-state"));
    assert.isTrue(pick<HTMLButtonElement>(EDIT).disabled);
    assert.isTrue(pick<HTMLButtonElement>(DELETE).disabled);
    assert.isTrue(pick<HTMLSelectElement>(PICKER).disabled);
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
    assert.equal(pick<HTMLSelectElement>(PICKER).value, listed[0].id);
  });

  it("renames a mindmap and updates its description from the toolbar (AC #2)", async function () {
    this.timeout(30000);
    const created = await createMindmap("Working title", "first pass");
    await controller.refresh();

    pick<HTMLButtonElement>(EDIT).click();
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
    assert.equal(
      pick<HTMLSelectElement>(PICKER).options[0].textContent,
      "Final title",
    );
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
    assert.isNotNull(surfaces.toolbar.querySelector(TITLE_INPUT));
  });

  it("loads the picked mindmap when the picker changes", async function () {
    this.timeout(30000);
    await createMindmap("First");
    const second = await createMindmap("Second");
    await controller.refresh();

    const picker = pick<HTMLSelectElement>(PICKER);
    picker.value = second.id;
    picker.dispatchEvent(
      new (Zotero.getMainWindow() as any).Event("change", { bubbles: true }),
    );
    await Zotero.Promise.delay(800);

    assert.equal(pick<HTMLSelectElement>(PICKER).value, second.id);
    assert.equal((await readMindmapDocument(second.id)).title, "Second");
  });
});

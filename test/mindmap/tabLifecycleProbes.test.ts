import { assert } from "chai";
import { config } from "../../package.json";
import {
  createMindmapTabController,
  SIDEBAR_NEW_BUTTON_ID,
  SIDEBAR_ROW_CLASS,
  SIDEBAR_TOGGLE_ID,
  type MindmapTabController,
  type TabSurfaces,
} from "../../src/modules/mindmap/mindmapTab";
import {
  createMindmap,
  findAllMindmapNotes,
  findContainers,
} from "../../src/modules/mindmap/storage";
import { TOOLBAR_CLASS } from "../../src/modules/mindmap/graphRenderer";
import { clearStorageNotes } from "./storageNotes";
import { query } from "../dom";
import { waitFor } from "../waitFor";

const LIVE_STATE = "#zoterolinkedmindmaps-mindmap-live-state";
const EMPTY_STATE = "#zoterolinkedmindmaps-mindmap-empty-state";
const ROW = `.${SIDEBAR_ROW_CLASS}`;

/**
 * The tab's behaviour while the graph observer's trashed panel is up, driven
 * through the sidebar the way a user would. Each spec is the surviving form of
 * a probe from the tab-lifecycle investigation: user input arriving while the
 * observer owns the graph area must neither blank it nor stop it redrawing on
 * restore.
 */
describe("mindmap/mindmapTab lifecycle under a trash", function () {
  let surfaces: TabSurfaces;
  let controller: MindmapTabController;
  let root: HTMLDivElement;

  function makeSurfaces(): TabSurfaces {
    const doc = Zotero.getMainWindow().document;
    const sidebar = doc.createElement("div");
    const graph = doc.createElement("div");
    graph.style.cssText = "position: relative; width: 200px; height: 200px;";
    const dock = doc.createElement("div");
    root.append(sidebar, graph, dock);
    return { sidebar, graph, dock };
  }

  function rows(): HTMLElement[] {
    return [...surfaces.sidebar.querySelectorAll(ROW)] as HTMLElement[];
  }

  function toolbar(): Element | null {
    return surfaces.graph.querySelector(`.${TOOLBAR_CLASS}`);
  }

  function stateKind(): string | null {
    return (
      surfaces.graph
        .querySelector("[data-state]")
        ?.getAttribute("data-state") ?? null
    );
  }

  function click(selector: string): void {
    (surfaces.sidebar.querySelector(selector) as HTMLElement).click();
  }

  async function restore(item: Zotero.Item): Promise<void> {
    item.deleted = false;
    await item.saveTx();
  }

  async function liveGraph(): Promise<Element> {
    return waitFor(toolbar, "a live graph");
  }

  // The observer paints its own panel, and the tab replaces it with a state
  // of its own once the registry empties; either one means the trash was seen.
  async function trashedState(): Promise<Element> {
    return waitFor(
      () =>
        surfaces.graph.querySelector(LIVE_STATE) ??
        surfaces.graph.querySelector("[data-state]"),
      "a trashed state",
    );
  }

  async function reopen(): Promise<void> {
    controller.teardown();
    surfaces = makeSurfaces();
    controller = createMindmapTabController(surfaces);
    await controller.refresh();
  }

  before(function () {
    (globalThis as any).addon = (Zotero as any)[config.addonInstance];
  });

  beforeEach(async function () {
    this.timeout(30000);
    await clearStorageNotes();
    const doc = Zotero.getMainWindow().document;
    root = doc.createElement("div");
    query<HTMLElement>(doc, ":root", "the document root").appendChild(root);
    surfaces = makeSurfaces();
    controller = createMindmapTabController(surfaces);
  });

  afterEach(async function () {
    this.timeout(30000);
    controller.teardown();
    root.remove();
    Zotero.Prefs.clear(`${config.prefsPrefix}.sidebarCollapsed`, true);
    await clearStorageNotes();
  });

  // The tab's own observer rereads the registry on a trash, so no row is left
  // for the user to click while the data is hidden.
  it("lists no stale row while the container is trashed, and lists both again on restore", async function () {
    this.timeout(60000);
    await createMindmap("Alpha");
    await createMindmap("Beta");
    await controller.refresh();
    await liveGraph();
    assert.lengthOf(rows(), 2);
    const [container] = await findContainers();
    await Zotero.Promise.delay(50);
    await Zotero.Items.trashTx([container.id]);
    await trashedState();
    await waitFor(() => rows().length === 0 || null, "the rows to go");
    assert.isNull(surfaces.graph.querySelector(EMPTY_STATE));

    await restore(container);
    await liveGraph();
    await waitFor(() => rows().length === 2 || null, "the rows to return");
  });

  it("lists no stale row while the note is trashed, and lists it again on restore", async function () {
    this.timeout(60000);
    await createMindmap("Only");
    await controller.refresh();
    await liveGraph();
    const [note] = await findAllMindmapNotes();
    await Zotero.Items.trashTx([note.id]);
    await trashedState();
    await waitFor(() => rows().length === 0 || null, "the row to go");
    assert.isNull(surfaces.graph.querySelector(EMPTY_STATE));

    await restore(note);
    await liveGraph();
    await waitFor(() => rows().length === 1 || null, "the row to return");
  });

  it("does not call the library empty when a mindmap is created while the container is trashed", async function () {
    this.timeout(60000);
    await createMindmap("New and save while trashed");
    await controller.refresh();
    await liveGraph();
    const [container] = await findContainers();
    await Zotero.Promise.delay(50);
    await Zotero.Items.trashTx([container.id]);
    await trashedState();

    click(`#${SIDEBAR_NEW_BUTTON_ID}`);
    const titleInput = await waitFor(
      () =>
        surfaces.sidebar.querySelector(
          "#zoterolinkedmindmaps-mindmap-title-input",
        ),
      "the new-mindmap form",
    );
    (titleInput as HTMLInputElement).value = "Made while trashed";
    click("#zoterolinkedmindmaps-mindmap-save");
    await Zotero.Promise.delay(1500);
    assert.isNull(
      surfaces.graph.querySelector(EMPTY_STATE),
      `the library was called empty; graph area: ${surfaces.graph.textContent}`,
    );

    await restore(container);
    await liveGraph();
  });

  it("keeps the trashed panel across a sidebar collapse and expand, and lists the mindmap again after a restore", async function () {
    this.timeout(60000);
    await createMindmap("Toggle then restore");
    await controller.refresh();
    await liveGraph();
    const [container] = await findContainers();
    await Zotero.Promise.delay(50);
    await Zotero.Items.trashTx([container.id]);
    await trashedState();

    click(`#${SIDEBAR_TOGGLE_ID}`);
    await Zotero.Promise.delay(500);
    click(`#${SIDEBAR_TOGGLE_ID}`);
    await Zotero.Promise.delay(500);
    assert.isNull(toolbar(), "no graph over the trash");
    assert.isNotNull(
      surfaces.graph.querySelector(LIVE_STATE) ??
        surfaces.graph.querySelector("[data-state]"),
      "the trashed state survived both toggles",
    );

    await restore(container);
    await liveGraph();
    await waitFor(() => rows().length === 1 || null, "the sidebar row");
  });

  for (const delay of [0, 2, 8, 32, 64]) {
    it(`redraws when the container is restored ${delay}ms after a sidebar toggle refresh`, async function () {
      this.timeout(60000);
      await createMindmap(`Sweep ${delay}`);
      await controller.refresh();
      await liveGraph();
      const [container] = await findContainers();
      await Zotero.Promise.delay(50);
      await Zotero.Items.trashTx([container.id]);
      await trashedState();

      click(`#${SIDEBAR_TOGGLE_ID}`);
      await Zotero.Promise.delay(delay);
      await restore(container);

      await waitFor(toolbar, "the graph after the restore", {
        timeout: 8000,
      });
    });
  }

  it("names the same kind of trash after a reopen, container trashed", async function () {
    this.timeout(60000);
    await createMindmap("Alpha");
    await createMindmap("Beta");
    await controller.refresh();
    await liveGraph();
    const notes = await findAllMindmapNotes();
    await Zotero.Promise.delay(50);
    await Zotero.Items.trashTx([notes[1].id]);
    await Zotero.Promise.delay(300);
    const [container] = await findContainers();
    await Zotero.Items.trashTx([container.id]);
    await trashedState();

    await waitFor(
      () => stateKind() === "container-trashed" || null,
      "the tab's own container state",
    );
    await reopen();
    assert.equal(stateKind(), "container-trashed");
  });

  it("names the same kind of trash after a reopen, note trashed", async function () {
    this.timeout(60000);
    await createMindmap("Note trashed while the tab was open");
    await controller.refresh();
    await liveGraph();
    const [note] = await findAllMindmapNotes();
    await Zotero.Promise.delay(50);
    await Zotero.Items.trashTx([note.id]);
    await trashedState();

    await waitFor(
      () => stateKind() === "note-trashed" || null,
      "the tab's own note state",
    );
    await reopen();
    assert.equal(stateKind(), "note-trashed");
  });
});

import { assert } from "chai";
import { config } from "../../package.json";
import {
  createMindmapTabController,
  type MindmapTabController,
  type TabSurfaces,
} from "../../src/modules/mindmap/mindmapTab";
import {
  createMindmap,
  listMindmaps,
  updateMindmapMetadata,
  updateMindmapDocument,
  whenStorageIdle,
} from "../../src/modules/mindmap/storage";
import { MOUNT_CLASS } from "../../src/modules/mindmap/graphRenderer";
import { clearStorageNotes } from "./storageNotes";
import { waitFor } from "../waitFor";
import { query } from "../dom";

/**
 * A stored document can pass the schema and still be undrawable: a link whose
 * target node is not in the document (a sync merge or a hand edit leaves
 * that behind) makes Cytoscape throw while building. The graph area must end
 * on a message that says so, never blank, and must not keep a dock open for a
 * graph that is gone.
 */
describe("mindmap/graph area when a build throws", function () {
  let surfaces: TabSurfaces;
  let controller: MindmapTabController;
  let root: HTMLDivElement;
  let item: Zotero.Item | undefined;

  const mounts = () =>
    [...surfaces.graph.querySelectorAll(`.${MOUNT_CLASS}`)] as HTMLElement[];
  const cyOf = (mount: HTMLElement) => (mount as any)._cyreg?.cy;

  before(function () {
    (globalThis as any).addon = (Zotero as any)[config.addonInstance];
  });

  beforeEach(async function () {
    this.timeout(30000);
    await clearStorageNotes();
    const doc = Zotero.getMainWindow().document;
    root = doc.createElement("div");
    query<HTMLElement>(doc, ":root", "the document root").appendChild(root);
    const sidebar = doc.createElement("div");
    const graph = doc.createElement("div");
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
    Zotero.Prefs.clear(`${config.prefsPrefix}.sidebarCollapsed`, true);
    await clearStorageNotes();
    await item?.eraseTx();
    item = undefined;
  });

  /** A mindmap with one node on a real item, so a tap has something to dock. */
  async function mindmapWithNode(): Promise<string> {
    item = new Zotero.Item("book");
    item.setField("title", "Build failure book");
    await item.saveTx();
    const made = await createMindmap("Build failure");
    await updateMindmapDocument(
      (doc) => ({
        ...doc,
        nodes: [
          {
            membership: "member",
            id: "n1",
            position: { x: 10, y: 10 },
            ref: { kind: "item", libraryID: item!.libraryID, key: item!.key },
          },
        ],
      }),
      made.id,
    );
    await whenStorageIdle();
    return made.id;
  }

  async function addDanglingLink(id: string): Promise<void> {
    await updateMindmapDocument(
      (doc) => ({
        ...doc,
        links: [
          { id: "l1", typeId: "t", sourceNodeId: "n1", targetNodeId: "ghost" },
        ],
      }),
      id,
    );
    await whenStorageIdle();
  }

  it("names the problem when a live rebuild throws, and closes the dock", async function () {
    this.timeout(60000);
    const id = await mindmapWithNode();
    await controller.refresh();
    await waitFor(() => (mounts()[0] && cyOf(mounts()[0])) || null, "graph");
    cyOf(mounts()[0]).$id("n1").emit("tap");
    await waitFor(
      () => surfaces.dock.querySelector(".mindmap-dock-close"),
      "the dock overview",
    );

    await addDanglingLink(id);

    const panel = await waitFor(
      () =>
        surfaces.graph.querySelector(
          "#zoterolinkedmindmaps-mindmap-live-state",
        ),
      "the unreadable panel",
    );
    assert.isNotEmpty(panel.getAttribute("data-l10n-id"));
    assert.isEmpty(mounts());
    assert.equal(surfaces.dock.style.display, "none");
    assert.equal(surfaces.dock.childElementCount, 0);
  });

  it("names the problem when the tab's own load throws", async function () {
    this.timeout(60000);
    const id = await mindmapWithNode();
    await addDanglingLink(id);

    await controller.refresh();

    const message = await waitFor(
      () => surfaces.graph.querySelector("p"),
      "the failure message",
    );
    assert.include(message.textContent ?? "", "Failed to load mindmap");
    assert.isEmpty(mounts());
  });

  async function addNode(id: string): Promise<void> {
    await updateMindmapDocument(
      (doc) => ({
        ...doc,
        nodes: [
          {
            membership: "member",
            id: "n1",
            position: { x: 10, y: 10 },
            ref: { kind: "item", libraryID: item!.libraryID, key: item!.key },
          },
        ],
      }),
      id,
    );
    await whenStorageIdle();
  }

  it("keeps the selection and the failure on a broken mindmap that is not first", async function () {
    this.timeout(60000);
    item = new Zotero.Item("book");
    item.setField("title", "Build failure book");
    await item.saveTx();
    await createMindmap("Failure A");
    await createMindmap("Failure B");
    const [first, second] = await listMindmaps();
    await addNode(first.id);
    await addNode(second.id);
    await addDanglingLink(second.id);
    await controller.refresh();
    await waitFor(() => (mounts()[0] && cyOf(mounts()[0])) || null, "graph");

    (
      surfaces.sidebar.querySelector(
        `[data-mindmap-id="${second.id}"]`,
      ) as HTMLElement
    ).click();
    const failure = () =>
      surfaces.graph.textContent?.includes("Failed to load mindmap") || null;
    const selectedId = () =>
      surfaces.sidebar
        .querySelector(".mindmap-sidebar-row-selected")
        ?.getAttribute("data-mindmap-id");
    await waitFor(failure, "the failure message");
    // The row highlight comes from the refresh that the click hands to once
    // load() settles, a few milliseconds after the failure paints.
    await waitFor(
      () => selectedId() === second.id || null,
      "the broken mindmap's row to be selected",
    );
    await whenStorageIdle();

    // A later notification re-runs the tab's pass; it must retry the broken
    // mindmap, not fall back to loading the first one.
    await updateMindmapMetadata(first.id, { title: "Failure A edited" });
    await whenStorageIdle();
    await Zotero.Promise.delay(1500);
    assert.isTrue(failure(), "the failure is still on screen");
    assert.isEmpty(mounts());
    assert.equal(selectedId(), second.id);
  });

  it("destroys the half-built instance of every failed live build", async function () {
    this.timeout(60000);
    const id = await mindmapWithNode();
    await controller.refresh();
    await waitFor(() => (mounts()[0] && cyOf(mounts()[0])) || null, "graph");

    const added: HTMLElement[] = [];
    const collect = (records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of record.addedNodes as any) {
          added.push(node as HTMLElement);
        }
      }
    };
    const watcher = new (Zotero.getMainWindow() as any).MutationObserver(
      collect,
    );
    watcher.observe(surfaces.graph, { childList: true });
    try {
      await addDanglingLink(id);
      await waitFor(
        () =>
          surfaces.graph.querySelector(
            "#zoterolinkedmindmaps-mindmap-live-state",
          ),
        "the unreadable panel",
      );
      // Each edit retries the build and fails the same way.
      for (let n = 1; n <= 3; n++) {
        await updateMindmapMetadata(id, { title: `Retry ${n}` });
        await whenStorageIdle();
        await Zotero.Promise.delay(400);
      }
      await Zotero.Promise.delay(500);
      collect(watcher.takeRecords());
    } finally {
      watcher.disconnect();
    }

    const builds = added.filter((node) =>
      node.classList?.contains(MOUNT_CLASS),
    );
    assert.isAtLeast(builds.length, 1, "a failed build was attempted");
    assert.isEmpty(
      builds.filter((mount) => cyOf(mount) && !cyOf(mount).destroyed()),
      "instances left undestroyed by failed builds",
    );
  });
});

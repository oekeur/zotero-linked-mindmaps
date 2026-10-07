import { assert } from "chai";
import { config } from "../../package.json";
import {
  createMindmapTabController,
  openMindmapTab,
  closeMindmapTab,
  SIDEBAR_TOGGLE_ID,
  SIDEBAR_ROW_CLASS,
  type MindmapTabController,
  type TabSurfaces,
} from "../../src/modules/mindmap/mindmapTab";
import {
  classifyEmptyRegistry,
  createMindmap,
  findAllMindmapNotes,
  findContainers,
  readDocumentFromNote,
  STORAGE_TAG,
  updateMindmapMetadata,
} from "../../src/modules/mindmap/storage";
import {
  attachLiveRefresh,
  renderMindmap,
  TOOLBAR_CLASS,
} from "../../src/modules/mindmap/graphRenderer";
import { getLinkTypes } from "../../src/modules/mindmap/linkTypes";
import { clearStorageNotes } from "./storageNotes";
import { query } from "../dom";
import { waitFor } from "../waitFor";

const STATE = "[data-state]";
const LIVE_STATE = "#zoterolinkedmindmaps-mindmap-live-state";
const TAB_OBSERVER = "zoterolinkedmindmaps-mindmap-tab-refresh";
const TOGGLE = `#${SIDEBAR_TOGGLE_ID}`;

/**
 * Every way listMindmaps() can come back empty, how the tab says so, and what
 * redraws it. Waits are for observable effects; nothing here clicks or
 * refreshes to recover, because recovery without user action is the point.
 */
describe("mindmap/mindmapTab empty registry", function () {
  let surfaces: TabSurfaces;
  let controller: MindmapTabController;
  let root: HTMLDivElement;
  const strays: number[] = [];

  function makeSurfaces(): TabSurfaces {
    const doc = Zotero.getMainWindow().document;
    const sidebar = doc.createElement("div");
    const graph = doc.createElement("div");
    graph.style.cssText = "position: relative; width: 200px; height: 200px;";
    const dock = doc.createElement("div");
    root.append(sidebar, graph, dock);
    return { sidebar, graph, dock };
  }

  function stateKind(): string | null {
    return (
      surfaces.graph.querySelector(STATE)?.getAttribute("data-state") ?? null
    );
  }

  function toolbar(): Element | null {
    return surfaces.graph.querySelector(`.${TOOLBAR_CLASS}`);
  }

  async function stateText(kind: string): Promise<string> {
    return waitFor(() => {
      const el = surfaces.graph.querySelector(`[data-state="${kind}"]`);
      const text = el?.textContent ?? "";
      // Plural states are formatted by Fluent after the element is attached.
      return text && !text.includes(config.addonRef) ? text : null;
    }, `${kind} state text`);
  }

  async function noteOf(id: string): Promise<Zotero.Item> {
    const notes = await findAllMindmapNotes();
    const found = notes.find((n) => readDocumentFromNote(n).id === id);
    assert.isOk(found, `storage note for ${id}`);
    return found!;
  }

  async function restore(item: Zotero.Item): Promise<void> {
    item.deleted = false;
    await item.saveTx();
  }

  async function hostedBy(note: Zotero.Item): Promise<Zotero.Item> {
    const host = new Zotero.Item("document");
    host.libraryID = Zotero.Libraries.userLibraryID;
    host.setField("title", "Host item");
    await host.saveTx();
    strays.push(host.id);
    note.parentItemID = host.id;
    await note.saveTx();
    return host;
  }

  async function liveGraph(): Promise<Element> {
    return waitFor(toolbar, "a live graph");
  }

  before(function () {
    const instance = (Zotero as any)[config.addonInstance];
    (globalThis as any).addon = instance;
    (globalThis as any).ztoolkit = instance.data.ztoolkit;
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
    // The collapse state is a pref, so the toggle test would otherwise hand
    // every later controller (and the live tab) a collapsed sidebar.
    Zotero.Prefs.clear(`${config.prefsPrefix}.sidebarCollapsed`, true);
    for (const id of strays.splice(0)) {
      const item = (await Zotero.Items.getAsync(id)) as Zotero.Item | false;
      if (item) {
        await item.eraseTx();
      }
    }
    await clearStorageNotes();
  });

  describe("classification", function () {
    it("tells nothing, trashed container, trashed notes and unreadable notes apart", async function () {
      this.timeout(60000);
      assert.deepEqual(await classifyEmptyRegistry(), { kind: "nothing" });

      const alpha = await createMindmap("Alpha");
      const beta = await createMindmap("Beta");
      const alphaNote = await noteOf(alpha.id);
      const betaNote = await noteOf(beta.id);

      await Zotero.Items.trashTx([alphaNote.id, betaNote.id]);
      assert.deepEqual(await classifyEmptyRegistry(), {
        kind: "note-trashed",
        count: 2,
      });

      // A container hides everything, so it outranks a note trashed on its
      // own; a library-wide read has no subject note to prefer.
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);
      assert.deepEqual(await classifyEmptyRegistry(), {
        kind: "container-trashed",
        hasNotes: true,
      });

      await restore(container);
      await restore(alphaNote);
      await restore(betaNote);
      assert.deepEqual(await classifyEmptyRegistry(), { kind: "readable" });

      alphaNote.setNote("not a mindmap");
      await alphaNote.saveTx();
      assert.deepEqual(await classifyEmptyRegistry(), { kind: "readable" });
      betaNote.setNote("not a mindmap either");
      await betaNote.saveTx();
      assert.deepEqual(await classifyEmptyRegistry(), {
        kind: "unreadable",
        count: 2,
      });
    });

    it("counts a note hidden by a trashed plain parent as a trashed note", async function () {
      this.timeout(30000);
      const made = await createMindmap("Reparented");
      const host = await hostedBy(await noteOf(made.id));
      await Zotero.Items.trashTx([host.id]);
      assert.deepEqual(await classifyEmptyRegistry(), {
        kind: "note-trashed",
        count: 1,
      });
      await restore(host);
    });

    it("reports a trashed container with no notes left as holding none", async function () {
      this.timeout(30000);
      const made = await createMindmap("Erased down to the container");
      await (await noteOf(made.id)).eraseTx();
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);
      assert.deepEqual(await classifyEmptyRegistry(), {
        kind: "container-trashed",
        hasNotes: false,
      });
    });
  });

  describe("what the tab says", function () {
    it("says nothing is there for a library with no mindmaps", async function () {
      this.timeout(30000);
      await controller.refresh();
      assert.equal(stateKind(), "nothing");
    });

    it("names a trashed container, with and without notes behind it", async function () {
      this.timeout(30000);
      const made = await createMindmap("Hidden");
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);
      await controller.refresh();
      assert.equal(stateKind(), "container-trashed");
      const withNotes = await stateText("container-trashed");

      controller.teardown();
      await restore(container);
      await (await noteOf(made.id)).eraseTx();
      await Zotero.Items.trashTx([container.id]);
      surfaces = makeSurfaces();
      controller = createMindmapTabController(surfaces);
      await controller.refresh();
      assert.notEqual(
        await stateText("container-trashed"),
        withNotes,
        "an empty container must not promise mindmaps",
      );
    });

    it("names trashed data notes, singular and plural", async function () {
      this.timeout(30000);
      const one = await createMindmap("One");
      await Zotero.Items.trashTx([(await noteOf(one.id)).id]);
      await controller.refresh();
      assert.equal(stateKind(), "note-trashed");
      const singular = await stateText("note-trashed");

      controller.teardown();
      surfaces = makeSurfaces();
      controller = createMindmapTabController(surfaces);
      const two = await createMindmap("Two");
      await Zotero.Items.trashTx([(await noteOf(two.id)).id]);
      await controller.refresh();
      const plural = await stateText("note-trashed");
      assert.notEqual(plural, singular);
    });

    it("never says the library is empty when the data is only trashed or unreadable", async function () {
      this.timeout(30000);
      const made = await createMindmap("Broken");
      const note = await noteOf(made.id);
      note.setNote("garbage");
      await note.saveTx();
      await controller.refresh();
      assert.equal(stateKind(), "unreadable");
      await stateText("unreadable");
      assert.isNull(
        surfaces.graph.querySelector(
          "#zoterolinkedmindmaps-mindmap-empty-state",
        ),
      );
    });
  });

  describe("redraw without user action", function () {
    it("redraws when a trashed note is restored", async function () {
      this.timeout(30000);
      const made = await createMindmap("Back again");
      const note = await noteOf(made.id);
      await Zotero.Items.trashTx([note.id]);
      await controller.refresh();
      assert.equal(stateKind(), "note-trashed");
      await restore(note);
      await liveGraph();
      assert.isNull(stateKind());
    });

    it("redraws when a trashed container is restored", async function () {
      this.timeout(30000);
      await createMindmap("Under a container");
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);
      await controller.refresh();
      assert.equal(stateKind(), "container-trashed");
      await restore(container);
      await liveGraph();
    });

    it("redraws when an unreadable note is repaired", async function () {
      this.timeout(30000);
      const made = await createMindmap("Repair me");
      const note = await noteOf(made.id);
      const good = note.getNote();
      note.setNote("garbage");
      await note.saveTx();
      await controller.refresh();
      assert.equal(stateKind(), "unreadable");
      note.setNote(good);
      await note.saveTx();
      await liveGraph();
    });

    it("moves from a trashed to the nothing state when the data is erased", async function () {
      this.timeout(30000);
      const made = await createMindmap("Gone for good");
      const note = await noteOf(made.id);
      await Zotero.Items.trashTx([note.id]);
      await controller.refresh();
      assert.equal(stateKind(), "note-trashed");
      await note.eraseTx();
      await waitFor(
        () => stateKind() === "nothing" || null,
        "the nothing state",
      );
    });

    it("follows a container restored after every note was erased", async function () {
      this.timeout(30000);
      const made = await createMindmap("Erased");
      await (await noteOf(made.id)).eraseTx();
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);
      await controller.refresh();
      assert.equal(stateKind(), "container-trashed");
      await restore(container);
      await waitFor(
        () => stateKind() === "nothing" || null,
        "the nothing state",
      );
    });

    it("redraws a state the live-refresh observer left behind: A erased, B hidden, B restored", async function () {
      this.timeout(60000);
      const a = await createMindmap("Alpha");
      const b = await createMindmap("Beta");
      await controller.refresh();
      await liveGraph();
      const noteA = await noteOf(a.id);
      const noteB = await noteOf(b.id);

      await Zotero.Items.trashTx([noteB.id]);
      await Zotero.Items.trashTx([noteA.id]);
      await noteA.eraseTx();
      await waitFor(
        () => stateKind() === "note-trashed" || null,
        "the tab's own hidden-data state instead of a deleted panel",
      );
      await restore(noteB);
      await liveGraph();
    });

    it("does not leave 'in the trash' on a note that came back unreadable", async function () {
      this.timeout(60000);
      const made = await createMindmap("Alpha");
      await controller.refresh();
      await liveGraph();
      const note = await noteOf(made.id);
      const good = note.getNote();

      note.setNote("garbage");
      await note.saveTx();
      await Zotero.Promise.delay(300);
      await Zotero.Items.trashTx([note.id]);
      await Zotero.Promise.delay(300);
      await restore(note);
      await waitFor(
        () => stateKind() === "unreadable" || null,
        "the unreadable state",
      );

      note.setNote(good);
      await note.saveTx();
      await liveGraph();
    });
  });

  describe("a live graph the registry cannot see", function () {
    async function breakNote(id: string): Promise<Zotero.Item> {
      const note = await noteOf(id);
      note.setNote("garbage");
      await note.saveTx();
      await Zotero.Promise.delay(300);
      return note;
    }

    it("survives a sidebar toggle and keeps redrawing afterwards", async function () {
      this.timeout(60000);
      const made = await createMindmap("Alpha");
      await controller.refresh();
      const before = await liveGraph();
      const note = await noteOf(made.id);
      const good = note.getNote();
      await breakNote(made.id);

      (surfaces.sidebar.querySelector(TOGGLE) as HTMLElement).click();
      await Zotero.Promise.delay(500);
      assert.isNull(stateKind(), "no state painted over the graph");
      assert.strictEqual(toolbar(), before, "the graph was not rebuilt");

      note.setNote(good);
      await note.saveTx();
      await updateMindmapMetadata(made.id, { title: "Alpha renamed" });
      await waitFor(
        () => (toolbar() && toolbar() !== before ? true : null),
        "the surviving observer to redraw after the repair",
      );
    });

    it("survives a click on its now-stale sidebar row", async function () {
      this.timeout(60000);
      const made = await createMindmap("Alpha");
      await controller.refresh();
      const before = await liveGraph();
      await breakNote(made.id);

      (
        surfaces.sidebar.querySelector(`.${SIDEBAR_ROW_CLASS}`) as HTMLElement
      ).click();
      await Zotero.Promise.delay(500);
      assert.strictEqual(toolbar(), before);
      assert.notInclude(surfaces.graph.textContent ?? "", "Failed to load");
    });

    it("lets the graph observer answer a trash it can see", async function () {
      this.timeout(60000);
      const made = await createMindmap("Alpha");
      await controller.refresh();
      await liveGraph();
      const note = await noteOf(made.id);
      await Zotero.Items.trashTx([note.id]);
      await waitFor(
        () =>
          surfaces.graph.querySelector(LIVE_STATE) ||
          surfaces.graph.querySelector(STATE),
        "a trashed panel",
      );
      await restore(note);
      await liveGraph();
    });

    it("checks for a trash that landed before the observer attached", async function () {
      this.timeout(30000);
      const made = await createMindmap("Alpha");
      const note = await noteOf(made.id);
      const graph = surfaces.graph;
      const handle = await renderMindmap(
        graph,
        readDocumentFromNote(note),
        getLinkTypes(),
        surfaces.dock,
      );
      await Zotero.Items.trashTx([note.id]);
      const teardown = attachLiveRefresh(
        handle,
        graph,
        note.id,
        getLinkTypes(),
        surfaces.dock,
      );
      try {
        await waitFor(
          () => graph.querySelector(LIVE_STATE),
          "the trashed panel for a note trashed before attach",
        );
        assert.equal(teardown.view(), "note-trashed");
      } finally {
        teardown();
      }
    });
  });

  describe("notifications that must not be lost", function () {
    it("says the note is unreadable, not trashed, when it comes back broken while another mindmap exists", async function () {
      this.timeout(60000);
      const a = await createMindmap("Alpha");
      await createMindmap("Beta");
      await controller.refresh();
      await liveGraph();
      const note = await noteOf(a.id);
      await Zotero.Items.trashTx([note.id]);
      await waitFor(
        () => surfaces.graph.querySelector(LIVE_STATE),
        "the trashed panel",
      );
      note.setNote("garbage");
      note.deleted = false;
      await note.saveTx();
      await waitFor(
        () =>
          surfaces.graph
            .querySelector(LIVE_STATE)
            ?.getAttribute("data-l10n-id")
            ?.includes("unreadable-state") || null,
        "the panel to stop claiming the note is trashed",
      );
    });

    // The unreadable panel is decided after a re-read of the trash state; an
    // erase landing in that read must stay terminal. Painted "unreadable"
    // over the deleted panel in 5 of 5 runs before the re-check.
    it("keeps the deleted panel when an erase lands during the unreadable re-read", async function () {
      this.timeout(120000);
      const items = Zotero.Items as any;
      const realGetAsync = items.getAsync;
      try {
        for (let k = 0; k < 3; k++) {
          controller.teardown();
          await clearStorageNotes();
          surfaces = makeSurfaces();
          controller = createMindmapTabController(surfaces);
          const a = await createMindmap("Alpha " + k);
          await createMindmap("Beta " + k);
          await controller.refresh();
          await liveGraph();
          const note = await noteOf(a.id);
          const aID = note.id;
          await Zotero.Items.trashTx([aID]);
          await waitFor(
            () => surfaces.graph.querySelector(LIVE_STATE),
            "the trashed panel",
          );
          let fired = false;
          items.getAsync = function (this: unknown, ...args: any[]) {
            const stack = new Error().stack ?? "";
            if (
              !fired &&
              args[0] === aID &&
              /readTrashState/.test(stack) &&
              /applyView/.test(stack)
            ) {
              fired = true;
              return (async () => {
                const n = (await realGetAsync.call(items, aID)) as Zotero.Item;
                await n.eraseTx();
                await Zotero.Promise.delay(500);
                return realGetAsync.apply(items, args);
              })();
            }
            return realGetAsync.apply(this, args);
          };
          note.setNote("garbage " + k);
          note.deleted = false;
          await note.saveTx();
          await Zotero.Promise.delay(2000);
          items.getAsync = realGetAsync;
          assert.isTrue(fired, "the erase was staged inside the re-read");
          const panel = surfaces.graph.querySelector(LIVE_STATE);
          assert.notInclude(
            panel?.getAttribute("data-l10n-id") ?? "",
            "unreadable",
            "an erased note is not unreadable",
          );
        }
      } finally {
        items.getAsync = realGetAsync;
      }
    });

    // A burst of item events keeps passes running while a slow library makes
    // each one long; the restore lands at an arbitrary point in them. Failed
    // 1 of 12 against a cap of four passes that consumed the pending request,
    // and showed the false empty state when a restore fell between the two
    // reads of classifyEmptyRegistry.
    it("redraws after a restore that lands during a burst of item events", async function () {
      this.timeout(300000);
      const stray = new Zotero.Item("document");
      stray.libraryID = Zotero.Libraries.userLibraryID;
      stray.setField("title", "burst");
      await stray.saveTx();
      strays.push(stray.id);
      const results: string[] = [];
      for (let k = 0; k < 12; k++) {
        controller.teardown();
        await clearStorageNotes();
        surfaces = makeSurfaces();
        controller = createMindmapTabController(surfaces);
        const made = await createMindmap("Burst " + k);
        const note = await noteOf(made.id);
        await Zotero.Items.trashTx([note.id]);
        await controller.refresh();
        assert.equal(stateKind(), "note-trashed");
        const proto = (Zotero.Search as any).prototype;
        const realSearch = proto.search;
        proto.search = async function (...args: any[]) {
          await Zotero.Promise.delay(25);
          return realSearch.apply(this, args);
        };
        try {
          const end = Date.now() + 150 + k * 120;
          let i = 0;
          while (Date.now() < end) {
            stray.setField("title", `burst ${k}.${i++}`);
            await stray.saveTx();
            await Zotero.Promise.delay(15);
          }
          note.deleted = false;
          await note.saveTx();
          await Zotero.Promise.delay(3000);
        } finally {
          proto.search = realSearch;
        }
        let drawn = true;
        try {
          await waitFor(toolbar, "graph", { timeout: 4000 });
        } catch {
          drawn = false;
        }
        results.push(
          `k=${k}:${drawn ? "graph" : "STUCK(" + stateKind() + ")"}`,
        );
      }
      assert.notInclude(results.join(" "), "STUCK", results.join(" "));
    });
  });

  describe("the tab's own observer", function () {
    let registered: string[];
    let unregistered: string[];
    let realRegister: typeof Zotero.Notifier.registerObserver;
    let realUnregister: typeof Zotero.Notifier.unregisterObserver;
    const names = new Map<string, string>();

    function open(): number {
      return [...names.entries()].filter(
        ([id, name]) => name === TAB_OBSERVER && !unregistered.includes(id),
      ).length;
    }

    beforeEach(function () {
      registered = [];
      unregistered = [];
      names.clear();
      realRegister = Zotero.Notifier.registerObserver;
      realUnregister = Zotero.Notifier.unregisterObserver;
      Zotero.Notifier.registerObserver = ((...args: any[]) => {
        const id = (realRegister as any).apply(Zotero.Notifier, args);
        registered.push(id);
        names.set(id, args[2]);
        return id;
      }) as any;
      Zotero.Notifier.unregisterObserver = ((id: string) => {
        unregistered.push(id);
        return (realUnregister as any).call(Zotero.Notifier, id);
      }) as any;
    });

    afterEach(function () {
      Zotero.Notifier.registerObserver = realRegister;
      Zotero.Notifier.unregisterObserver = realUnregister;
      for (const id of registered) {
        if (!unregistered.includes(id)) {
          realUnregister.call(Zotero.Notifier, id);
        }
      }
    });

    it("registers once per controller and unregisters on teardown", async function () {
      this.timeout(30000);
      await controller.refresh();
      await controller.refresh();
      assert.equal(open(), 1);
      controller.teardown();
      assert.equal(open(), 0);
    });

    it("registers nothing for a refresh that arrives after teardown", async function () {
      this.timeout(30000);
      controller.teardown();
      await controller.refresh();
      assert.lengthOf(registered, 0);
    });

    it("leaves nothing registered when teardown lands mid-refresh", async function () {
      this.timeout(30000);
      await createMindmap("Alpha");
      const pending = controller.refresh();
      controller.teardown();
      await pending;
      await Zotero.Promise.delay(300);
      assert.equal(open(), 0);
      for (const id of registered) {
        assert.include(unregistered, id, `observer ${names.get(id)} leaked`);
      }
    });

    it("stops repainting after teardown", async function () {
      this.timeout(30000);
      const made = await createMindmap("Alpha");
      const note = await noteOf(made.id);
      await Zotero.Items.trashTx([note.id]);
      await controller.refresh();
      assert.equal(stateKind(), "note-trashed");
      controller.teardown();
      surfaces.graph.textContent = "";
      await restore(note);
      await Zotero.Promise.delay(1500);
      assert.equal(surfaces.graph.childElementCount, 0);
    });
  });

  describe("through the real tab", function () {
    const GRAPH = "#zoterolinkedmindmaps-mindmap-container";

    function mainDocument(): Document {
      return Zotero.getMainWindow().document;
    }

    async function openTab(): Promise<Element> {
      await openMindmapTab();
      return waitFor(
        () => mainDocument().querySelector(GRAPH),
        "the graph area",
      );
    }

    async function closeTab(): Promise<void> {
      closeMindmapTab();
      await waitFor(
        () => mainDocument().querySelector(GRAPH) === null || null,
        "the tab to close",
      );
    }

    async function storageNoteCount(): Promise<number> {
      const search = new Zotero.Search();
      search.addCondition("libraryID", "is", Zotero.Libraries.userLibraryID);
      search.addCondition("itemType", "is", "note");
      search.addCondition("tag", "is", STORAGE_TAG);
      search.addCondition("includeDeleted", "true");
      return (await search.search()).length;
    }

    afterEach(async function () {
      this.timeout(30000);
      await closeTab();
    });

    it("explains a trashed container on first open and again on reopen", async function () {
      this.timeout(60000);
      await createMindmap("Hidden");
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);

      let graph = await openTab();
      await waitFor(
        () => graph.querySelector('[data-state="container-trashed"]'),
        "the container state on first open",
      );
      await closeTab();

      graph = await openTab();
      await waitFor(
        () => graph.querySelector('[data-state="container-trashed"]'),
        "the container state on reopen",
      );

      await restore(container);
      await waitFor(
        () => graph.querySelector(`.${TOOLBAR_CLASS}`),
        "the mindmap to come back without user action",
      );
    });

    it("explains a trashed container with no notes left on open", async function () {
      this.timeout(30000);
      const made = await createMindmap("Erased");
      await (await noteOf(made.id)).eraseTx();
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);
      const graph = await openTab();
      await waitFor(
        () => graph.querySelector('[data-state="container-trashed"]'),
        "the container state",
      );
    });

    it("explains unreadable data on open and writes no new mindmap", async function () {
      this.timeout(30000);
      const made = await createMindmap("Broken");
      const note = await noteOf(made.id);
      note.setNote("garbage");
      await note.saveTx();
      const graph = await openTab();
      await waitFor(
        () => graph.querySelector('[data-state="unreadable"]'),
        "the unreadable state",
      );
      assert.equal(await storageNoteCount(), 1);
    });

    it("refuses to write a second mindmap while the user's own is unreachable", async function () {
      this.timeout(30000);
      const made = await createMindmap("Gamma");
      const host = await hostedBy(await noteOf(made.id));
      await Zotero.Items.trashTx([host.id]);
      assert.equal(await storageNoteCount(), 1);

      const graph = await openTab();
      await waitFor(
        () => graph.querySelector('[data-state="note-trashed"]'),
        "the hidden-data state",
      );
      assert.equal(
        await storageNoteCount(),
        1,
        "a duplicate mindmap was written",
      );
      assert.lengthOf(await findAllMindmapNotes(), 0);
      await restore(host);
    });
  });
});

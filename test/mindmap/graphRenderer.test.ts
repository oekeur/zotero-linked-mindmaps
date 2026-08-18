import { assert } from "chai";
import cytoscape from "cytoscape";
import { config } from "../../package.json";
import {
  attachLiveRefresh,
  attachNodeClickHandler,
  attachNodeContextMenuHandler,
  attachNodeDragHandler,
  buildParentChildTies,
  computeParallelOffsets,
  EXTERNAL_NODE_CLASS,
  FIT_BUTTON_CLASS,
  GROUP_MENU_CLASS,
  GROUP_NODE_CLASS,
  LEGEND_CLASS,
  LEGEND_TOGGLE_BUTTON_CLASS,
  MENU_ACTION_CLASS,
  NODE_MENU_ADD_LINK_CLASS,
  PARENT_CHILD_TIE_CLASS,
  renderMindmap,
  type RenderedState,
  resolveLinkVisual,
  TOOLBAR_CLASS,
  ZOOM_IN_BUTTON_CLASS,
  ZOOM_OUT_BUTTON_CLASS,
} from "../../src/modules/mindmap/graphRenderer";
import { UNKNOWN_TYPE_LABEL } from "../../src/modules/mindmap/linkTypes";
import {
  EMPTY_NOTE_LABEL,
  MISSING_ITEM_LABEL,
  resolveNodeLabel,
} from "../../src/modules/mindmap/nodeLabels";
import {
  CLOSE_CLASS,
  OVERVIEW_CLASS,
  SHOW_IN_LIBRARY_CLASS,
} from "../../src/modules/mindmap/nodeOverview";
import { layoutUnplacedNodes } from "../../src/modules/mindmap/layout";
import {
  findMindmapNote,
  readMindmapDocument,
  updateMindmapDocument,
  whenStorageIdle,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";
import type { LinkType } from "../../src/modules/mindmap/linkTypes";
import {
  CURRENT_SCHEMA_VERSION,
  isCoincident,
} from "../../src/modules/mindmap/schema";
import type {
  MindmapDocument,
  MindmapLink,
  MindmapNode,
  ZoteroObjectRef,
} from "../../src/modules/mindmap/schema";
import { clearStorageNotes } from "./storageNotes";

const LEGEND_COLLAPSED_PREF_KEY = `${config.prefsPrefix}.legendCollapsed`;

describe("mindmap/graphRenderer", function () {
  // Which tab Zotero is showing. The test bundle has no `ztoolkit` of its
  // own, so Zotero_Tabs is read off the main window directly.
  function selectedTabIndex(): number {
    return (Zotero.getMainWindow() as any).Zotero_Tabs.selectedIndex;
  }

  describe("resolveNodeLabel", function () {
    let article: Zotero.Item;

    beforeEach(async function () {
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Graph Renderer Test Article");
      await article.saveTx();
    });

    afterEach(async function () {
      await article.eraseTx();
    });

    it("resolves an item ref to its display title", function () {
      const label = resolveNodeLabel({
        kind: "item",
        libraryID: article.libraryID,
        key: article.key,
      });
      assert.equal(label, "Graph Renderer Test Article");
    });

    it("falls back to a missing-item label for an unresolvable ref", function () {
      const label = resolveNodeLabel({
        kind: "item",
        libraryID: Zotero.Libraries.userLibraryID,
        key: "NOSUCHKEY",
      });
      assert.equal(label, MISSING_ITEM_LABEL);
    });

    describe("note labels", function () {
      let note: Zotero.Item;

      async function noteLabelFor(html: string): Promise<string> {
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote(html);
        await note.saveTx();
        return resolveNodeLabel({
          kind: "note",
          libraryID: note.libraryID,
          key: note.key,
        });
      }

      afterEach(async function () {
        await note?.eraseTx();
      });

      it("previews a note's content instead of its title", async function () {
        const label = await noteLabelFor(
          "<p>Ostrom on common-pool resources</p>",
        );
        assert.equal(label, "Ostrom on common-pool resources");
      });

      it("truncates a long note with an ellipsis (AC #1)", async function () {
        const label = await noteLabelFor(
          `<p>${"the quick brown fox jumps over the lazy dog ".repeat(4)}</p>`,
        );
        assert.isTrue(label.endsWith("…"));
        assert.isAtMost(label.length, 61);
      });

      it("leaves a short note without a trailing ellipsis (AC #1)", async function () {
        const label = await noteLabelFor("<p>Short enough</p>");
        assert.equal(label, "Short enough");
      });

      it("does not glue the last word of a paragraph to the next one's first", async function () {
        const label = await noteLabelFor("<p>first</p><p>second</p>");
        assert.equal(label, "first second");
      });

      it("decodes the entities Zotero's note editor emits", async function () {
        const label = await noteLabelFor("<p>Salt&nbsp;&amp;&nbsp;pepper</p>");
        assert.equal(label, "Salt & pepper");
      });

      it("falls back to a placeholder for a note with no text (AC #2)", async function () {
        const label = await noteLabelFor("<p></p>");
        assert.equal(label, EMPTY_NOTE_LABEL);
      });

      it("falls back to a placeholder for a note that is only markup (AC #2)", async function () {
        const label = await noteLabelFor("<ul><li></li></ul>");
        assert.equal(label, EMPTY_NOTE_LABEL);
      });
    });
  });

  describe("resolveLinkVisual", function () {
    const linkTypes: LinkType[] = [
      { id: "cites", label: "cites", directional: true },
      { id: "related-to", label: "related to", directional: false },
    ];
    let typeMap: Map<string, LinkType>;

    before(function () {
      typeMap = new Map(linkTypes.map((type) => [type.id, type]));
    });

    function link(overrides: Partial<MindmapLink>): MindmapLink {
      return {
        id: "link-1",
        typeId: "cites",
        sourceNodeId: "a",
        targetNodeId: "b",
        ...overrides,
      };
    }

    it("labels a directional type and classes it 'directional'", function () {
      const visual = resolveLinkVisual(link({ typeId: "cites" }), typeMap);
      assert.equal(visual.label, "cites");
      assert.equal(visual.classes, "directional");
    });

    it("labels an undirectional type and classes it 'undirectional'", function () {
      const visual = resolveLinkVisual(link({ typeId: "related-to" }), typeMap);
      assert.equal(visual.label, "related to");
      assert.equal(visual.classes, "undirectional");
    });

    it("appends the link's freeform name to the type label", function () {
      const visual = resolveLinkVisual(
        link({ typeId: "cites", name: "see p.12" }),
        typeMap,
      );
      assert.equal(visual.label, "cites: see p.12");
    });

    it("falls back to an unknown-type label and class for a soft-orphaned typeId", function () {
      const visual = resolveLinkVisual(
        link({ typeId: "deleted-type" }),
        typeMap,
      );
      assert.equal(visual.label, UNKNOWN_TYPE_LABEL);
      assert.equal(visual.classes, "unknown-type");
    });

    it("appends the link name to the unknown-type fallback too", function () {
      const visual = resolveLinkVisual(
        link({ typeId: "deleted-type", name: "see p.12" }),
        typeMap,
      );
      assert.equal(visual.label, `${UNKNOWN_TYPE_LABEL}: see p.12`);
    });
  });

  describe("computeParallelOffsets", function () {
    function link(overrides: Partial<MindmapLink>): MindmapLink {
      return {
        id: "link-1",
        typeId: "cites",
        sourceNodeId: "a",
        targetNodeId: "b",
        ...overrides,
      };
    }

    it("gives a single link between a pair an offset of 0", function () {
      const offsets = computeParallelOffsets([
        link({ id: "link-1", sourceNodeId: "a", targetNodeId: "b" }),
      ]);
      assert.equal(offsets.get("link-1"), 0);
    });

    it("splits two parallel links symmetrically around 0", function () {
      const offsets = computeParallelOffsets([
        link({ id: "link-1", sourceNodeId: "a", targetNodeId: "b" }),
        link({ id: "link-2", sourceNodeId: "a", targetNodeId: "b" }),
      ]);
      assert.equal(offsets.get("link-1"), -20);
      assert.equal(offsets.get("link-2"), 20);
    });

    it("spreads three parallel links symmetrically around 0", function () {
      const offsets = computeParallelOffsets([
        link({ id: "link-1", sourceNodeId: "a", targetNodeId: "b" }),
        link({ id: "link-2", sourceNodeId: "a", targetNodeId: "b" }),
        link({ id: "link-3", sourceNodeId: "a", targetNodeId: "b" }),
      ]);
      assert.equal(offsets.get("link-1"), -40);
      assert.equal(offsets.get("link-2"), 0);
      assert.equal(offsets.get("link-3"), 40);
    });

    it("groups a reverse-direction link into the same pair", function () {
      const offsets = computeParallelOffsets([
        link({ id: "link-1", sourceNodeId: "a", targetNodeId: "b" }),
        link({ id: "link-2", sourceNodeId: "b", targetNodeId: "a" }),
      ]);
      assert.equal(offsets.get("link-1"), -20);
      assert.equal(offsets.get("link-2"), 20);
    });

    it("orders offsets by link id, not array order", function () {
      const offsets = computeParallelOffsets([
        link({ id: "link-z", sourceNodeId: "a", targetNodeId: "b" }),
        link({ id: "link-a", sourceNodeId: "a", targetNodeId: "b" }),
      ]);
      assert.equal(offsets.get("link-a"), -20);
      assert.equal(offsets.get("link-z"), 20);
    });

    it("does not offset links between different node pairs", function () {
      const offsets = computeParallelOffsets([
        link({ id: "link-1", sourceNodeId: "a", targetNodeId: "b" }),
        link({ id: "link-2", sourceNodeId: "c", targetNodeId: "d" }),
      ]);
      assert.equal(offsets.get("link-1"), 0);
      assert.equal(offsets.get("link-2"), 0);
    });

    it("gives a self-link an offset of 0 without throwing", function () {
      const offsets = computeParallelOffsets([
        link({ id: "link-1", sourceNodeId: "a", targetNodeId: "a" }),
      ]);
      assert.equal(offsets.get("link-1"), 0);
    });
  });

  describe("attachNodeClickHandler", function () {
    let article: Zotero.Item;
    let dockContainer: HTMLDivElement;
    let tapHandler: (evt: {
      target: { id(): string; data(key: string): unknown };
    }) => void | Promise<void>;

    function nodeEvent(id: string, isGroup = false) {
      return { target: { id: () => id, data: () => isGroup || undefined } };
    }

    function refTo(item: Zotero.Item): ZoteroObjectRef {
      return { kind: "item", libraryID: item.libraryID, key: item.key };
    }

    beforeEach(async function () {
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Node Click Test Article");
      article.setField("date", "2019");
      await article.saveTx();

      const doc = Zotero.getMainWindow().document;
      dockContainer = doc.createElement("div");
      dockContainer.style.display = "none";
      doc.documentElement.appendChild(dockContainer);
    });

    afterEach(async function () {
      dockContainer.remove();
      await article.eraseTx();
    });

    function fakeCy(): cytoscape.Core {
      return {
        on(
          _events: string,
          _selector: string,
          handler: (evt: {
            target: { id(): string; data(key: string): unknown };
          }) => void | Promise<void>,
        ) {
          tapHandler = handler;
        },
      } as unknown as cytoscape.Core;
    }

    it("fills the dock with the tapped node's item and keeps the mindmap tab active", async function () {
      const before = selectedTabIndex();
      attachNodeClickHandler(
        fakeCy(),
        new Map([["n1", refTo(article)]]),
        dockContainer,
      );

      await tapHandler(nodeEvent("n1"));

      assert.notEqual(dockContainer.style.display, "none");
      assert.include(
        dockContainer.textContent ?? "",
        "Node Click Test Article",
      );
      // The regression this replaced: selecting the item switched Zotero back
      // to the library tab and threw the graph away.
      assert.equal(selectedTabIndex(), before);
    });

    it("shows the item type, creator and date in the overview", async function () {
      attachNodeClickHandler(
        fakeCy(),
        new Map([["n1", refTo(article)]]),
        dockContainer,
      );

      await tapHandler(nodeEvent("n1"));

      const overview = dockContainer.querySelector(`.${OVERVIEW_CLASS}`);
      assert.isNotNull(overview);
      const text = overview!.textContent ?? "";
      assert.include(
        text,
        Zotero.ItemTypes.getLocalizedString(article.itemTypeID),
      );
      assert.include(text, "2019");
      assert.isNotNull(overview!.querySelector(`.${SHOW_IN_LIBRARY_CLASS}`));
    });

    it("shows a missing-item state when the tapped node's ref points at a deleted item", async function () {
      attachNodeClickHandler(
        fakeCy(),
        new Map<string, ZoteroObjectRef>([
          [
            "n1",
            {
              kind: "item",
              libraryID: Zotero.Libraries.userLibraryID,
              key: "NOSUCHKEY",
            },
          ],
        ]),
        dockContainer,
      );

      await tapHandler(nodeEvent("n1"));

      assert.equal(dockContainer.textContent, MISSING_ITEM_LABEL);
    });

    it("ignores a tap on a group container", async function () {
      attachNodeClickHandler(
        fakeCy(),
        new Map([["g1", refTo(article)]]),
        dockContainer,
      );

      await tapHandler(nodeEvent("g1", true));

      assert.equal(dockContainer.style.display, "none");
    });

    it("no-ops when the tapped node id has no matching ref", function () {
      attachNodeClickHandler(fakeCy(), new Map(), dockContainer);

      assert.doesNotThrow(() => tapHandler(nodeEvent("n1")));
      assert.equal(dockContainer.style.display, "none");
    });

    it("closes the dock from its own button, since right-click is the link menu", async function () {
      attachNodeClickHandler(
        fakeCy(),
        new Map([["n1", refTo(article)]]),
        dockContainer,
      );

      await tapHandler(nodeEvent("n1"));
      const close = dockContainer.querySelector(
        `.${CLOSE_CLASS}`,
      ) as HTMLButtonElement;
      assert.isNotNull(close, "the dock has no close control");
      close.click();

      assert.equal(dockContainer.style.display, "none");
      assert.equal(dockContainer.textContent, "");
    });
  });

  describe("attachNodeContextMenuHandler", function () {
    let article: Zotero.Item;
    let otherArticle: Zotero.Item;
    let dockContainer: HTMLDivElement;
    let cxttapHandler: (evt: {
      target: { id(): string; data(key: string): unknown };
    }) => void;

    let graphContainer: HTMLDivElement;

    // The shape a Cytoscape node event actually has. `data` matters here: the
    // handler asks whether the target is a group container before doing
    // anything else, and `renderedBoundingBox` is what the menu positions
    // itself against.
    function nodeEvent(id: string, isGroup = false) {
      return {
        target: {
          id: () => id,
          data: () => isGroup || undefined,
          renderedBoundingBox: () => ({
            x1: 0,
            y1: 0,
            x2: 20,
            y2: 20,
            w: 20,
            h: 20,
          }),
        },
        renderedPosition: { x: 10, y: 20 },
      };
    }

    beforeEach(async function () {
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Context Menu Test Article");
      await article.saveTx();

      otherArticle = new Zotero.Item("journalArticle");
      otherArticle.libraryID = Zotero.Libraries.userLibraryID;
      otherArticle.setField("title", "Context Menu Test Article 2");
      await otherArticle.saveTx();

      const doc = Zotero.getMainWindow().document;
      dockContainer = doc.createElement("div");
      dockContainer.style.display = "none";
      doc.documentElement.appendChild(dockContainer);
      graphContainer = doc.createElement("div");
      graphContainer.style.cssText =
        "position: relative; width: 200px; height: 200px;";
      doc.documentElement.appendChild(graphContainer);
    });

    afterEach(async function () {
      this.timeout(30000);
      dockContainer.remove();
      graphContainer.remove();
      await article.eraseTx();
      await otherArticle.eraseTx();
      // Opening the add-link form reads the mindmap document, and that read
      // creates the library's default mindmap when there is none. Left behind,
      // it becomes the note the next suite's id-less lookups resolve to.
      await clearStorageNotes();
    });

    // The menu is drawn into the graph container, so the fake has to offer one
    // the way a real Core does.
    function fakeCy(): cytoscape.Core {
      return {
        container: () => graphContainer,
        on(
          events: string,
          _selector: string,
          handler: (evt: { target: { id(): string } }) => void,
        ) {
          if (events === "cxttap") {
            cxttapHandler = handler;
          }
        },
      } as unknown as cytoscape.Core;
    }

    function refTo(item: Zotero.Item): ZoteroObjectRef {
      return { kind: "item", libraryID: item.libraryID, key: item.key };
    }

    function menuButton(): HTMLButtonElement | null {
      return graphContainer.querySelector(`.${NODE_MENU_ADD_LINK_CLASS}`);
    }

    it("opens an add-link menu on the right-clicked node (PRODUCT.md)", function () {
      attachNodeContextMenuHandler(
        fakeCy(),
        new Map([["n1", refTo(article)]]),
        dockContainer,
      );

      cxttapHandler(nodeEvent("n1"));

      assert.isNotNull(menuButton(), "no add-link action in the node menu");
      // The menu is the whole gesture: right-click alone does not dock.
      assert.equal(dockContainer.style.display, "none");
    });

    it("docks the node with the add-link form open when the action is used", async function () {
      attachNodeContextMenuHandler(
        fakeCy(),
        new Map([["n1", refTo(article)]]),
        dockContainer,
      );

      cxttapHandler(nodeEvent("n1"));
      menuButton()!.click();
      await Zotero.Promise.delay(500);

      assert.notEqual(dockContainer.style.display, "none");
      assert.include(dockContainer.textContent ?? "", "Context Menu Test");
      // The menu closes behind the action rather than staying over the graph.
      assert.isNull(menuButton());
    });

    it("ignores a right-click on a group container", function () {
      attachNodeContextMenuHandler(
        fakeCy(),
        new Map([["g1", refTo(article)]]),
        dockContainer,
      );

      cxttapHandler(nodeEvent("g1", true));

      assert.isNull(menuButton());
    });

    it("no-ops when the right-clicked node id has no matching ref", function () {
      attachNodeContextMenuHandler(fakeCy(), new Map(), dockContainer);

      assert.doesNotThrow(() => cxttapHandler(nodeEvent("n1")));
      assert.isNull(menuButton());
      assert.equal(dockContainer.style.display, "none");
    });

    // The native context menu over the graph is suppressed by Cytoscape's own
    // container binding, which it removes on destroy - the handler no longer
    // adds one of its own, since a per-render listener would outlive every
    // rebuild. Nothing a fake Core can observe, so there is no test for it.
  });

  describe("attachLiveRefresh", function () {
    let container: HTMLDivElement;
    let teardown: (() => void) | undefined;

    // One unplaced node, so the rebuild the notification kicks off reaches
    // layoutUnplacedNodes and actually writes a position back. A document with
    // nothing to lay out never writes, and would not exercise the deadlock.
    function docWithUnplacedNode(): MindmapDocument {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-live-refresh-test",
        title: "Live refresh",
        nodes: [
          {
            membership: "member",
            id: "node-a",
            position: null,
            ref: {
              kind: "item",
              libraryID: Zotero.Libraries.userLibraryID,
              key: "NOSUCHKEY",
            },
          },
        ],
        links: [],
      };
    }

    function fakeCy(): cytoscape.Core {
      return { destroy() {} } as unknown as cytoscape.Core;
    }

    beforeEach(function () {
      const doc = Zotero.getMainWindow().document;
      container = doc.createElement("div");
      // Cytoscape positions its canvases against the nearest positioned
      // ancestor, so the container has to establish one itself.
      container.style.cssText =
        "position: relative; width: 200px; height: 200px;";
      doc.documentElement.appendChild(container);
    });

    afterEach(function () {
      teardown?.();
      teardown = undefined;
      container.remove();
    });

    it("leaves the storage queue usable after a write triggers a refresh", async function () {
      // Zotero awaits every notifier observer inside the commit of the
      // transaction the queued write is running, so an observer that awaits
      // its own queued write parks it behind the task waiting on the
      // observer. Neither settles, and every later write hangs silently.
      // Without the fix the first update below never resolves and this times
      // out.
      this.timeout(30000);

      await writeMindmapDocument(docWithUnplacedNode());
      const note = await findMindmapNote();
      assert.isNotNull(note);

      teardown = attachLiveRefresh(fakeCy(), container, note!.id, []);

      const first = await updateMindmapDocument((doc) => ({
        ...doc,
        title: "refresh-1",
      }));
      assert.equal(first?.title, "refresh-1");

      const second = await updateMindmapDocument((doc) => ({
        ...doc,
        title: "refresh-2",
      }));
      assert.equal(second?.title, "refresh-2");
    });
  });

  describe("external nodes", function () {
    let container: HTMLDivElement;
    let article: Zotero.Item;
    let cy: cytoscape.Core | undefined;

    beforeEach(async function () {
      this.timeout(30000);
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Borrowed From Another Mindmap");
      await article.saveTx();

      const doc = Zotero.getMainWindow().document;
      container = doc.createElement("div");
      container.style.cssText =
        "position: relative; width: 200px; height: 200px;";
      doc.documentElement.appendChild(container);
    });

    afterEach(async function () {
      this.timeout(30000);
      cy?.destroy();
      cy = undefined;
      container.remove();
      await article.eraseTx();
    });

    function docWithExternal(): MindmapDocument {
      const ref = {
        kind: "item" as const,
        libraryID: article.libraryID,
        key: article.key,
      };
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-external-test",
        title: "External",
        nodes: [
          {
            membership: "member",
            id: "n-member",
            position: { x: 0, y: 0 },
            ref,
          },
          {
            membership: "external",
            id: "n-external",
            position: { x: 200, y: 0 },
            ref,
            homeMindmapId: "other-mindmap",
            homeNodeId: "their-node",
          },
        ],
        links: [
          {
            id: "l-1",
            typeId: "cites",
            sourceNodeId: "n-member",
            targetNodeId: "n-external",
          },
        ],
      };
    }

    it("marks a borrowed node so it renders differently (AC #2)", async function () {
      this.timeout(30000);
      cy = await renderMindmap(container, docWithExternal(), []);

      assert.isTrue(
        cy.getElementById("n-external").hasClass(EXTERNAL_NODE_CLASS),
      );
      assert.isFalse(
        cy.getElementById("n-member").hasClass(EXTERNAL_NODE_CLASS),
      );
    });

    it("labels and links a borrowed node like any other (AC #3)", async function () {
      this.timeout(30000);
      cy = await renderMindmap(container, docWithExternal(), []);

      assert.equal(
        cy.getElementById("n-external").data("label"),
        "Borrowed From Another Mindmap",
      );
      // The link into it is an ordinary edge, not special-cased anywhere.
      assert.equal(cy.getElementById("l-1").data("target"), "n-external");
    });

    it("docks the underlying item when a borrowed node is tapped (AC #3)", async function () {
      this.timeout(30000);
      const doc = Zotero.getMainWindow().document;
      const dock = doc.createElement("div");
      dock.style.display = "none";
      doc.documentElement.appendChild(dock);
      try {
        cy = await renderMindmap(container, docWithExternal(), [], dock);

        cy.getElementById("n-external").emit("tap");

        assert.notEqual(dock.style.display, "none");
        assert.include(dock.textContent ?? "", "Borrowed From Another Mindmap");
      } finally {
        dock.remove();
      }
    });
  });

  describe("groups", function () {
    let container: HTMLDivElement;
    let article: Zotero.Item;
    let cy: cytoscape.Core | undefined;

    beforeEach(async function () {
      this.timeout(30000);
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Grouped");
      await article.saveTx();

      const doc = Zotero.getMainWindow().document;
      container = doc.createElement("div");
      container.style.cssText =
        "position: relative; width: 300px; height: 300px;";
      doc.documentElement.appendChild(container);
    });

    afterEach(async function () {
      this.timeout(30000);
      cy?.destroy();
      cy = undefined;
      container.remove();
      await article.eraseTx();
    });

    function groupedDoc(): MindmapDocument {
      const ref = {
        kind: "item" as const,
        libraryID: article.libraryID,
        key: article.key,
      };
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-groups-test",
        title: "Groups",
        nodes: [
          {
            membership: "member",
            id: "n-a",
            position: { x: 40, y: 40 },
            ref,
            groupId: "g-1",
          },
          {
            membership: "member",
            id: "n-b",
            position: { x: 160, y: 40 },
            ref,
            groupId: "g-1",
          },
          { membership: "member", id: "n-c", position: { x: 40, y: 200 }, ref },
        ],
        links: [],
        groups: [{ id: "g-1", name: "Chapter one" }],
      };
    }

    it("draws a group container holding exactly its members (AC #2)", async function () {
      this.timeout(30000);
      cy = await renderMindmap(container, groupedDoc(), []);

      const group = cy.getElementById("g-1");
      assert.isTrue(group.hasClass(GROUP_NODE_CLASS));
      assert.equal(group.data("label"), "Chapter one");
      assert.deepEqual(
        group
          .children()
          .map((child) => child.id())
          .sort(),
        ["n-a", "n-b"],
      );
      assert.isTrue(cy.getElementById("n-c").parent().empty());
    });

    it("leaves every member where it already was (AC #3)", async function () {
      this.timeout(30000);
      const doc = groupedDoc();
      cy = await renderMindmap(container, doc, []);

      assert.deepEqual(cy.getElementById("n-a").position(), { x: 40, y: 40 });
      assert.deepEqual(cy.getElementById("n-b").position(), { x: 160, y: 40 });
      assert.deepEqual(
        doc.nodes.map((node) => node.position),
        [
          { x: 40, y: 40 },
          { x: 160, y: 40 },
          { x: 40, y: 200 },
        ],
      );
    });

    it("does not offer the group container as a draggable node (AC #3)", async function () {
      this.timeout(30000);
      cy = await renderMindmap(container, groupedDoc(), []);

      assert.isFalse(cy.getElementById("g-1").grabbable());
    });

    it("survives a write and read of the document (AC #4)", async function () {
      this.timeout(30000);
      await clearStorageNotes();
      await writeMindmapDocument(groupedDoc());

      const readBack = await readMindmapDocument("doc-groups-test");

      assert.deepEqual(readBack.groups, [{ id: "g-1", name: "Chapter one" }]);
      assert.equal(
        readBack.nodes.find((node) => node.id === "n-a")!.groupId,
        "g-1",
      );

      await clearStorageNotes();
    });

    it("skips a group no node belongs to, rather than drawing an empty region", async function () {
      this.timeout(30000);
      const doc = groupedDoc();
      doc.groups!.push({ id: "g-empty", name: "Nobody" });

      cy = await renderMindmap(container, doc, []);

      assert.isTrue(cy.getElementById("g-empty").empty());
    });
  });

  describe("buildParentChildTies", function () {
    let article: Zotero.Item;
    let childNote: Zotero.Item;
    let otherArticle: Zotero.Item;
    let standaloneNote: Zotero.Item;

    function node(id: string, item: Zotero.Item): MindmapNode {
      return {
        membership: "member",
        id,
        position: { x: 0, y: 0 },
        ref: {
          kind: item.isNote() ? "note" : "item",
          libraryID: item.libraryID,
          key: item.key,
        },
      };
    }

    beforeEach(async function () {
      this.timeout(30000);
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Parent");
      await article.saveTx();

      childNote = new Zotero.Item("note");
      childNote.libraryID = Zotero.Libraries.userLibraryID;
      childNote.parentID = article.id;
      childNote.setNote("<p>Child of the parent</p>");
      await childNote.saveTx();

      otherArticle = new Zotero.Item("journalArticle");
      otherArticle.libraryID = Zotero.Libraries.userLibraryID;
      otherArticle.setField("title", "Unrelated");
      await otherArticle.saveTx();

      standaloneNote = new Zotero.Item("note");
      standaloneNote.libraryID = Zotero.Libraries.userLibraryID;
      standaloneNote.setNote("<p>Belongs to nobody</p>");
      await standaloneNote.saveTx();
    });

    afterEach(async function () {
      this.timeout(30000);
      await standaloneNote.eraseTx();
      await otherArticle.eraseTx();
      await article.eraseTx();
    });

    it("ties a child note to its parent when both are nodes (AC #2)", function () {
      const ties = buildParentChildTies([
        node("n-parent", article),
        node("n-child", childNote),
      ]);

      assert.equal(ties.length, 1);
      assert.equal(ties[0].data.source, "n-parent");
      assert.equal(ties[0].data.target, "n-child");
      assert.equal(ties[0].classes, PARENT_CHILD_TIE_CLASS);
    });

    it("carries no label, so it cannot read as an authored link (AC #3)", function () {
      const ties = buildParentChildTies([
        node("n-parent", article),
        node("n-child", childNote),
      ]);

      assert.notProperty(ties[0].data, "label");
      assert.notEqual(ties[0].data.id, "n-parent");
      assert.isTrue(String(ties[0].data.id).startsWith("tie:"));
    });

    it("draws nothing when the parent isn't on the mindmap", function () {
      assert.isEmpty(buildParentChildTies([node("n-child", childNote)]));
    });

    it("draws nothing for a standalone note or an unrelated item", function () {
      const ties = buildParentChildTies([
        node("n-other", otherArticle),
        node("n-standalone", standaloneNote),
      ]);

      assert.isEmpty(ties);
    });

    it("ignores a node whose Zotero item is gone", function () {
      const ties = buildParentChildTies([
        node("n-parent", article),
        {
          membership: "member",
          id: "n-missing",
          position: { x: 0, y: 0 },
          ref: {
            kind: "note",
            libraryID: Zotero.Libraries.userLibraryID,
            key: "NOSUCHKEY",
          },
        },
      ]);

      assert.isEmpty(ties);
    });
  });

  describe("attachNodeDragHandler", function () {
    const NODE_IDS = ["node-a", "node-b", "node-c"];

    function docAt(positions: Record<string, { x: number; y: number }>) {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-drag-test",
        title: "Drag",
        nodes: NODE_IDS.map((id) => ({
          membership: "member" as const,
          id,
          position: positions[id],
          ref: {
            kind: "item" as const,
            libraryID: Zotero.Libraries.userLibraryID,
            key: "NOSUCHKEY",
          },
        })),
        links: [],
      } satisfies MindmapDocument;
    }

    const SPREAD = {
      "node-a": { x: 0, y: 0 },
      "node-b": { x: 200, y: 0 },
      "node-c": { x: 0, y: 200 },
    };

    // A headless core mirroring buildNodeElement's shape. Dragging is a
    // pointer gesture the renderer turns into a "dragfree" event per node, so
    // the tests emit that event directly rather than synthesizing pointer
    // input against a canvas.
    function headlessCy(positions: Record<string, { x: number; y: number }>) {
      return cytoscape({
        elements: {
          nodes: NODE_IDS.map((id) => ({
            data: { id, label: id },
            position: { ...positions[id] },
          })),
        },
      });
    }

    /**
     * One gesture: Cytoscape moves each selected node and emits "dragfree"
     * for each of them in the same tick.
     */
    function dragTo(
      cy: cytoscape.Core,
      moves: Record<string, { x: number; y: number }>,
    ) {
      for (const [id, position] of Object.entries(moves)) {
        const node = cy.getElementById(id);
        node.position(position);
        node.emit("dragfree");
      }
    }

    // The handler flushes on a microtask and never awaits its own write, so
    // the test has to let the microtask run before the queue has anything to
    // wait on.
    async function settle() {
      await Promise.resolve();
      await whenStorageIdle();
    }

    // Creating and filling the storage note fires its own notifications, and
    // Zotero delivers them on its own schedule. Counting writes or watching
    // for a rebuild has to start after they have drained, or the setup shows
    // up in the measurement.
    async function settleSetup() {
      await Zotero.Promise.delay(250);
    }

    function countModifications(storageNoteItemID: number) {
      let count = 0;
      const observerID = Zotero.Notifier.registerObserver(
        {
          notify(
            event: _ZoteroTypes.Notifier.Event,
            type: _ZoteroTypes.Notifier.Type,
            ids: string[] | number[],
          ) {
            if (
              event === "modify" &&
              type === "item" &&
              ids.some((id) => Number(id) === storageNoteItemID)
            ) {
              count += 1;
            }
          },
        },
        ["item"],
        "zoterolinkedmindmaps-drag-write-count-test",
      );
      return {
        get count() {
          return count;
        },
        stop: () => Zotero.Notifier.unregisterObserver(observerID),
      };
    }

    let cy: cytoscape.Core | undefined;

    beforeEach(async function () {
      await clearStorageNotes();
    });

    afterEach(async function () {
      cy?.destroy();
      cy = undefined;
      await clearStorageNotes();
    });

    it("persists where a dragged node was dropped", async function () {
      this.timeout(30000);
      await writeMindmapDocument(docAt(SPREAD));
      cy = headlessCy(SPREAD);
      attachNodeDragHandler(cy, "doc-drag-test");

      dragTo(cy, { "node-a": { x: 640, y: 480 } });
      await settle();

      const persisted = await readMindmapDocument();
      const moved = persisted.nodes.find((n) => n.id === "node-a")!;
      assert.deepEqual(moved.position, { x: 640, y: 480 });
    });

    it("writes once for a gesture that moves several nodes", async function () {
      this.timeout(30000);
      await writeMindmapDocument(docAt(SPREAD));
      const note = await findMindmapNote();
      await settleSetup();
      cy = headlessCy(SPREAD);
      attachNodeDragHandler(cy, "doc-drag-test");

      const writes = countModifications(note!.id);
      try {
        dragTo(cy, {
          "node-a": { x: 500, y: 500 },
          "node-b": { x: 700, y: 500 },
          "node-c": { x: 500, y: 700 },
        });
        await settle();
      } finally {
        writes.stop();
      }

      assert.equal(writes.count, 1);
      const persisted = await readMindmapDocument();
      const byId = new Map(persisted.nodes.map((n) => [n.id, n.position]));
      assert.deepEqual(byId.get("node-a"), { x: 500, y: 500 });
      assert.deepEqual(byId.get("node-b"), { x: 700, y: 500 });
      assert.deepEqual(byId.get("node-c"), { x: 500, y: 700 });
    });

    it("writes nothing when the gesture left every node where it was", async function () {
      this.timeout(30000);
      await writeMindmapDocument(docAt(SPREAD));
      const note = await findMindmapNote();
      await settleSetup();
      cy = headlessCy(SPREAD);
      attachNodeDragHandler(cy, "doc-drag-test");

      const writes = countModifications(note!.id);
      try {
        dragTo(cy, { "node-a": { ...SPREAD["node-a"] } });
        await settle();
      } finally {
        writes.stop();
      }

      assert.equal(writes.count, 0);
    });

    it("survives a live-refresh rebuild triggered by an unrelated edit", async function () {
      this.timeout(30000);
      await writeMindmapDocument(docAt(SPREAD));
      cy = headlessCy(SPREAD);
      attachNodeDragHandler(cy, "doc-drag-test");

      dragTo(cy, { "node-a": { x: 640, y: 480 } });
      await settle();

      await updateMindmapDocument((doc) => ({ ...doc, title: "renamed" }));

      const persisted = await readMindmapDocument();
      assert.equal(persisted.title, "renamed");
      assert.deepEqual(
        persisted.nodes.find((n) => n.id === "node-a")!.position,
        { x: 640, y: 480 },
      );
    });

    describe("live-refresh interaction", function () {
      let container: HTMLDivElement;
      let teardown: (() => void) | undefined;

      // attachLiveRefresh answers a notification by destroying the graph and
      // rebuilding it, so a destroy is the observable signal that a rebuild
      // ran.
      function destroyCountingCy() {
        let destroyed = 0;
        return {
          cy: {
            destroy() {
              destroyed += 1;
            },
          } as unknown as cytoscape.Core,
          get destroyed() {
            return destroyed;
          },
        };
      }

      beforeEach(function () {
        const doc = Zotero.getMainWindow().document;
        container = doc.createElement("div");
        container.style.cssText =
          "position: relative; width: 200px; height: 200px;";
        doc.documentElement.appendChild(container);
      });

      afterEach(function () {
        teardown?.();
        teardown = undefined;
        container.remove();
      });

      it("does not rebuild the graph for the drag write it made itself", async function () {
        this.timeout(30000);
        await writeMindmapDocument(docAt(SPREAD));
        const note = await findMindmapNote();
        await settleSetup();
        cy = headlessCy(SPREAD);
        // The graph and its observer share one state box, the way the tab
        // wires them: that is what lets the observer recognise a write the
        // graph made itself.
        const state: RenderedState = { document: null };
        attachNodeDragHandler(cy, "doc-drag-test", state);

        const rendered = destroyCountingCy();
        teardown = attachLiveRefresh(
          rendered.cy,
          container,
          note!.id,
          [],
          undefined,
          state,
        );
        // Counted from just before the gesture: a notification still in flight
        // from the setup write is not what this test is about.
        await Zotero.Promise.delay(200);
        const before = rendered.destroyed;

        dragTo(cy, { "node-a": { x: 640, y: 480 } });
        await settle();
        await Zotero.Promise.delay(300);

        assert.equal(rendered.destroyed, before);
      });

      it("does not let one graph's write suppress another graph's refresh", async function () {
        this.timeout(30000);
        await writeMindmapDocument(docAt(SPREAD));
        const note = await findMindmapNote();
        await settleSetup();
        cy = headlessCy(SPREAD);
        // Two graphs, as two open tabs would be: the drag belongs to the
        // first, so the second still has to redraw for it.
        const dragging: RenderedState = { document: null };
        attachNodeDragHandler(cy, "doc-drag-test", dragging);

        const other = destroyCountingCy();
        teardown = attachLiveRefresh(
          other.cy,
          container,
          note!.id,
          [],
          undefined,
          {
            document: null,
          },
        );
        await Zotero.Promise.delay(200);
        const before = other.destroyed;

        dragTo(cy, { "node-a": { x: 640, y: 480 } });
        await settle();
        await Zotero.Promise.delay(300);

        assert.isAbove(other.destroyed, before);
      });

      it("still rebuilds for a write the graph did not make", async function () {
        this.timeout(30000);
        await writeMindmapDocument(docAt(SPREAD));
        const note = await findMindmapNote();
        await settleSetup();

        const rendered = destroyCountingCy();
        teardown = attachLiveRefresh(rendered.cy, container, note!.id, []);
        await Zotero.Promise.delay(200);
        const before = rendered.destroyed;

        await updateMindmapDocument((doc) => ({ ...doc, title: "renamed" }));
        await Zotero.Promise.delay(300);

        assert.isAbove(rendered.destroyed, before);
      });
    });
  });

  describe("renderMindmap layout", function () {
    let container: HTMLDivElement;
    let cy: cytoscape.Core | undefined;

    function twoUnplacedNodes(): MindmapDocument {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-unmeasured-container",
        title: "Unmeasured container",
        nodes: ["node-a", "node-b"].map((id) => ({
          membership: "member" as const,
          id,
          position: null,
          ref: {
            kind: "item" as const,
            libraryID: Zotero.Libraries.userLibraryID,
            key: "NOSUCHKEY",
          },
        })),
        links: [],
      };
    }

    beforeEach(function () {
      const doc = Zotero.getMainWindow().document;
      container = doc.createElement("div");
      // The state the real mindmap tab is in when it renders: the tab was
      // created a tick ago and the container has no measured size yet. Cose
      // used to take its bounding box from the container, so a container this
      // size left every node piled on the origin.
      container.style.cssText =
        "position: relative; width: 0px; height: 0px; overflow: hidden;";
      doc.documentElement.appendChild(container);
    });

    afterEach(async function () {
      cy?.destroy();
      cy = undefined;
      container.remove();
      const note = await findMindmapNote();
      await note?.eraseTx();
    });

    it("places nodes apart even when the container has no measured size", async function () {
      const doc = twoUnplacedNodes();

      cy = await renderMindmap(container, doc, []);
      const laidOut = await layoutUnplacedNodes(cy, doc);

      assert.isNotNull(laidOut);
      const [a, b] = laidOut!.nodes.map((n) => n.position!);
      assert.isFalse(isCoincident(a, b));
    });
  });

  describe("view controls", function () {
    let container: HTMLDivElement;
    let cy: cytoscape.Core | undefined;

    function twoFarNodes(): MindmapDocument {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-view-controls-test",
        title: "View controls",
        nodes: ["node-a", "node-b"].map((id, i) => ({
          membership: "member" as const,
          id,
          position: { x: i * 900, y: i * 900 },
          ref: {
            kind: "item" as const,
            libraryID: Zotero.Libraries.userLibraryID,
            key: "NOSUCHKEY",
          },
        })),
        links: [],
      };
    }

    beforeEach(function () {
      const doc = Zotero.getMainWindow().document;
      container = doc.createElement("div");
      container.style.cssText =
        "position: relative; width: 200px; height: 200px;";
      doc.documentElement.appendChild(container);
    });

    afterEach(function () {
      cy?.destroy();
      cy = undefined;
      container.remove();
      Zotero.Prefs.clear(LEGEND_COLLAPSED_PREF_KEY, true);
    });

    it("draws a legend covering every line and node style the renderer draws (AC #1)", async function () {
      cy = await renderMindmap(container, twoFarNodes(), []);

      const rows = container.querySelectorAll(`.${LEGEND_CLASS} li`);
      assert.equal(rows.length, 5, "the legend does not cover every style");
    });

    it("can be dismissed and reopened, writing nothing to the mindmap document (AC #2)", async function () {
      const doc = twoFarNodes();
      cy = await renderMindmap(container, doc, []);
      const toggle = container.querySelector(
        `.${LEGEND_TOGGLE_BUTTON_CLASS}`,
      ) as HTMLButtonElement;
      assert.isNotNull(container.querySelector(`.${LEGEND_CLASS}`));

      toggle.click();
      assert.isNull(container.querySelector(`.${LEGEND_CLASS}`));

      toggle.click();
      assert.isNotNull(container.querySelector(`.${LEGEND_CLASS}`));

      // Toggling the legend is view state, not document state.
      assert.deepEqual(doc.nodes, twoFarNodes().nodes);
    });

    it("offers zoom out, zoom in and fit-to-window in a view toolbar (AC #3)", async function () {
      cy = await renderMindmap(container, twoFarNodes(), []);

      assert.isNotNull(container.querySelector(`.${TOOLBAR_CLASS}`));
      assert.isNotNull(container.querySelector(`.${ZOOM_OUT_BUTTON_CLASS}`));
      assert.isNotNull(container.querySelector(`.${ZOOM_IN_BUTTON_CLASS}`));
      assert.isNotNull(container.querySelector(`.${FIT_BUTTON_CLASS}`));
    });

    it("fit-to-window changes the viewport without moving any stored node position (AC #4)", async function () {
      cy = await renderMindmap(container, twoFarNodes(), []);
      const before = cy
        .nodes()
        .map((n) => ({ id: n.id(), position: { ...n.position() } }));

      // Move away from wherever the initial render settled, so the fit
      // button below is guaranteed to change the viewport.
      cy.zoom(3);
      cy.pan({ x: 500, y: 500 });
      const panAway = { ...cy.pan() };

      const fitButton = container.querySelector(
        `.${FIT_BUTTON_CLASS}`,
      ) as HTMLButtonElement;
      fitButton.click();

      assert.notDeepEqual(
        { ...cy.pan() },
        panAway,
        "fit-to-window did not change the viewport",
      );
      const after = cy
        .nodes()
        .map((n) => ({ id: n.id(), position: { ...n.position() } }));
      assert.deepEqual(
        after,
        before,
        "fit-to-window moved a node's stored position",
      );
    });
  });

  describe("node context menu styling and positioning", function () {
    let article: Zotero.Item;
    let dock: HTMLDivElement;
    let container: HTMLDivElement;
    let cy: cytoscape.Core | undefined;

    function docWithNodeAt(x: number, y: number): MindmapDocument {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-node-menu-test",
        title: "Node menu",
        nodes: [
          {
            membership: "member",
            id: "n1",
            position: { x, y },
            ref: {
              kind: "item",
              libraryID: article.libraryID,
              key: article.key,
            },
          },
        ],
        links: [],
      };
    }

    function openContainer(width: number, height: number): HTMLDivElement {
      const doc = Zotero.getMainWindow().document;
      const el = doc.createElement("div");
      el.style.cssText = `position: relative; width: ${width}px; height: ${height}px;`;
      doc.documentElement.appendChild(el);
      return el;
    }

    beforeEach(async function () {
      this.timeout(30000);
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Node Menu Test Article");
      await article.saveTx();

      const doc = Zotero.getMainWindow().document;
      dock = doc.createElement("div");
      dock.style.display = "none";
      doc.documentElement.appendChild(dock);
    });

    afterEach(async function () {
      this.timeout(30000);
      cy?.destroy();
      cy = undefined;
      container?.remove();
      dock.remove();
      await article.eraseTx();
      await clearStorageNotes();
    });

    it("gives the menu a menu background, border and a per-row hover class, with a 16px icon on the action (AC #5)", async function () {
      container = openContainer(400, 300);
      cy = await renderMindmap(container, docWithNodeAt(100, 100), [], dock);
      cy.getElementById("n1").emit("cxttap");

      const menu = container.querySelector(`.${GROUP_MENU_CLASS}`);
      assert.isNotNull(menu, "no menu was opened");
      const action = menu!.querySelector(`.${MENU_ACTION_CLASS}`);
      assert.isNotNull(action, "the add-link action is not a styled menu row");
      const icon = action!.querySelector("svg");
      assert.isNotNull(icon, "the menu action has no icon");
      assert.equal(icon!.getAttribute("width"), "16");
      assert.equal(icon!.getAttribute("height"), "16");
    });

    it("opens beside the clicked node rather than over it (AC #6)", async function () {
      container = openContainer(400, 300);
      cy = await renderMindmap(container, docWithNodeAt(100, 100), [], dock);
      cy.zoom(1);
      cy.pan({ x: 0, y: 0 });
      const node = cy.getElementById("n1");
      const box = node.renderedBoundingBox();

      node.emit("cxttap");

      const menu = container.querySelector(
        `.${GROUP_MENU_CLASS}`,
      ) as HTMLElement;
      assert.isNotNull(menu, "no menu was opened");
      const menuLeft = menu.offsetLeft;
      const menuRight = menuLeft + menu.offsetWidth;
      const overlapsNode = menuLeft < box.x2 && menuRight > box.x1;
      assert.isFalse(
        overlapsNode,
        "the menu was drawn over the node it acts on",
      );
    });

    it("stays inside the graph viewport when the node sits near an edge (AC #6)", async function () {
      container = openContainer(220, 160);
      cy = await renderMindmap(container, docWithNodeAt(190, 10), [], dock);
      cy.zoom(1);
      cy.pan({ x: 0, y: 0 });

      cy.getElementById("n1").emit("cxttap");

      const menu = container.querySelector(
        `.${GROUP_MENU_CLASS}`,
      ) as HTMLElement;
      assert.isNotNull(menu, "no menu was opened");
      assert.isAtLeast(menu.offsetLeft, 0);
      assert.isAtLeast(menu.offsetTop, 0);
      assert.isAtMost(
        menu.offsetLeft + menu.offsetWidth,
        container.clientWidth,
      );
      assert.isAtMost(
        menu.offsetTop + menu.offsetHeight,
        container.clientHeight,
      );
    });

    it("dismisses on Escape (AC #7)", async function () {
      container = openContainer(400, 300);
      cy = await renderMindmap(container, docWithNodeAt(100, 100), [], dock);
      cy.getElementById("n1").emit("cxttap");
      assert.isNotNull(container.querySelector(`.${GROUP_MENU_CLASS}`));

      const win = container.ownerDocument!.defaultView as unknown as Window;
      win.dispatchEvent(
        new (win as any).KeyboardEvent("keydown", { key: "Escape" }),
      );

      assert.isNull(container.querySelector(`.${GROUP_MENU_CLASS}`));
    });

    it("dismisses on an outside click (AC #7)", async function () {
      container = openContainer(400, 300);
      cy = await renderMindmap(container, docWithNodeAt(100, 100), [], dock);
      cy.getElementById("n1").emit("cxttap");
      assert.isNotNull(container.querySelector(`.${GROUP_MENU_CLASS}`));

      const doc = container.ownerDocument!;
      const win = doc.defaultView as unknown as Window;
      const outside = doc.createElement("div");
      doc.documentElement.appendChild(outside);
      try {
        outside.dispatchEvent(
          new (win as any).MouseEvent("mousedown", { bubbles: true }),
        );
        assert.isNull(container.querySelector(`.${GROUP_MENU_CLASS}`));
      } finally {
        outside.remove();
      }
    });
  });
});

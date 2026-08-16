import { assert } from "chai";
import type cytoscape from "cytoscape";
import {
  attachLiveRefresh,
  attachNodeClickHandler,
  attachNodeContextMenuHandler,
  computeParallelOffsets,
  MISSING_ITEM_LABEL,
  resolveLinkVisual,
  resolveNodeLabel,
  UNKNOWN_TYPE_LABEL,
} from "../../src/modules/mindmap/graphRenderer";
import {
  findMindmapNote,
  updateMindmapDocument,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";
import type { LinkType } from "../../src/modules/mindmap/linkTypes";
import { CURRENT_SCHEMA_VERSION } from "../../src/modules/mindmap/schema";
import type {
  MindmapDocument,
  MindmapLink,
  ZoteroObjectRef,
} from "../../src/modules/mindmap/schema";

describe("mindmap/graphRenderer", function () {
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
    let tapHandler: (evt: { target: { id(): string } }) => void | Promise<void>;

    beforeEach(async function () {
      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Node Click Test Article");
      await article.saveTx();
    });

    afterEach(async function () {
      await article.eraseTx();
    });

    function fakeCy(): cytoscape.Core {
      return {
        on(
          _events: string,
          _selector: string,
          handler: (evt: { target: { id(): string } }) => void | Promise<void>,
        ) {
          tapHandler = handler;
        },
      } as unknown as cytoscape.Core;
    }

    it("selects the underlying item when its node is tapped", async function () {
      const nodeRefsById = new Map<string, ZoteroObjectRef>([
        [
          "n1",
          { kind: "item", libraryID: article.libraryID, key: article.key },
        ],
      ]);
      attachNodeClickHandler(fakeCy(), nodeRefsById);

      await tapHandler({ target: { id: () => "n1" } });

      const selected = Zotero.getActiveZoteroPane().getSelectedItems();
      assert.deepEqual(
        selected.map((item) => item.id),
        [article.id],
      );
    });

    it("does not throw when the tapped node's ref points at a deleted item", async function () {
      const nodeRefsById = new Map<string, ZoteroObjectRef>([
        [
          "n1",
          {
            kind: "item",
            libraryID: Zotero.Libraries.userLibraryID,
            key: "NOSUCHKEY",
          },
        ],
      ]);
      attachNodeClickHandler(fakeCy(), nodeRefsById);

      await tapHandler({ target: { id: () => "n1" } });
    });

    it("no-ops when the tapped node id has no matching ref", function () {
      attachNodeClickHandler(fakeCy(), new Map());

      assert.doesNotThrow(() => tapHandler({ target: { id: () => "n1" } }));
    });
  });

  describe("attachNodeContextMenuHandler", function () {
    let article: Zotero.Item;
    let otherArticle: Zotero.Item;
    let dockContainer: HTMLDivElement;
    let cxttapHandler: (evt: { target: { id(): string } }) => void;
    let contextmenuListener: (evt: { preventDefault(): void }) => void;

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
    });

    afterEach(async function () {
      dockContainer.remove();
      await article.eraseTx();
      await otherArticle.eraseTx();
    });

    function fakeCy(): cytoscape.Core {
      return {
        on(
          events: string,
          _selector: string,
          handler: (evt: { target: { id(): string } }) => void,
        ) {
          if (events === "cxttap") {
            cxttapHandler = handler;
          }
        },
        container() {
          return {
            addEventListener(
              _type: string,
              listener: (evt: { preventDefault(): void }) => void,
            ) {
              contextmenuListener = listener;
            },
          } as unknown as HTMLElement;
        },
      } as unknown as cytoscape.Core;
    }

    it("docks and shows the Connections panel for the right-clicked node's item", function () {
      const nodeRefsById = new Map<string, ZoteroObjectRef>([
        [
          "n1",
          { kind: "item", libraryID: article.libraryID, key: article.key },
        ],
      ]);
      attachNodeContextMenuHandler(fakeCy(), nodeRefsById, dockContainer);

      cxttapHandler({ target: { id: () => "n1" } });

      assert.notEqual(dockContainer.style.display, "none");
    });

    it("hides the dock when the already-docked node is right-clicked again", function () {
      const nodeRefsById = new Map<string, ZoteroObjectRef>([
        [
          "n1",
          { kind: "item", libraryID: article.libraryID, key: article.key },
        ],
      ]);
      attachNodeContextMenuHandler(fakeCy(), nodeRefsById, dockContainer);

      cxttapHandler({ target: { id: () => "n1" } });
      cxttapHandler({ target: { id: () => "n1" } });

      assert.equal(dockContainer.style.display, "none");
      assert.equal(dockContainer.textContent, "");
    });

    it("re-renders in place when a different node is right-clicked", function () {
      const nodeRefsById = new Map<string, ZoteroObjectRef>([
        [
          "n1",
          { kind: "item", libraryID: article.libraryID, key: article.key },
        ],
        [
          "n2",
          {
            kind: "item",
            libraryID: otherArticle.libraryID,
            key: otherArticle.key,
          },
        ],
      ]);
      attachNodeContextMenuHandler(fakeCy(), nodeRefsById, dockContainer);

      cxttapHandler({ target: { id: () => "n1" } });
      cxttapHandler({ target: { id: () => "n2" } });

      assert.notEqual(dockContainer.style.display, "none");
    });

    it("no-ops when the right-clicked node id has no matching ref", function () {
      attachNodeContextMenuHandler(fakeCy(), new Map(), dockContainer);

      assert.doesNotThrow(() => cxttapHandler({ target: { id: () => "n1" } }));
      assert.equal(dockContainer.style.display, "none");
    });

    it("suppresses the native context menu over the graph", function () {
      attachNodeContextMenuHandler(fakeCy(), new Map(), dockContainer);

      let prevented = false;
      contextmenuListener({
        preventDefault: () => {
          prevented = true;
        },
      });

      assert.isTrue(prevented);
    });
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
});

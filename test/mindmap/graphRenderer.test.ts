import { assert } from "chai";
import cytoscape from "cytoscape";
import {
  attachLiveRefresh,
  attachNodeClickHandler,
  attachNodeContextMenuHandler,
  attachNodeDragHandler,
  buildParentChildTies,
  computeParallelOffsets,
  EXTERNAL_NODE_CLASS,
  GROUP_NODE_CLASS,
  PARENT_CHILD_TIE_CLASS,
  renderMindmap,
  resolveLinkVisual,
  UNKNOWN_TYPE_LABEL,
} from "../../src/modules/mindmap/graphRenderer";
import {
  EMPTY_NOTE_LABEL,
  MISSING_ITEM_LABEL,
  resolveNodeLabel,
} from "../../src/modules/mindmap/nodeLabels";
import { layoutUnplacedNodes } from "../../src/modules/mindmap/layout";
import {
  findAllMindmapNotes,
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

describe("mindmap/graphRenderer", function () {
  /**
   * ZoteroPane.selectItem resolves before the pane has finished settling on
   * the selection, so a single read right after it can still see the previous
   * one. Polls instead of guessing a delay.
   */
  async function waitForSelection(itemID: number): Promise<number[]> {
    let selected: number[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      selected = Zotero.getActiveZoteroPane()
        .getSelectedItems()
        .map((item) => item.id);
      if (selected.includes(itemID)) {
        return selected;
      }
      await Zotero.Promise.delay(100);
    }
    return selected;
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

      assert.deepEqual(await waitForSelection(article.id), [article.id]);
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
    let cxttapHandler: (evt: {
      target: { id(): string; data(key: string): unknown };
    }) => void;
    let contextmenuListener: (evt: { preventDefault(): void }) => void;

    // The shape a Cytoscape node event actually has. `data` matters here: the
    // handler asks whether the target is a group container before doing
    // anything else.
    function nodeEvent(id: string) {
      return { target: { id: () => id, data: () => undefined } };
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

      cxttapHandler(nodeEvent("n1"));

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

      cxttapHandler(nodeEvent("n1"));
      cxttapHandler(nodeEvent("n1"));

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

      cxttapHandler(nodeEvent("n1"));
      cxttapHandler(nodeEvent("n2"));

      assert.notEqual(dockContainer.style.display, "none");
    });

    it("no-ops when the right-clicked node id has no matching ref", function () {
      attachNodeContextMenuHandler(fakeCy(), new Map(), dockContainer);

      assert.doesNotThrow(() => cxttapHandler(nodeEvent("n1")));
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

    it("opens the underlying item when a borrowed node is tapped (AC #3)", async function () {
      this.timeout(30000);
      cy = await renderMindmap(container, docWithExternal(), []);

      cy.getElementById("n-external").emit("tap");

      assert.include(await waitForSelection(article.id), article.id);
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
      for (const note of await findAllMindmapNotes()) {
        await note.eraseTx();
      }
      await writeMindmapDocument(groupedDoc());

      const readBack = await readMindmapDocument("doc-groups-test");

      assert.deepEqual(readBack.groups, [{ id: "g-1", name: "Chapter one" }]);
      assert.equal(
        readBack.nodes.find((node) => node.id === "n-a")!.groupId,
        "g-1",
      );

      for (const note of await findAllMindmapNotes()) {
        await note.eraseTx();
      }
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

    // Every storage note, not just the first: these tests read and write by
    // mindmap id, so one left behind by an earlier file would make the
    // id-less reads here resolve somewhere else.
    async function clearAllStorageNotes() {
      for (const item of await findAllMindmapNotes()) {
        await item.eraseTx();
      }
    }

    beforeEach(async function () {
      await clearAllStorageNotes();
    });

    afterEach(async function () {
      cy?.destroy();
      cy = undefined;
      await clearAllStorageNotes();
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
        attachNodeDragHandler(cy, "doc-drag-test");

        const rendered = destroyCountingCy();
        teardown = attachLiveRefresh(rendered.cy, container, note!.id, []);
        // Counted from just before the gesture: a notification still in flight
        // from the setup write is not what this test is about.
        await Zotero.Promise.delay(200);
        const before = rendered.destroyed;

        dragTo(cy, { "node-a": { x: 640, y: 480 } });
        await settle();
        await Zotero.Promise.delay(300);

        assert.equal(rendered.destroyed, before);
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
});

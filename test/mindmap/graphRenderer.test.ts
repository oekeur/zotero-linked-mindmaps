import { assert } from "chai";
import type cytoscape from "cytoscape";
import {
  attachNodeClickHandler,
  computeParallelOffsets,
  MISSING_ITEM_LABEL,
  resolveLinkVisual,
  resolveNodeLabel,
  UNKNOWN_TYPE_LABEL,
} from "../../src/modules/mindmap/graphRenderer";
import type { LinkType } from "../../src/modules/mindmap/linkTypes";
import type {
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
});

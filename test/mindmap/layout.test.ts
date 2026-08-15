import { assert } from "chai";
import cytoscape from "cytoscape";
import { layoutUnplacedNodes } from "../../src/modules/mindmap/layout";
import {
  findMindmapNote,
  readMindmapDocument,
} from "../../src/modules/mindmap/storage";
import {
  CURRENT_SCHEMA_VERSION,
  UNPLACED_POSITION,
  isUnplaced,
  type MindmapDocument,
  type MindmapNode,
  type Position,
} from "../../src/modules/mindmap/schema";

function ref(key: string) {
  return { kind: "item" as const, libraryID: 1, key };
}

function node(id: string, position: Position | null): MindmapNode {
  return { membership: "member", id, position, ref: ref(id) };
}

function docWith(nodes: MindmapNode[]): MindmapDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "doc-layout-test",
    title: "Layout test",
    nodes,
    links: [],
  };
}

// Bare headless cytoscape.Core mirroring buildNodeElement's shape, built
// directly (no container) so this stays independent of Zotero item/label
// resolution and the XUL document.head shim renderMindmap needs.
function headlessCy(nodes: MindmapNode[]) {
  return cytoscape({
    elements: {
      nodes: nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.id,
          unplaced: isUnplaced(n.position),
        },
        position: isUnplaced(n.position) ? { x: 0, y: 0 } : n.position!,
      })),
    },
  });
}

async function clearStorageNote() {
  const item = await findMindmapNote();
  if (item) {
    await item.eraseTx();
  }
}

describe("mindmap/layout", function () {
  beforeEach(async function () {
    await clearStorageNote();
  });

  after(async function () {
    await clearStorageNote();
  });

  it("computes and persists positions for unplaced nodes on first render (AC #1)", async function () {
    const doc = docWith([
      node("node-a", UNPLACED_POSITION),
      node("node-b", UNPLACED_POSITION),
    ]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNotNull(result);
    for (const n of result!.nodes) {
      assert.isFalse(isUnplaced(n.position));
    }
    assert.isFalse(cy.getElementById("node-a").data("unplaced"));
    assert.isFalse(cy.getElementById("node-b").data("unplaced"));

    const persisted = await readMindmapDocument();
    assert.deepEqual(persisted, result);
  });

  it("treats a NaN-position node (the in-memory pre-save marker) as unplaced too", async function () {
    const doc = docWith([node("node-a", { x: NaN, y: NaN })]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNotNull(result);
    assert.isFalse(isUnplaced(result!.nodes[0].position));
  });

  it("does not run a layout or persist when every node already has a position (AC #2)", async function () {
    const doc = docWith([node("node-a", { x: 5, y: 7 })]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNull(result);
    assert.isNull(await findMindmapNote());
  });

  it("positions only the new node, leaving existing positions untouched (AC #3)", async function () {
    const placedPosition = { x: 5, y: 7 };
    const doc = docWith([
      node("node-a", placedPosition),
      node("node-b", UNPLACED_POSITION),
    ]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNotNull(result);
    const nodeA = result!.nodes.find((n) => n.id === "node-a")!;
    const nodeB = result!.nodes.find((n) => n.id === "node-b")!;
    assert.deepEqual(nodeA.position, placedPosition);
    assert.isFalse(isUnplaced(nodeB.position));
  });
});

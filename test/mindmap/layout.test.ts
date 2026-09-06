import { assert } from "chai";
import cytoscape from "cytoscape";
import {
  gridPositions,
  layoutUnplacedNodes,
  relayoutPositions,
} from "../../src/modules/mindmap/layout";
import {
  findMindmapNote,
  readMindmapDocument,
} from "../../src/modules/mindmap/storage";
import {
  CURRENT_SCHEMA_VERSION,
  UNPLACED_POSITION,
  piledNodeIds,
  isCoincident,
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
// resolution and the XUL document.head shim renderMindmap needs. A headless
// core has no measured viewport, which is also the state the real tab is in
// when it lays out: whatever passes here has to work without one.
function headlessCy(nodes: MindmapNode[]) {
  const piled = piledNodeIds(nodes);
  return cytoscape({
    elements: {
      nodes: nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.id,
          unplaced: isUnplaced(n.position) || piled.has(n.id),
        },
        // Copied, like buildNodeElement's toElementPosition: Cytoscape writes
        // to the position object it is given.
        position: isUnplaced(n.position) ? { x: 0, y: 0 } : { ...n.position! },
      })),
      edges: [],
    },
  });
}

function positionsOf(doc: MindmapDocument): Position[] {
  return doc.nodes.map((n) => n.position!);
}

function anyPairCoincident(positions: Position[]): boolean {
  return positions.some((a, i) =>
    positions.slice(i + 1).some((b) => isCoincident(a, b)),
  );
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
      node("node-a", { ...placedPosition }),
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

  it("spreads nodes apart with no measured container to size the layout", async function () {
    const doc = docWith(
      ["node-a", "node-b", "node-c", "node-d"].map((id) =>
        node(id, UNPLACED_POSITION),
      ),
    );
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNotNull(result);
    assert.isFalse(anyPairCoincident(positionsOf(result!)));
  });

  it("re-lays out a document piled entirely on one point despite stored positions", async function () {
    const doc = docWith([
      node("node-a", { x: 0, y: 0 }),
      node("node-b", { x: 0, y: 0 }),
    ]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNotNull(result);
    assert.isFalse(anyPairCoincident(positionsOf(result!)));
  });

  it("leaves a hand-made overlap alone: a dragged node is not re-placed", async function () {
    const overlap = { x: 20, y: 20 };
    const doc = docWith([
      node("node-a", { ...overlap }),
      node("node-b", { ...overlap }),
      node("node-c", { x: 400, y: 400 }),
    ]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNull(result);
    assert.isNull(await findMindmapNote());
  });

  it("places a new node without disturbing an existing hand-made overlap", async function () {
    const overlap = { x: 20, y: 20 };
    const doc = docWith([
      node("node-a", { ...overlap }),
      node("node-b", { ...overlap }),
      node("node-c", UNPLACED_POSITION),
    ]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNotNull(result);
    const byId = new Map(result!.nodes.map((n) => [n.id, n.position!]));
    assert.deepEqual(byId.get("node-a"), overlap);
    assert.deepEqual(byId.get("node-b"), overlap);
    assert.isFalse(isCoincident(byId.get("node-c")!, overlap));
  });

  it("converges: a repaired layout is not laid out again on reopen", async function () {
    const doc = docWith([
      node("node-a", { x: 0, y: 0 }),
      node("node-b", { x: 0, y: 0 }),
    ]);

    const repaired = await layoutUnplacedNodes(headlessCy(doc.nodes), doc);
    assert.isNotNull(repaired);

    const reopened = await layoutUnplacedNodes(
      headlessCy(repaired!.nodes),
      repaired!,
    );
    assert.isNull(reopened);
  });

  it("leaves a single node alone: one node cannot be stacked on anything", async function () {
    const doc = docWith([node("node-a", { x: 0, y: 0 })]);
    const cy = headlessCy(doc.nodes);

    const result = await layoutUnplacedNodes(cy, doc);

    assert.isNull(result);
    assert.isNull(await findMindmapNote());
  });

  describe("gridPositions", function () {
    const box = { x1: 100, y1: 200, w: 480, h: 480 };

    it("places every node on its own coordinates", function () {
      const positions = gridPositions(["c", "a", "b", "d"], box);

      assert.equal(positions.size, 4);
      assert.isFalse(anyPairCoincident([...positions.values()]));
    });

    it("starts at the box origin and orders by node id, so a rebuild reproduces it", function () {
      const positions = gridPositions(["c", "a", "b", "d"], box);

      assert.deepEqual(positions.get("a"), { x: 100, y: 200 });
      assert.deepEqual(
        gridPositions(["d", "b", "a", "c"], box).get("a"),
        positions.get("a"),
      );
    });
  });

  describe("piledNodeIds", function () {
    it("reports every node when the whole document sits on the origin", function () {
      const ids = piledNodeIds([
        node("node-a", { x: 0, y: 0 }),
        node("node-b", { x: 0, y: 0 }),
        node("node-c", { x: 0, y: 0 }),
      ]);

      assert.deepEqual([...ids].sort(), ["node-a", "node-b", "node-c"]);
    });

    it("reports nothing for a pile the user dragged together away from the origin", function () {
      const ids = piledNodeIds([
        node("node-a", { x: 80, y: 40 }),
        node("node-b", { x: 80, y: 40 }),
      ]);

      assert.equal(ids.size, 0);
    });

    it("reports nothing when only some nodes overlap", function () {
      const ids = piledNodeIds([
        node("node-a", { x: 0, y: 0 }),
        node("node-b", { x: 0, y: 0 }),
        node("node-c", { x: 300, y: 300 }),
      ]);

      assert.equal(ids.size, 0);
    });

    it("ignores nodes with no position yet", function () {
      const ids = piledNodeIds([
        node("node-a", UNPLACED_POSITION),
        node("node-b", UNPLACED_POSITION),
      ]);

      assert.equal(ids.size, 0);
    });

    it("counts only placed nodes towards the pile", function () {
      const ids = piledNodeIds([
        node("node-a", { x: 0, y: 0 }),
        node("node-b", { x: 0, y: 0 }),
        node("node-c", UNPLACED_POSITION),
      ]);

      assert.deepEqual([...ids].sort(), ["node-a", "node-b"]);
    });

    it("reports nothing for a lone node", function () {
      assert.equal(piledNodeIds([node("node-a", { x: 0, y: 0 })]).size, 0);
    });
  });

  describe("mindmap/layout relayoutPositions", function () {
    // Groups are compound parents in the graph, so a member points at its group
    // through `parent`, the same shape buildGroupElements builds. The group
    // carries no position of its own.
    function groupedCy(
      members: Array<{ id: string; group?: string; at: Position }>,
      groups: string[],
    ) {
      return cytoscape({
        elements: {
          nodes: [
            ...groups.map((id) => ({ data: { id, label: id, isGroup: true } })),
            ...members.map((m) => ({
              data: {
                id: m.id,
                label: m.id,
                ...(m.group ? { parent: m.group } : {}),
              },
              position: { ...m.at },
            })),
          ],
          edges: [],
        },
      });
    }

    const spread = (ids: string[]): Array<{ id: string; at: Position }> =>
      ids.map((id, i) => ({ id, at: { x: i * 500, y: i * 500 } }));

    it("lays out every node when no scope is given, and returns no group container", async function () {
      const cy = groupedCy(
        [
          { id: "a", group: "g1", at: { x: 0, y: 0 } },
          { id: "b", group: "g1", at: { x: 900, y: 900 } },
          { id: "c", at: { x: 1800, y: 1800 } },
        ],
        ["g1"],
      );

      const positions = await relayoutPositions(cy);

      assert.deepEqual([...positions.keys()].sort(), ["a", "b", "c"]);
      assert.isFalse(positions.has("g1"), "a group has no stored position");
      // Asserted before the pile check, which NaN would otherwise sail
      // through: every comparison against NaN is false.
      for (const [id, position] of positions) {
        assert.isTrue(
          Number.isFinite(position.x) && Number.isFinite(position.y),
          id + " must get a finite position, got " + JSON.stringify(position),
        );
      }
      assert.isFalse(
        anyPairCoincident([...positions.values()]),
        "a relayout must not pile nodes on one another",
      );
    });

    it("lays out only the scoped nodes and leaves other stored positions alone", async function () {
      const cy = groupedCy(spread(["a", "b", "c", "d"]), []);
      const untouched = ["c", "d"].map((id) => ({
        id,
        at: { ...cy.$id(id).position() },
      }));

      const positions = await relayoutPositions(cy, ["a", "b"]);

      assert.deepEqual([...positions.keys()].sort(), ["a", "b"]);
      for (const { id, at } of untouched) {
        const now = cy.$id(id).position();
        assert.deepEqual(
          { x: now.x, y: now.y },
          at,
          id + " must keep its stored position",
        );
      }
    });

    it("keeps a group's members together, and its box off unrelated nodes", async function () {
      // Members start in opposite corners, which is the arrangement that
      // stretches a group box across the canvas if the layout ignores the
      // compound parent.
      const cy = groupedCy(
        [
          { id: "g-a", group: "g1", at: { x: -2000, y: -2000 } },
          { id: "g-b", group: "g1", at: { x: 2000, y: 2000 } },
          { id: "g-c", group: "g1", at: { x: -2000, y: 2000 } },
          { id: "loner", at: { x: 0, y: 0 } },
        ],
        ["g1"],
      );

      await relayoutPositions(cy);

      const box = cy.$id("g1").boundingBox();
      const loner = cy.$id("loner").position();
      const swallowed =
        loner.x >= box.x1 &&
        loner.x <= box.x2 &&
        loner.y >= box.y1 &&
        loner.y <= box.y2;
      assert.isFalse(
        swallowed,
        "the group box must not swallow a node outside it",
      );

      const members = ["g-a", "g-b", "g-c"].map((id) => cy.$id(id).position());
      for (const position of members) {
        assert.isTrue(
          Number.isFinite(position.x) && Number.isFinite(position.y),
          "a group member must get a finite position, got " +
            JSON.stringify(members),
        );
      }
      const furthest = Math.max(
        ...members.flatMap((a) =>
          members.map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
        ),
      );
      assert.isBelow(
        furthest,
        4000,
        "members must end up nearer each other than the corners they started in",
      );
    });

    it("returns nothing for a scope that matches no node", async function () {
      const cy = groupedCy(spread(["a"]), []);
      const positions = await relayoutPositions(cy, ["nosuchnode"]);
      assert.equal(positions.size, 0);
    });
  });
});

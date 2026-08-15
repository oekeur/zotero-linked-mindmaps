import { assert } from "chai";
import { removeLink, removeNode } from "../../src/modules/mindmap/mutations";
import type { MindmapDocument } from "../../src/modules/mindmap/schema";

function docWithThreeNodes(): MindmapDocument {
  return {
    schemaVersion: 1,
    id: "doc-1",
    title: "Test mindmap",
    nodes: [
      {
        membership: "member",
        id: "node-a",
        position: { x: 0, y: 0 },
        ref: { kind: "item", libraryID: 1, key: "AAAAAAAA" },
      },
      {
        membership: "member",
        id: "node-b",
        position: { x: 100, y: 100 },
        ref: { kind: "item", libraryID: 1, key: "BBBBBBBB" },
      },
      {
        membership: "member",
        id: "node-c",
        position: { x: 200, y: 200 },
        ref: { kind: "item", libraryID: 1, key: "CCCCCCCC" },
      },
    ],
    links: [
      {
        id: "link-ab",
        typeId: "cites",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
      },
      {
        id: "link-bc",
        typeId: "contradicts",
        sourceNodeId: "node-b",
        targetNodeId: "node-c",
      },
    ],
  };
}

describe("mindmap/mutations", function () {
  describe("removeNode", function () {
    it("removes the node", function () {
      const doc = docWithThreeNodes();
      removeNode(doc, "node-b");
      assert.deepEqual(
        doc.nodes.map((n) => n.id),
        ["node-a", "node-c"],
      );
    });

    it("removes every link touching the node", function () {
      const doc = docWithThreeNodes();
      removeNode(doc, "node-b");
      assert.lengthOf(doc.links, 0);
    });

    it("leaves links untouched between two unrelated nodes", function () {
      const doc = docWithThreeNodes();
      removeNode(doc, "node-a");
      assert.deepEqual(
        doc.links.map((l) => l.id),
        ["link-bc"],
      );
    });

    it("is a no-op for an unknown node id", function () {
      const doc = docWithThreeNodes();
      removeNode(doc, "node-missing");
      assert.lengthOf(doc.nodes, 3);
      assert.lengthOf(doc.links, 2);
    });
  });

  describe("removeLink", function () {
    it("removes only the matching link", function () {
      const doc = docWithThreeNodes();
      removeLink(doc, "link-ab");
      assert.deepEqual(
        doc.links.map((l) => l.id),
        ["link-bc"],
      );
    });

    it("leaves both endpoint nodes untouched", function () {
      const doc = docWithThreeNodes();
      removeLink(doc, "link-ab");
      assert.deepEqual(
        doc.nodes.map((n) => n.id),
        ["node-a", "node-b", "node-c"],
      );
    });

    it("is a no-op for an unknown link id", function () {
      const doc = docWithThreeNodes();
      removeLink(doc, "link-missing");
      assert.lengthOf(doc.links, 2);
    });
  });
});

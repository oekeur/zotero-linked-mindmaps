import { assert } from "chai";
import {
  createGroup,
  deleteGroup,
  removeFromGroup,
  removeLink,
  removeNode,
  renameGroup,
} from "../../src/modules/mindmap/mutations";
import { CURRENT_SCHEMA_VERSION } from "../../src/modules/mindmap/schema";
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
  describe("grouping", function () {
    function docWithNodes(): MindmapDocument {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-group-test",
        title: "Grouping",
        nodes: ["node-a", "node-b", "node-c"].map((id) => ({
          membership: "member" as const,
          id,
          position: { x: 10, y: 20 },
          ref: { kind: "item" as const, libraryID: 1, key: "AAAAAAAA" },
        })),
        links: [
          {
            id: "link-1",
            typeId: "cites",
            sourceNodeId: "node-a",
            targetNodeId: "node-b",
          },
        ],
      };
    }

    it("groups the given nodes and leaves the rest ungrouped (AC #2)", function () {
      const doc = docWithNodes();

      const group = createGroup(doc, ["node-a", "node-b"]);

      assert.deepEqual(doc.groups, [{ id: group.id }]);
      assert.equal(
        doc.nodes.find((node) => node.id === "node-a")!.groupId,
        group.id,
      );
      assert.equal(
        doc.nodes.find((node) => node.id === "node-b")!.groupId,
        group.id,
      );
      assert.isUndefined(
        doc.nodes.find((node) => node.id === "node-c")!.groupId,
      );
    });

    it("never moves a member (AC #3)", function () {
      const doc = docWithNodes();
      const before = doc.nodes.map((node) => ({ ...node.position! }));

      createGroup(doc, ["node-a", "node-b"], "Chapter one");

      assert.deepEqual(
        doc.nodes.map((node) => ({ ...node.position! })),
        before,
      );
    });

    it("keeps a name when one is given, and omits the key when not", function () {
      const named = docWithNodes();
      const unnamed = docWithNodes();

      createGroup(named, ["node-a"], "Chapter one");
      createGroup(unnamed, ["node-a"]);

      assert.equal(named.groups![0].name, "Chapter one");
      assert.notProperty(unnamed.groups![0], "name");
    });

    it("moves a node between groups rather than putting it in both", function () {
      const doc = docWithNodes();
      const first = createGroup(doc, ["node-a", "node-b"]);
      const second = createGroup(doc, ["node-b"]);

      assert.equal(
        doc.nodes.find((node) => node.id === "node-b")!.groupId,
        second.id,
      );
      assert.equal(
        doc.nodes.find((node) => node.id === "node-a")!.groupId,
        first.id,
      );
    });

    it("renames a group without touching its members", function () {
      const doc = docWithNodes();
      const group = createGroup(doc, ["node-a", "node-b"]);

      renameGroup(doc, group.id, "Evidence");

      assert.equal(doc.groups![0].name, "Evidence");
      assert.equal(
        doc.nodes.find((node) => node.id === "node-a")!.groupId,
        group.id,
      );
    });

    it("deletes a group, keeping its members and their links (AC #5)", function () {
      const doc = docWithNodes();
      const group = createGroup(doc, ["node-a", "node-b"]);

      deleteGroup(doc, group.id);

      assert.isEmpty(doc.groups!);
      assert.lengthOf(doc.nodes, 3);
      assert.lengthOf(doc.links, 1);
      for (const node of doc.nodes) {
        assert.notProperty(node, "groupId");
      }
    });

    it("removes one node from its group, leaving the group and the others (AC #5)", function () {
      const doc = docWithNodes();
      const group = createGroup(doc, ["node-a", "node-b"]);

      removeFromGroup(doc, "node-a");

      assert.lengthOf(doc.groups!, 1);
      assert.notProperty(
        doc.nodes.find((node) => node.id === "node-a")!,
        "groupId",
      );
      assert.equal(
        doc.nodes.find((node) => node.id === "node-b")!.groupId,
        group.id,
      );
      assert.lengthOf(doc.links, 1);
    });
  });
});

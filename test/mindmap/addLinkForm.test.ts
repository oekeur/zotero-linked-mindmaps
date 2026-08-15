import { assert } from "chai";
import { CURRENT_SCHEMA_VERSION } from "../../src/modules/mindmap/schema";
import type { MindmapDocument } from "../../src/modules/mindmap/schema";
import {
  appendLink,
  completeLink,
  renderAddLinkForm,
} from "../../src/modules/mindmap/addLinkForm";

function emptyDoc(): MindmapDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "doc-add-link-test",
    title: "Add-link test",
    nodes: [],
    links: [],
  };
}

describe("mindmap/addLinkForm", function () {
  describe("appendLink", function () {
    it("creates a source node when none matches the ref, and appends the link", function () {
      const doc = emptyDoc();
      const link = appendLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "AAAAAAAA" },
        targetNodeId: "target-1",
        typeId: "cites",
      });

      assert.lengthOf(doc.nodes, 1);
      assert.equal(doc.nodes[0].ref.key, "AAAAAAAA");
      assert.lengthOf(doc.links, 1);
      assert.equal(doc.links[0], link);
      assert.equal(link.sourceNodeId, doc.nodes[0].id);
      assert.equal(link.targetNodeId, "target-1");
    });

    it("reuses an existing source node instead of creating a duplicate", function () {
      const doc = emptyDoc();
      doc.nodes.push({
        membership: "member",
        id: "existing-node",
        position: { x: 10, y: 20 },
        ref: { kind: "item", libraryID: 1, key: "BBBBBBBB" },
      });

      const link = appendLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "BBBBBBBB" },
        targetNodeId: "target-2",
        typeId: "supports",
      });

      assert.lengthOf(doc.nodes, 1);
      assert.equal(link.sourceNodeId, "existing-node");
    });

    it("appends without mutating or removing an existing parallel link between the same node pair", function () {
      const doc = emptyDoc();
      doc.nodes.push(
        {
          membership: "member",
          id: "node-a",
          position: { x: 0, y: 0 },
          ref: { kind: "item", libraryID: 1, key: "CCCCCCCC" },
        },
        {
          membership: "member",
          id: "node-b",
          position: { x: 5, y: 5 },
          ref: { kind: "item", libraryID: 1, key: "DDDDDDDD" },
        },
      );
      const existingLink = {
        id: "existing-link",
        typeId: "cites",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
      };
      doc.links.push({ ...existingLink });

      const newLink = appendLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "CCCCCCCC" },
        targetNodeId: "node-b",
        typeId: "contradicts",
      });

      assert.lengthOf(doc.links, 2);
      assert.deepEqual(doc.links[0], existingLink);
      assert.equal(doc.links[1], newLink);
      assert.equal(newLink.sourceNodeId, "node-a");
      assert.equal(newLink.targetNodeId, "node-b");
    });

    it("sets direction only when provided, and omits it otherwise", function () {
      const doc = emptyDoc();
      const undirected = appendLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "EEEEEEEE" },
        targetNodeId: "target-3",
        typeId: "related-to",
      });
      assert.isUndefined(undirected.direction);

      const directed = appendLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "EEEEEEEE" },
        targetNodeId: "target-4",
        typeId: "cites",
        direction: "backward",
      });
      assert.equal(directed.direction, "backward");
    });

    it("maps a blank name to undefined, not an empty string", function () {
      const doc = emptyDoc();
      const link = appendLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "FFFFFFFF" },
        targetNodeId: "target-5",
        typeId: "cites",
        name: undefined,
      });
      assert.isUndefined(link.name);
    });
  });

  describe("completeLink", function () {
    it("rejects a target that's the same object as the source", function () {
      const doc = emptyDoc();
      const ref = { kind: "item" as const, libraryID: 1, key: "SELFSELF" };

      const result = completeLink(doc, {
        sourceRef: ref,
        targetRef: ref,
        typeId: "cites",
      });

      assert.isFalse(result.ok);
      assert.lengthOf(doc.nodes, 0);
      assert.lengthOf(doc.links, 0);
    });

    it("creates a target node when none matches the ref, and appends the link", function () {
      const doc = emptyDoc();

      const result = completeLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "SOURCE01" },
        targetRef: { kind: "item", libraryID: 1, key: "TARGET01" },
        typeId: "cites",
      });

      assert.isTrue(result.ok);
      assert.lengthOf(doc.nodes, 2);
      const targetNode = doc.nodes.find((node) => node.ref.key === "TARGET01");
      assert.isDefined(targetNode);
      assert.equal(
        (result as { link: { targetNodeId: string } }).link.targetNodeId,
        targetNode!.id,
      );
    });

    it("reuses an existing target node instead of creating a duplicate", function () {
      const doc = emptyDoc();
      doc.nodes.push({
        membership: "member",
        id: "existing-target",
        position: { x: 1, y: 2 },
        ref: { kind: "item", libraryID: 1, key: "TARGET02" },
      });

      const result = completeLink(doc, {
        sourceRef: { kind: "item", libraryID: 1, key: "SOURCE02" },
        targetRef: { kind: "item", libraryID: 1, key: "TARGET02" },
        typeId: "cites",
      });

      assert.isTrue(result.ok);
      assert.lengthOf(doc.nodes, 2);
      assert.equal(
        (result as { link: { targetNodeId: string } }).link.targetNodeId,
        "existing-target",
      );
    });
  });

  describe("renderAddLinkForm", function () {
    let container: HTMLDivElement;
    let item: Zotero.Item;

    beforeEach(async function () {
      item = new Zotero.Item("journalArticle");
      item.libraryID = Zotero.Libraries.userLibraryID;
      item.setField("title", "Add Link Form Test Item");
      await item.saveTx();

      const doc = Zotero.getMainWindow().document;
      container = doc.createElement("div");
      doc.documentElement.appendChild(container);
    });

    afterEach(async function () {
      container.remove();
      await item.eraseTx();
    });

    it("renders a Choose target button and starts with Save disabled and no target label shown", function () {
      renderAddLinkForm(container, item, emptyDoc(), () => {});

      const chooseTargetButton = Array.from(
        container.querySelectorAll("button"),
      ).find((button) =>
        button.getAttribute("data-l10n-id")?.includes("choose-target"),
      );
      assert.isDefined(chooseTargetButton);

      const saveButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.getAttribute("data-l10n-id")?.includes("save"),
      ) as HTMLButtonElement;
      assert.isDefined(saveButton);
      assert.isTrue(saveButton.disabled);
    });
  });
});

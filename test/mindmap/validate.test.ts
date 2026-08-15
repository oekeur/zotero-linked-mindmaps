import { assert } from "chai";
import { parseMindmapDocument } from "../../src/modules/mindmap/validate";
import type { MindmapDocument } from "../../src/modules/mindmap/schema";

function validDoc(): MindmapDocument {
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
    ],
    links: [
      {
        id: "link-1",
        typeId: "cites",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
      },
      {
        id: "link-2",
        typeId: "contradicts",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
      },
    ],
  };
}

describe("mindmap/validate", function () {
  it("accepts a well-formed document", function () {
    const result = parseMindmapDocument(validDoc());
    assert.isTrue(result.ok);
  });

  it("allows more than one link between the same node pair", function () {
    const result = parseMindmapDocument(validDoc());
    assert.isTrue(result.ok);
    if (result.ok) {
      assert.equal(result.doc.links.length, 2);
    }
  });

  it("rejects an unsupported schemaVersion", function () {
    const doc = { ...validDoc(), schemaVersion: 2 };
    const result = parseMindmapDocument(doc);
    assert.isFalse(result.ok);
  });

  it("accepts a node with a null position (unplaced marker)", function () {
    const doc = validDoc();
    doc.nodes[0] = { ...doc.nodes[0], position: null };
    const result = parseMindmapDocument(doc);
    assert.isTrue(result.ok);
  });

  it("rejects a node with a non-null, non-position position value", function () {
    const doc = validDoc();
    // @ts-expect-error intentionally malformed for the test
    doc.nodes[0] = { ...doc.nodes[0], position: "not-a-position" };
    const result = parseMindmapDocument(doc);
    assert.isFalse(result.ok);
  });

  it("rejects a node missing its ref", function () {
    const doc = validDoc();
    // @ts-expect-error intentionally malformed for the test
    delete doc.nodes[0].ref;
    const result = parseMindmapDocument(doc);
    assert.isFalse(result.ok);
  });

  it("rejects a non-object document", function () {
    const result = parseMindmapDocument(null);
    assert.isFalse(result.ok);
  });
});

import { assert } from "chai";
import type { MindmapDocument } from "../../src/modules/mindmap/schema";
import { CURRENT_SCHEMA_VERSION } from "../../src/modules/mindmap/schema";
import {
  findMindmapNote,
  STORAGE_TAG,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { countLinksUsingType } from "../../src/modules/mindmap/linkTypesSettings";

async function clearStorageNote() {
  const item = await findMindmapNote();
  if (item) {
    await item.eraseTx();
  }
}

function docWithLinks(): MindmapDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "doc-link-types-settings-test",
    title: "Link types settings test",
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
        position: { x: 1, y: 1 },
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
        typeId: "cites",
        sourceNodeId: "node-b",
        targetNodeId: "node-a",
      },
      {
        id: "link-3",
        typeId: "supports",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
      },
    ],
  };
}

describe("mindmap/linkTypesSettings", function () {
  beforeEach(async function () {
    await clearStorageNote();
    await writeMindmapDocument(docWithLinks());
  });

  after(async function () {
    await clearStorageNote();
  });

  it("counts links using a type id referenced twice", async function () {
    assert.equal(await countLinksUsingType("cites"), 2);
  });

  it("counts links using a type id referenced once", async function () {
    assert.equal(await countLinksUsingType("supports"), 1);
  });

  it("returns 0 for a type id no link references", async function () {
    assert.equal(await countLinksUsingType("contradicts"), 0);
  });

  // Replaces the storage note rather than overwriting the one beforeEach
  // wrote: Zotero re-serializes note HTML on save asynchronously, and that
  // late write lands after a same-tick overwrite and restores the old content.
  it("returns null when the mindmap document can't be read", async function () {
    await clearStorageNote();
    const note = new Zotero.Item("note");
    note.libraryID = Zotero.Libraries.userLibraryID;
    note.setNote("<p>no data block here</p>");
    note.addTag(STORAGE_TAG);
    await note.saveTx();
    assert.isNull(await countLinksUsingType("cites"));
  });
});

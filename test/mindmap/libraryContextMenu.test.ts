import { assert } from "chai";
import { addToMindmap } from "../../src/modules/mindmap/libraryContextMenu";
import {
  findMindmapNote,
  readMindmapDocument,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { CURRENT_SCHEMA_VERSION } from "../../src/modules/mindmap/schema";

async function clearStorageNote() {
  const item = await findMindmapNote();
  if (item) {
    await item.eraseTx();
  }
}

describe("mindmap/libraryContextMenu", function () {
  describe("addToMindmap", function () {
    let article: Zotero.Item;
    let note: Zotero.Item;

    beforeEach(async function () {
      await clearStorageNote();

      article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Library Menu Test Article");
      await article.saveTx();

      note = new Zotero.Item("note");
      note.libraryID = Zotero.Libraries.userLibraryID;
      note.setNote("<p>Library Menu Test Note</p>");
      await note.saveTx();
    });

    afterEach(async function () {
      await article.eraseTx();
      await note.eraseTx();
      await clearStorageNote();
    });

    it("adds every selected item as a node, in a single write", async function () {
      const addedCount = await addToMindmap([article, note]);
      assert.equal(addedCount, 2);

      const doc = await readMindmapDocument();
      assert.lengthOf(doc.nodes, 2);
      const keys = doc.nodes.map((n) => n.ref.key).sort();
      assert.deepEqual(keys, [article.key, note.key].sort());
      assert.isTrue(
        doc.nodes.every((n) => n.position.x === 0 && n.position.y === 0),
      );
    });

    it("skips an item that's already a node instead of duplicating it", async function () {
      await writeMindmapDocument({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: "doc-existing",
        title: "Mindmap",
        nodes: [
          {
            membership: "member",
            id: "existing-node",
            position: { x: 0, y: 0 },
            ref: {
              kind: "item",
              libraryID: article.libraryID,
              key: article.key,
            },
          },
        ],
        links: [],
      });

      const addedCount = await addToMindmap([article, note]);
      assert.equal(addedCount, 1);

      const doc = await readMindmapDocument();
      assert.lengthOf(doc.nodes, 2);
      assert.equal(
        doc.nodes.find((n) => n.ref.key === article.key)!.id,
        "existing-node",
      );
    });

    it("does nothing when no eligible items are given", async function () {
      const addedCount = await addToMindmap([]);
      assert.equal(addedCount, 0);
      assert.isNull(await findMindmapNote());
    });
  });
});

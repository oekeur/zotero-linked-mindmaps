import { assert } from "chai";
import { addToMindmap } from "../../src/modules/mindmap/libraryContextMenu";
import {
  createMindmap,
  findMindmapNote,
  readMindmapDocument,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";
import {
  CURRENT_SCHEMA_VERSION,
  isUnplaced,
} from "../../src/modules/mindmap/schema";
import { clearStorageNotes } from "./storageNotes";

describe("mindmap/libraryContextMenu", function () {
  describe("addToMindmap", function () {
    let article: Zotero.Item;
    let note: Zotero.Item;

    beforeEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();

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
      this.timeout(30000);
      await article.eraseTx();
      await note.eraseTx();
      await clearStorageNotes();
    });

    it("adds every selected item as a node, in a single write", async function () {
      const { added: addedCount } = await addToMindmap([article, note]);
      assert.equal(addedCount, 2);

      const doc = await readMindmapDocument();
      assert.lengthOf(doc.nodes, 2);
      const keys = doc.nodes.map((n) => n.ref.key).sort();
      assert.deepEqual(keys, [article.key, note.key].sort());
      assert.isTrue(doc.nodes.every((n) => isUnplaced(n.position)));
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

      const { added: addedCount } = await addToMindmap([article, note]);
      assert.equal(addedCount, 1);

      const doc = await readMindmapDocument();
      assert.lengthOf(doc.nodes, 2);
      assert.equal(
        doc.nodes.find((n) => n.ref.key === article.key)!.id,
        "existing-node",
      );
    });

    it("does nothing when no eligible items are given", async function () {
      const { added: addedCount } = await addToMindmap([]);
      assert.equal(addedCount, 0);
      assert.isNull(await findMindmapNote());
    });

    it("adds to the mindmap it was given, not the library's first", async function () {
      this.timeout(30000);
      const first = await createMindmap("Chapter one");
      const second = await createMindmap("Methods");

      const { added: addedCount, mindmapTitle } = await addToMindmap(
        [article, note],
        second.id,
      );
      assert.equal(addedCount, 2);
      assert.equal(mindmapTitle, "Methods");

      assert.lengthOf((await readMindmapDocument(second.id)).nodes, 2);
      assert.isEmpty((await readMindmapDocument(first.id)).nodes);
    });

    it("still resolves the default mindmap when given no id", async function () {
      this.timeout(30000);
      const first = await createMindmap("Chapter one");
      await createMindmap("Methods");

      await addToMindmap([article]);

      assert.lengthOf((await readMindmapDocument(first.id)).nodes, 1);
    });
  });
});

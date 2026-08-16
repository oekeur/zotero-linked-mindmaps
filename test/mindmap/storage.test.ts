import { assert } from "chai";
import type { MindmapDocument } from "../../src/modules/mindmap/schema";
import {
  CURRENT_SCHEMA_VERSION,
  isUnplaced,
} from "../../src/modules/mindmap/schema";
import {
  createMindmap,
  findAllMindmapNotes,
  findMindmapNote,
  listMindmaps,
  readMindmapDocument,
  StorageError,
  STORAGE_TAG,
  updateMindmapDocument,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";

async function clearStorageNote() {
  for (const item of await findAllMindmapNotes()) {
    await item.eraseTx();
  }
}

function docWithNodesAndLinks(): MindmapDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "doc-storage-test",
    title: "Storage round-trip",
    description: "has & < > to exercise escaping",
    nodes: [
      {
        membership: "member",
        id: "node-a",
        position: { x: 1, y: 2 },
        ref: { kind: "item", libraryID: 1, key: "AAAAAAAA" },
      },
    ],
    links: [],
  };
}

describe("mindmap/storage", function () {
  beforeEach(async function () {
    await clearStorageNote();
  });

  after(async function () {
    await clearStorageNote();
  });

  it("creates a tagged storage note on first use", async function () {
    assert.isNull(await findMindmapNote());
    const doc = await readMindmapDocument();
    assert.equal(doc.title, "Mindmap");
    const item = await findMindmapNote();
    assert.isNotNull(item);
    assert.isTrue(item!.hasTag(STORAGE_TAG));
  });

  it("round-trips a document through write then read without data loss", async function () {
    const doc = docWithNodesAndLinks();
    await writeMindmapDocument(doc);
    const readBack = await readMindmapDocument();
    assert.deepEqual(readBack, doc);
  });

  it("reuses the same note across repeated writes, persisting each update", async function () {
    await writeMindmapDocument(docWithNodesAndLinks());
    const first = await findMindmapNote();
    await writeMindmapDocument({ ...docWithNodesAndLinks(), title: "Renamed" });
    const second = await findMindmapNote();
    assert.equal(first!.id, second!.id);
    const readBack = await readMindmapDocument();
    assert.equal(readBack.title, "Renamed");
  });

  // Builds the note from scratch rather than overwriting one this module
  // already wrote: Zotero re-serializes note HTML on save asynchronously, and
  // that late write lands after a same-tick overwrite and restores the old
  // content.
  it("throws a StorageError when the note's data block is missing", async function () {
    assert.isNull(await findMindmapNote());
    const note = new Zotero.Item("note");
    note.libraryID = Zotero.Libraries.userLibraryID;
    note.setNote("<p>no data block here</p>");
    note.addTag(STORAGE_TAG);
    await note.saveTx();
    try {
      await readMindmapDocument();
      assert.fail("expected readMindmapDocument to throw");
    } catch (err) {
      assert.instanceOf(err, StorageError);
      assert.equal((err as StorageError).reason, "block-missing");
    }
  });

  it("reads a note the Zotero note editor has normalized (id attribute stripped)", async function () {
    const doc = docWithNodesAndLinks();
    await writeMindmapDocument(doc);
    const note = await findMindmapNote();
    note!.setNote(
      note!
        .getNote()
        .replace(`<pre id="zoterolinkedmindmaps-data">`, "<pre>")
        .replace("</pre>", "</pre>\n"),
    );
    await note!.saveTx();

    assert.deepEqual(await readMindmapDocument(), doc);
  });

  it("throws a StorageError when the note's JSON payload is malformed", async function () {
    const item = new Zotero.Item("note");
    item.libraryID = Zotero.Libraries.userLibraryID;
    item.setNote(
      '<p>warn</p><pre id="zoterolinkedmindmaps-data">{not valid json</pre>',
    );
    item.addTag(STORAGE_TAG);
    await item.saveTx();
    try {
      await readMindmapDocument();
      assert.fail("expected readMindmapDocument to throw");
    } catch (err) {
      assert.instanceOf(err, StorageError);
      assert.equal((err as StorageError).reason, "parse-failed");
    }
  });

  it("round-trips an unplaced node (NaN position) as still-unplaced after write then read", async function () {
    const doc: MindmapDocument = {
      ...docWithNodesAndLinks(),
      nodes: [
        ...docWithNodesAndLinks().nodes,
        {
          membership: "member",
          id: "node-unplaced",
          // NaN, not the null the doc would normally carry once persisted -
          // this is what appendLink actually produces in memory before a
          // save. JSON.stringify turns NaN into null, so this exercises the
          // exact round-trip that used to make writeMindmapDocument's saved
          // note unreadable ("invalid nodes array").
          position: { x: NaN, y: NaN },
          ref: { kind: "item", libraryID: 1, key: "CCCCCCCC" },
        },
      ],
    };

    await writeMindmapDocument(doc);
    const readBack = await readMindmapDocument();

    const node = readBack.nodes.find((n) => n.id === "node-unplaced");
    assert.isDefined(node);
    assert.isNull(node!.position);
    assert.isTrue(isUnplaced(node!.position));
  });

  it("throws a StorageError when writing a document that fails schema validation", async function () {
    const invalid = { ...docWithNodesAndLinks(), schemaVersion: 999 };
    try {
      // @ts-expect-error intentionally invalid schemaVersion for the test
      await writeMindmapDocument(invalid);
      assert.fail("expected writeMindmapDocument to throw");
    } catch (err) {
      assert.instanceOf(err, StorageError);
      assert.equal((err as StorageError).reason, "invalid-schema");
    }
  });

  describe("registry", function () {
    it("lists every mindmap with its id, title and description (AC #1)", async function () {
      const first = await createMindmap("Chapter one", "sources for ch. 1");
      const second = await createMindmap("Methods");

      const listed = await listMindmaps();

      assert.equal(listed.length, 2);
      const byId = new Map(listed.map((entry) => [entry.id, entry]));
      assert.equal(byId.get(first.id)!.title, "Chapter one");
      assert.equal(byId.get(first.id)!.description, "sources for ch. 1");
      assert.isUndefined(byId.get(second.id)!.description);
      assert.isNumber(byId.get(second.id)!.noteItemID);
    });

    it("gives each mindmap its own storage note and leaves the others alone (AC #2)", async function () {
      const first = await createMindmap("First");
      await writeMindmapDocument({
        ...docWithNodesAndLinks(),
        id: first.id,
        title: "First",
      });

      const second = await createMindmap("Second");

      assert.equal((await findAllMindmapNotes()).length, 2);
      const firstDoc = await readMindmapDocument(first.id);
      assert.equal(firstDoc.nodes.length, 1);
      assert.equal(firstDoc.title, "First");
      assert.deepEqual(await readMindmapDocument(second.id), second);
    });

    it("writes to the note the document's own id belongs to", async function () {
      const first = await createMindmap("First");
      const second = await createMindmap("Second");

      await updateMindmapDocument(
        (doc) => ({ ...doc, title: "Second, renamed" }),
        second.id,
      );

      assert.equal((await readMindmapDocument(first.id)).title, "First");
      assert.equal(
        (await readMindmapDocument(second.id)).title,
        "Second, renamed",
      );
    });

    it("throws not-found for an id no mindmap carries", async function () {
      await createMindmap("Only one");
      try {
        await readMindmapDocument("no-such-mindmap");
        assert.fail("expected readMindmapDocument to throw");
      } catch (err) {
        assert.instanceOf(err, StorageError);
        assert.equal((err as StorageError).reason, "not-found");
      }
    });

    it("rejects a mindmap with a blank title", async function () {
      try {
        await createMindmap("   ");
        assert.fail("expected createMindmap to throw");
      } catch (err) {
        assert.instanceOf(err, StorageError);
        assert.equal((err as StorageError).reason, "invalid-schema");
      }
      assert.isEmpty(await listMindmaps());
    });

    // The registry is the set of tagged notes, and a note written before it
    // existed already carries its own id and title, so it needs no migrating -
    // it lists as an ordinary entry with its nodes and links intact (AC #3).
    it("lists a document written by the single-mindmap path as its first entry (AC #3)", async function () {
      await writeMindmapDocument(docWithNodesAndLinks());

      const listed = await listMindmaps();

      assert.equal(listed.length, 1);
      assert.equal(listed[0].id, "doc-storage-test");
      assert.equal(listed[0].title, "Storage round-trip");
      const doc = await readMindmapDocument(listed[0].id);
      assert.deepEqual(doc, docWithNodesAndLinks());
    });

    it("skips a note that no longer parses rather than failing the whole listing", async function () {
      const good = await createMindmap("Readable");
      const broken = new Zotero.Item("note");
      broken.libraryID = Zotero.Libraries.userLibraryID;
      broken.setNote('<p>warn</p><pre id="x">{not valid json</pre>');
      broken.addTag(STORAGE_TAG);
      await broken.saveTx();

      const listed = await listMindmaps();

      assert.equal(listed.length, 1);
      assert.equal(listed[0].id, good.id);
    });
  });
});

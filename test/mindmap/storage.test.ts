import { assert } from "chai";
import type { MindmapDocument } from "../../src/modules/mindmap/schema";
import {
  CURRENT_SCHEMA_VERSION,
  isUnplaced,
} from "../../src/modules/mindmap/schema";
import {
  findMindmapNote,
  readMindmapDocument,
  StorageError,
  STORAGE_TAG,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";

async function clearStorageNote() {
  const item = await findMindmapNote();
  if (item) {
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

  it("throws a StorageError when the note's data block is missing", async function () {
    const item = await findMindmapNote();
    assert.isNull(item);
    await writeMindmapDocument(docWithNodesAndLinks());
    const note = await findMindmapNote();
    note!.setNote("<p>no data block here</p>");
    await note!.saveTx();
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
});

import { assert } from "chai";
import type { MindmapDocument } from "../../src/modules/mindmap/schema";
import {
  CURRENT_SCHEMA_VERSION,
  isUnplaced,
} from "../../src/modules/mindmap/schema";
import {
  CONTAINER_TAG,
  createMindmap,
  deleteMindmap,
  findAllMindmapNotes,
  findContainers,
  findMindmapNote,
  findOrCreateContainer,
  hasHiddenMindmapData,
  listMindmaps,
  readDocumentFromNote,
  readMindmapDocument,
  reconcileContainer,
  StorageError,
  STORAGE_TAG,
  updateMindmapDocument,
  updateMindmapMetadata,
  writeMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { clearStorageNotes } from "./storageNotes";

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
    await clearStorageNotes();
  });

  after(async function () {
    await clearStorageNotes();
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

    it("renames a mindmap and edits its description, leaving its content alone (AC #2)", async function () {
      const created = await createMindmap("Working title", "first pass");
      await writeMindmapDocument({
        ...docWithNodesAndLinks(),
        id: created.id,
        title: "Working title",
        description: "first pass",
      });

      const updated = await updateMindmapMetadata(created.id, {
        title: "Final title",
        description: "second pass",
      });

      assert.equal(updated.title, "Final title");
      assert.equal(updated.description, "second pass");
      assert.equal(updated.nodes.length, 1);
      const listed = await listMindmaps();
      assert.equal(listed[0].title, "Final title");
      assert.equal(listed[0].description, "second pass");
    });

    it("clears a description when passed an empty one", async function () {
      const created = await createMindmap("Titled", "to be cleared");

      const updated = await updateMindmapMetadata(created.id, {
        description: "",
      });

      assert.isUndefined(updated.description);
      assert.equal(updated.title, "Titled");
      assert.isUndefined((await listMindmaps())[0].description);
    });

    it("refuses to rename a mindmap to a blank title", async function () {
      const created = await createMindmap("Keeps its name");
      try {
        await updateMindmapMetadata(created.id, { title: "  " });
        assert.fail("expected updateMindmapMetadata to throw");
      } catch (err) {
        assert.instanceOf(err, StorageError);
        assert.equal((err as StorageError).reason, "invalid-schema");
      }
      assert.equal(
        (await readMindmapDocument(created.id)).title,
        "Keeps its name",
      );
    });

    it("deletes a mindmap and its links without touching the items they pointed at (AC #3)", async function () {
      const article = new Zotero.Item("journalArticle");
      article.libraryID = Zotero.Libraries.userLibraryID;
      article.setField("title", "Referenced by a deleted mindmap");
      await article.saveTx();

      const doomed = await createMindmap("Doomed");
      const survivor = await createMindmap("Survivor");
      await writeMindmapDocument({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: doomed.id,
        title: "Doomed",
        nodes: [
          {
            membership: "member",
            id: "node-a",
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

      await deleteMindmap(doomed.id);

      const remaining = await listMindmaps();
      assert.deepEqual(
        remaining.map((entry) => entry.id),
        [survivor.id],
      );
      assert.isFalse(
        Zotero.Items.getByLibraryAndKey(article.libraryID, article.key) ===
          false,
      );

      await article.eraseTx();
    });

    it("throws not-found when deleting a mindmap that isn't there", async function () {
      try {
        await deleteMindmap("no-such-mindmap");
        assert.fail("expected deleteMindmap to throw");
      } catch (err) {
        assert.instanceOf(err, StorageError);
        assert.equal((err as StorageError).reason, "not-found");
      }
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

  describe("container item", function () {
    async function makeContainer(): Promise<Zotero.Item> {
      const item = new Zotero.Item("document");
      item.libraryID = Zotero.Libraries.userLibraryID;
      item.setField("title", "Zotero Linked Mindmaps (plugin data)");
      item.addTag(CONTAINER_TAG);
      await item.saveTx();
      return item;
    }

    async function makeTopLevelStorageNote(html: string): Promise<Zotero.Item> {
      const note = new Zotero.Item("note");
      note.libraryID = Zotero.Libraries.userLibraryID;
      note.setNote(html);
      note.addTag(STORAGE_TAG);
      await note.saveTx();
      return note;
    }

    function byKey(items: Zotero.Item[]): Zotero.Item[] {
      return [...items].sort((a, b) => (a.key < b.key ? -1 : 1));
    }

    it("hangs every new storage note off a single container (AC #1)", async function () {
      await createMindmap("First");
      await createMindmap("Second");
      await createMindmap("Third");

      const containers = await findContainers();
      assert.equal(containers.length, 1);
      const notes = await findAllMindmapNotes();
      assert.equal(notes.length, 3);
      for (const note of notes) {
        assert.equal(note.parentItemID, containers[0].id);
      }
    });

    it("reparents a pre-existing top-level note, unchanged, and does nothing on a second run (AC #2)", async function () {
      const note = await makeTopLevelStorageNote(
        '<p>warn</p><pre id="zoterolinkedmindmaps-data">{"schemaVersion":1,"id":"legacy","title":"Legacy","nodes":[],"links":[]}</pre>',
      );
      const key = note.key;
      await note.reload(["note"], true);
      const before = note.getNote();

      assert.equal(await reconcileContainer(), "ok");

      const containers = await findContainers();
      assert.equal(containers.length, 1);
      await note.reload(["primaryData", "note"], true);
      assert.equal(note.parentItemID, containers[0].id);
      assert.equal(note.key, key);
      assert.equal(note.getNote(), before);

      assert.equal(await reconcileContainer(), "ok");
      assert.equal((await findContainers()).length, 1);
      await note.reload(["primaryData"], true);
      assert.equal(note.parentItemID, containers[0].id);
    });

    it("reports a trashed container and creates no replacement behind it (AC #4)", async function () {
      await createMindmap("Hidden by the trash");
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);

      assert.equal(await reconcileContainer(), "trashed");

      assert.isEmpty(await findContainers());
      const all = await findContainers(undefined, { includeTrashed: true });
      assert.equal(all.length, 1);
      assert.equal(all[0].id, container.id);
    });

    it("refuses to build a replacement behind a trashed container", async function () {
      await createMindmap("Hidden by the trash");
      const [container] = await findContainers();
      await Zotero.Items.trashTx([container.id]);

      let thrown: unknown;
      try {
        await findOrCreateContainer();
      } catch (err) {
        thrown = err;
      }

      assert.instanceOf(thrown, StorageError);
      assert.equal((thrown as StorageError).reason, "container-trashed");
      assert.isEmpty(await findContainers());
      assert.lengthOf(
        await findContainers(undefined, { includeTrashed: true }),
        1,
      );
    });

    it("still builds a container for a library that has never had one", async function () {
      assert.isEmpty(await findContainers());

      const container = await findOrCreateContainer();

      assert.isTrue(container.hasTag(CONTAINER_TAG));
      assert.lengthOf(await findContainers(), 1);
    });

    it("reports hidden data for a trashed storage note", async function () {
      await createMindmap("First");
      const second = await createMindmap("Second");
      assert.isFalse(await hasHiddenMindmapData());

      const [note] = (await findAllMindmapNotes()).filter(
        (candidate) => readDocumentFromNote(candidate).id === second.id,
      );
      await Zotero.Items.trashTx([note.id]);

      assert.isTrue(await hasHiddenMindmapData());
      assert.lengthOf(await findAllMindmapNotes(), 1);
    });

    it("reports hidden data for notes that went down with a trashed container", async function () {
      await createMindmap("Hidden by the trash");
      const [container] = await findContainers();

      await Zotero.Items.trashTx([container.id]);

      assert.isTrue(await hasHiddenMindmapData());
    });

    it("reports no hidden data for a healthy library", async function () {
      await createMindmap("Perfectly fine");

      assert.isFalse(await hasHiddenMindmapData());
    });

    it("adopts the lowest-key container and erases the duplicate", async function () {
      const [lower, higher] = byKey([
        await makeContainer(),
        await makeContainer(),
      ]);
      const note = await makeTopLevelStorageNote("<p>stray</p>");
      note.parentItemID = higher.id;
      await note.saveTx();

      assert.equal(await reconcileContainer(), "ok");

      const containers = await findContainers();
      assert.equal(containers.length, 1);
      assert.equal(containers[0].id, lower.id);
      await note.reload(["primaryData"], true);
      assert.equal(note.parentItemID, lower.id);
    });

    it("erases the container once the last mindmap is deleted (AC #5)", async function () {
      const only = await createMindmap("The only one");
      assert.equal((await findContainers()).length, 1);

      await deleteMindmap(only.id);

      assert.isEmpty(await findContainers());
    });

    it("keeps the container while another mindmap still uses it", async function () {
      const doomed = await createMindmap("Doomed");
      await createMindmap("Survivor");

      await deleteMindmap(doomed.id);

      assert.equal((await findContainers()).length, 1);
    });

    // The container exists to keep storage notes off the library's top level,
    // not to change what the plugin can reach: the registry search adds no
    // noChildren condition, so a child note still matches it (AC #6).
    it("still finds and reads a mindmap once its note is a child", async function () {
      const created = await createMindmap("Readable as a child");
      const notes = await findAllMindmapNotes();

      assert.equal(notes.length, 1);
      assert.isNumber(notes[0].parentItemID);
      assert.equal(
        (await readMindmapDocument(created.id)).title,
        "Readable as a child",
      );
    });
  });
});

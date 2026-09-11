import { assert } from "chai";
import {
  createMindmap,
  deleteMindmap,
  onStorageWrite,
  updateMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { clearStorageNotes } from "./storageNotes";

describe("mindmap/storage: the write signal", function () {
  this.timeout(30000);

  let libraryID: number;
  let seen: number[];
  let unsubscribe: () => void;

  before(function () {
    libraryID = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    await clearStorageNotes();
    seen = [];
    unsubscribe = onStorageWrite((id) => {
      seen.push(id);
    });
  });

  afterEach(async function () {
    unsubscribe();
    await clearStorageNotes();
  });

  it("emits once, carrying the library id, when a mindmap is created", async function () {
    await createMindmap("Signal", undefined, libraryID);
    assert.deepEqual(seen, [libraryID]);
  });

  it("emits once when a document update lands", async function () {
    const doc = await createMindmap("Signal", undefined, libraryID);
    seen.length = 0;
    await updateMindmapDocument(
      (current) => ({ ...current, title: "Renamed" }),
      doc.id,
      libraryID,
    );
    assert.deepEqual(seen, [libraryID]);
  });

  it("emits nothing when the mutation opts out with null", async function () {
    const doc = await createMindmap("Signal", undefined, libraryID);
    seen.length = 0;
    await updateMindmapDocument(() => null, doc.id, libraryID);
    assert.deepEqual(seen, []);
  });

  it("emits once when a mindmap is deleted", async function () {
    const doc = await createMindmap("Signal", undefined, libraryID);
    seen.length = 0;
    await deleteMindmap(doc.id, libraryID);
    assert.deepEqual(seen, [libraryID]);
  });

  it("stops notifying once the returned unsubscribe function is called", async function () {
    unsubscribe();
    await createMindmap("Signal", undefined, libraryID);
    assert.deepEqual(seen, []);
  });

  it("logs and continues past a listener that throws, so the write still lands and the others still run", async function () {
    const stopThrowing = onStorageWrite(() => {
      throw new Error("listener boom");
    });
    const after: number[] = [];
    const stopAfter = onStorageWrite((id) => {
      after.push(id);
    });
    try {
      const doc = await createMindmap("Signal", undefined, libraryID);
      assert.isString(doc.id, "the write itself failed");
      assert.deepEqual(after, [libraryID]);
      assert.deepEqual(seen, [libraryID]);
    } finally {
      stopThrowing();
      stopAfter();
    }
  });
});

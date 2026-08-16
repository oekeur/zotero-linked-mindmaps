import { assert } from "chai";
import { canBeMindmapNode, refFor } from "../../src/modules/mindmap/mutations";
import { openTargetPicker } from "../../src/modules/mindmap/targetPicker";

interface PickerIO {
  dataOut: number[] | null;
  singleSelection: boolean;
  onlyRegularItems: boolean;
  filterLibraryIDs: number[];
}

/**
 * Stands in for the native selectItemsDialog, which blocks on real user
 * input. Captures the io object the picker hands it and answers with
 * `choose`, so the contract the dialog is driven by is assertable.
 */
function withStubbedDialog<T>(
  choose: number | null,
  run: () => Promise<T>,
): Promise<{ result: T; io: PickerIO | undefined }> {
  const win = Zotero.getMainWindow() as any;
  const original = win.openDialog;
  let captured: PickerIO | undefined;
  win.openDialog = (
    _url: string,
    _name: string,
    _features: string,
    io: PickerIO,
  ) => {
    captured = io;
    io.dataOut = choose === null ? null : [choose];
    return null;
  };
  return run()
    .then((result) => ({ result, io: captured }))
    .finally(() => {
      win.openDialog = original;
    });
}

describe("mindmap/targetPicker", function () {
  let article: Zotero.Item;
  let childNote: Zotero.Item;
  let standaloneNote: Zotero.Item;

  beforeEach(async function () {
    article = new Zotero.Item("journalArticle");
    article.libraryID = Zotero.Libraries.userLibraryID;
    article.setField("title", "Target Picker Test Article");
    article.setCreators([
      { firstName: "Ada", lastName: "Lovelace", creatorType: "author" },
    ]);
    await article.saveTx();

    childNote = new Zotero.Item("note");
    childNote.libraryID = Zotero.Libraries.userLibraryID;
    childNote.parentID = article.id;
    childNote.setNote("<p>A note attached to the article</p>");
    await childNote.saveTx();

    standaloneNote = new Zotero.Item("note");
    standaloneNote.libraryID = Zotero.Libraries.userLibraryID;
    standaloneNote.setNote("<p>A note of its own</p>");
    await standaloneNote.saveTx();
  });

  afterEach(async function () {
    await standaloneNote.eraseTx();
    await article.eraseTx();
  });

  it("converts an item to a ZoteroObjectRef", function () {
    assert.deepEqual(refFor(article), {
      kind: "item",
      libraryID: article.libraryID,
      key: article.key,
    });
  });

  it("converts a standalone note to a note ref (AC #1)", function () {
    assert.deepEqual(refFor(standaloneNote), {
      kind: "note",
      libraryID: standaloneNote.libraryID,
      key: standaloneNote.key,
    });
  });

  it("converts a child note to a note ref of its own, keyed independently of its parent (AC #1)", function () {
    const ref = refFor(childNote);
    assert.equal(ref.kind, "note");
    assert.equal(ref.key, childNote.key);
    assert.notEqual(ref.key, article.key);
  });

  it("opens the dialog with notes selectable and one pick at a time (AC #1)", async function () {
    // onlyRegularItems is the whole mechanism: Zotero passes it to the item
    // tree as `regularOnly`, and with it off the tree expands parents so
    // child notes are rows of their own, selectable individually.
    const { io } = await withStubbedDialog(null, () => openTargetPicker());

    assert.isFalse(io!.onlyRegularItems);
    assert.isTrue(io!.singleSelection);
    assert.deepEqual(io!.filterLibraryIDs, [Zotero.Libraries.userLibraryID]);
  });

  it("returns the child note itself when one is picked, not its parent (AC #2)", async function () {
    const { result } = await withStubbedDialog(childNote.id, () =>
      openTargetPicker(),
    );

    assert.equal(result!.id, childNote.id);
    assert.deepEqual(refFor(result!), {
      kind: "note",
      libraryID: childNote.libraryID,
      key: childNote.key,
    });
  });

  it("returns only the parent when the parent is picked, never its child notes (AC #2)", async function () {
    const { result } = await withStubbedDialog(article.id, () =>
      openTargetPicker(),
    );

    assert.equal(result!.id, article.id);
    assert.deepEqual(refFor(result!), {
      kind: "item",
      libraryID: article.libraryID,
      key: article.key,
    });
  });

  it("resolves to null when the dialog is dismissed without a pick", async function () {
    const { result } = await withStubbedDialog(null, () => openTargetPicker());

    assert.isNull(result);
  });

  it("accepts items and notes as link targets, and refuses attachments", async function () {
    const attachment = await Zotero.Attachments.linkFromURL({
      url: "https://example.org/paper.pdf",
      parentItemID: article.id,
      title: "Linked PDF",
    });

    assert.isTrue(canBeMindmapNode(article));
    assert.isTrue(canBeMindmapNode(standaloneNote));
    assert.isTrue(canBeMindmapNode(childNote));
    assert.isFalse(canBeMindmapNode(attachment));
  });
});

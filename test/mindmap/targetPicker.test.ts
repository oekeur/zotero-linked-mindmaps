import { assert } from "chai";
import {
  searchTargetItems,
  toRef,
} from "../../src/modules/mindmap/targetPicker";

describe("mindmap/targetPicker", function () {
  let article: Zotero.Item;
  let note: Zotero.Item;

  beforeEach(async function () {
    article = new Zotero.Item("journalArticle");
    article.libraryID = Zotero.Libraries.userLibraryID;
    article.setField("title", "Target Picker Test Article");
    article.setCreators([
      { firstName: "Ada", lastName: "Lovelace", creatorType: "author" },
    ]);
    await article.saveTx();

    note = new Zotero.Item("note");
    note.libraryID = Zotero.Libraries.userLibraryID;
    note.setNote("<p>Target Picker Test Note</p>");
    await note.saveTx();
  });

  afterEach(async function () {
    await article.eraseTx();
    await note.eraseTx();
  });

  it("finds items matching a title/creator query via Zotero.Search", async function () {
    const { items } = await searchTargetItems("Target Picker Test Article");
    assert.isTrue(items.some((item) => item.id === article.id));
  });

  it("returns no matches for a query that matches nothing", async function () {
    const { items } = await searchTargetItems(
      "no-such-item-zzzzzzzzzzzzzzzzzz",
    );
    assert.isFalse(items.some((item) => item.id === article.id));
  });

  it("excludes standalone notes from results", async function () {
    const { items } = await searchTargetItems("Target Picker Test");
    assert.isFalse(items.some((item) => item.id === note.id));
  });

  it("returns top-level items when the query is empty", async function () {
    const { items } = await searchTargetItems("");
    assert.isTrue(items.some((item) => item.id === article.id));
    assert.isFalse(items.some((item) => item.id === note.id));
  });

  it("converts an item to a ZoteroObjectRef", function () {
    assert.deepEqual(toRef(article), {
      kind: "item",
      libraryID: article.libraryID,
      key: article.key,
    });
  });
});

import { assert } from "chai";
import { toRef } from "../../src/modules/mindmap/targetPicker";

describe("mindmap/targetPicker", function () {
  let article: Zotero.Item;

  beforeEach(async function () {
    article = new Zotero.Item("journalArticle");
    article.libraryID = Zotero.Libraries.userLibraryID;
    article.setField("title", "Target Picker Test Article");
    article.setCreators([
      { firstName: "Ada", lastName: "Lovelace", creatorType: "author" },
    ]);
    await article.saveTx();
  });

  afterEach(async function () {
    await article.eraseTx();
  });

  it("converts an item to a ZoteroObjectRef", function () {
    assert.deepEqual(toRef(article), {
      kind: "item",
      libraryID: article.libraryID,
      key: article.key,
    });
  });
});

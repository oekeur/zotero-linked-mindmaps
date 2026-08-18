import { assert } from "chai";
import {
  CLOSE_CLASS,
  HEADER_CLASS,
  SHOW_IN_LIBRARY_CLASS,
  TITLE_CLASS,
  TYPE_CLASS,
  renderNodeOverview,
} from "../../src/modules/mindmap/nodeOverview";

/**
 * Direct coverage of the dock's own summary, rather than only reaching it
 * through the graph's node-click handler: the DOM order this asserts is what
 * renderNodeOverview itself decides, and nothing else in the render chain
 * would move it back if it regressed.
 */
describe("mindmap/nodeOverview", function () {
  let article: Zotero.Item;
  let container: HTMLDivElement;

  beforeEach(async function () {
    this.timeout(30000);
    article = new Zotero.Item("journalArticle");
    article.libraryID = Zotero.Libraries.userLibraryID;
    article.setField("title", "Overview Order Test");
    article.setField("date", "2021");
    await article.saveTx();

    const doc = Zotero.getMainWindow().document;
    container = doc.createElement("div");
    doc.documentElement.appendChild(container);
  });

  afterEach(async function () {
    this.timeout(30000);
    container.remove();
    await article.eraseTx();
  });

  it("leads with the title and item type, with the close control trailing on the same row (AC #5)", function () {
    const overview = renderNodeOverview(
      container,
      article,
      () => {},
      () => {},
    );

    const header = overview.querySelector(`.${HEADER_CLASS}`) as HTMLElement;
    assert.isNotNull(header, "expected a header row");

    const close = header.querySelector(`.${CLOSE_CLASS}`);
    assert.isNotNull(close, "expected the close control in the header row");
    assert.equal(
      header.lastElementChild,
      close,
      "the close control does not trail the header row",
    );

    const title = header.querySelector(`.${TITLE_CLASS}`);
    const type = header.querySelector(`.${TYPE_CLASS}`);
    assert.isNotNull(title);
    assert.isNotNull(type);
    assert.equal(title!.textContent, "Overview Order Test");
    assert.equal(
      type!.textContent,
      Zotero.ItemTypes.getLocalizedString(article.itemTypeID),
    );
    // Title and type sit ahead of the close control, not after it.
    assert.isBelow(
      [...header.children].indexOf(title!.parentElement!),
      [...header.children].indexOf(close as Element),
    );

    // Actions - the "show in library" button - come after the header row.
    const headerIndex = [...overview.children].indexOf(header);
    const showInLibrary = overview.querySelector(
      `.${SHOW_IN_LIBRARY_CLASS}`,
    ) as Element;
    assert.isAbove([...overview.children].indexOf(showInLibrary), headerIndex);
  });
});

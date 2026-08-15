import { assert } from "chai";
import { renderConnectionsContent } from "../../src/modules/mindmap/connectionsPanel";
import { getLocaleID } from "../../src/utils/locale";

describe("mindmap/connectionsPanel", function () {
  let article: Zotero.Item;
  let container: HTMLDivElement;

  beforeEach(async function () {
    article = new Zotero.Item("journalArticle");
    article.libraryID = Zotero.Libraries.userLibraryID;
    article.setField("title", "Connections Panel Test Article");
    await article.saveTx();

    const doc = Zotero.getMainWindow().document;
    container = doc.createElement("div");
    doc.documentElement.appendChild(container);
  });

  afterEach(async function () {
    container.remove();
    await article.eraseTx();
  });

  it("gives a mount without a section header its own Add link button", async function () {
    await renderConnectionsContent(container, article);

    const button = container.querySelector(
      `[data-l10n-id="${getLocaleID("add-link-button")}"]`,
    );
    assert.isNotNull(button);
  });

  it("keeps the add-link form hidden until the button is clicked", async function () {
    await renderConnectionsContent(container, article);

    const form = container.querySelector<HTMLElement>(".mindmap-add-link-form");
    assert.isNotNull(form);
    assert.equal(form!.style.display, "none");
    assert.equal(form!.childElementCount, 0);
  });
});

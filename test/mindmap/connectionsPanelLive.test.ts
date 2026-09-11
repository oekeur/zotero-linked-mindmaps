import { assert } from "chai";
import { config } from "../../package.json";
import { createMindmap } from "../../src/modules/mindmap/storage";
import { addToMindmap } from "../../src/modules/mindmap/libraryContextMenu";
import { clearStorageNotes } from "./storageNotes";
import { waitFor } from "../waitFor";
import { query } from "../dom";

/**
 * Drives the Connections section the plugin actually registered, through a
 * real ZoteroPane selection, rather than calling renderConnectionsContent
 * against a detached container the way connectionsPanel.test.ts does. The
 * section is appended after every one of Zotero's own, so on the test
 * window's item pane it sits below the fold; that is the case these specs
 * exist for.
 */
describe("mindmap/connectionsPanel: the registered section", function () {
  this.timeout(30000);

  const SECTION_SELECTOR =
    'item-pane-custom-section[data-pane*="linked-mindmaps-connections"]';

  let win: any;
  let article: Zotero.Item;

  before(function () {
    win = Zotero.getMainWindow() as any;
  });

  beforeEach(async function () {
    await clearStorageNotes();
    article = new Zotero.Item("journalArticle");
    article.libraryID = Zotero.Libraries.userLibraryID;
    article.setField("title", "Connections Section Live Article");
    // Zotero selects a single item added through the API unless told not to,
    // which would render the section here, before the spec's own write, and
    // turn its later selectItem into a no-op.
    await article.saveTx({ skipSelect: true });
  });

  afterEach(async function () {
    await article.eraseTx();
    await clearStorageNotes();
  });

  function registeredOption(): any {
    const options = (Zotero.ItemPaneManager as any).customSectionData.options;
    return options.find((option: any) =>
      String(option.paneID).includes("linked-mindmaps-connections"),
    );
  }

  /** Selects `item` in the library pane and returns the section's body. */
  async function selectAndFindBody(item: Zotero.Item): Promise<HTMLElement> {
    await win.ZoteroPane.selectItem(item.id);
    const section = await waitFor(
      () => win.document.querySelector(SECTION_SELECTOR) as Element | null,
      "the Connections section to register in the real item pane",
    );
    return query<HTMLElement>(
      section,
      '[data-type="body"]',
      "the section's body element",
    );
  }

  it("draws its content from onRender rather than onAsyncRender", function () {
    const entry = registeredOption();
    assert.isDefined(entry, "the Connections section is not registered");
    assert.equal(entry.pluginID, config.addonID);
    assert.equal(typeof entry.onRender, "function");
    assert.isUndefined(
      entry.onAsyncRender,
      "asyncRender is skipped for a pane below the fold; content must not depend on it",
    );
  });

  it("fills the real section's body for a node item selected through ZoteroPane while the section sits below the fold", async function () {
    const mindmap = await createMindmap("Live section check");
    await addToMindmap([article], mindmap.id);

    const body = await selectAndFindBody(article);
    await waitFor(
      () => body.querySelector(".mindmap-current"),
      "the section body to show the item's mindmap membership",
    );

    const section = body.closest("item-pane-custom-section") as HTMLElement;
    const itemDetails = win.ZoteroPane.itemPane._itemDetails;
    assert.isFalse(
      itemDetails.isPaneVisible(section.dataset.pane),
      "this only proves the render path has no visibility gate if the " +
        "section is actually below the fold; if the item pane grew tall " +
        "enough to always show it, widen the test window",
    );
  });

  it("shows the empty state through the same real path for an item in no mindmap", async function () {
    const body = await selectAndFindBody(article);
    await waitFor(
      () => body.querySelector(".mindmap-empty"),
      "the empty state to render for an item in no mindmap",
    );
  });
});

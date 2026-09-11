import { assert } from "chai";
import { config } from "../../package.json";
import {
  createMindmap,
  readMindmapDocument,
  updateMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { addToMindmap } from "../../src/modules/mindmap/libraryContextMenu";
import {
  closeMindmapTab,
  openMindmapTab,
} from "../../src/modules/mindmap/mindmapTab";
import { createMemberNode, refFor } from "../../src/modules/mindmap/mutations";
import { getLocaleID } from "../../src/utils/locale";
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

  describe("re-rendering on a storage write", function () {
    const LIBRARY_TAB = "zotero-pane";
    const ADD_TO_MINDMAP_MENUITEM =
      "#zotero-linked-mindmaps-itemmenu-add-to-mindmap";

    /**
     * The plugin's own write path, not this bundle's copy of it: the
     * menuitem ztoolkit registered carries the plugin's addToMindmap, which
     * writes through the plugin's storage queue and so reaches the listener
     * the registered section subscribed. A write made through this bundle's
     * storage import would emit on a different listener set and prove
     * nothing about the live section.
     */
    function addSelectionToMindmapThroughMenu(): void {
      const menuitem = query(
        win.document,
        ADD_TO_MINDMAP_MENUITEM,
        "the plugin's Add to Mindmap menuitem",
      );
      menuitem.dispatchEvent(new win.Event("command"));
    }

    async function selectAndAwaitEmptyState(
      item: Zotero.Item,
    ): Promise<HTMLElement> {
      const body = await selectAndFindBody(item);
      await waitFor(
        () => body.querySelector(".mindmap-empty"),
        "the initial empty-state render",
      );
      return body;
    }

    before(function () {
      const instance = (Zotero as any)[config.addonInstance];
      (globalThis as any).addon = instance;
      // openMindmapTab reaches Zotero_Tabs through the plugin's own ztoolkit,
      // which the test bundle has no copy of.
      (globalThis as any).ztoolkit = instance.data.ztoolkit;
    });

    afterEach(function () {
      closeMindmapTab();
      win.Zotero_Tabs.select(LIBRARY_TAB);
    });

    it("registers onInit and onDestroy, so a refresh is per section instance", function () {
      const entry = registeredOption();
      assert.equal(typeof entry.onInit, "function");
      assert.equal(typeof entry.onDestroy, "function");
    });

    it("re-renders in place after a write from the library context menu, without any selection change (AC #1, #2, #3)", async function () {
      await createMindmap("Written to from outside the panel");
      const body = await selectAndAwaitEmptyState(article);

      addSelectionToMindmapThroughMenu();

      await waitFor(
        () => body.querySelector(".mindmap-current"),
        "the section to refresh in place after the write",
      );
      assert.isNull(
        body.querySelector(
          `[data-l10n-id="${getLocaleID("item-mindmaps-empty-state")}"]`,
        ),
        "the not-in-a-mindmap state survived the refresh",
      );
      assert.deepEqual(
        win.ZoteroPane.getSelectedItems().map((i: any) => i.id),
        [article.id],
        "the selection changed",
      );
    });

    // The defect as reported: the write happens from the mindmap tab, which
    // is a Zotero_Tabs tab like any reader or note tab, so the library pane's
    // item-details has skipRender set while it lands. refresh() alone marks
    // the section pending and nothing else; without also arming the
    // item-details' own _pendingRender, reselecting the library tab renders
    // nothing and this spec times out still showing the link.
    //
    // The write here is the plugin's deletion cleanup pruning the far end of
    // a link, not the graph's own add-link: ZoteroPane.getSelectedItems()
    // answers nothing while a custom tab is selected, so the context-menu
    // write is unreachable from the mindmap tab, and the tab this bundle
    // opens runs its own copy of the graph controller, whose writes never
    // reach the plugin's listeners. The lever under test (the write landing
    // while the library pane is suppressed) is the same either way.
    it("shows the change once the library tab is reselected after a write made while the mindmap tab was selected (AC #1)", async function () {
      const other = new Zotero.Item("journalArticle");
      other.libraryID = Zotero.Libraries.userLibraryID;
      other.setField("title", "Linked, then erased");
      await other.saveTx({ skipSelect: true });
      const mindmap = await createMindmap("Written to from the mindmap tab");
      await updateMindmapDocument(
        (doc) => {
          const here = createMemberNode(refFor(article));
          const there = createMemberNode(refFor(other));
          doc.nodes.push(here, there);
          doc.links.push({
            id: "live-link",
            typeId: "related-to",
            sourceNodeId: here.id,
            targetNodeId: there.id,
          });
          return doc;
        },
        mindmap.id,
        article.libraryID,
      );
      const body = await selectAndFindBody(article);
      await waitFor(
        () => body.querySelector(".mindmap-link-row"),
        "the initial render to list the link",
      );

      await openMindmapTab();
      await waitFor(
        () => (win.Zotero_Tabs.selectedID !== LIBRARY_TAB ? true : null),
        "the mindmap tab to become the selected tab",
      );
      await other.eraseTx();
      // Wait for the write itself, so the reselection below is what turns it
      // into a render rather than the write racing the tab switch.
      await waitFor(async () => {
        const doc = await readMindmapDocument(mindmap.id, article.libraryID);
        return doc.links.length === 0 ? true : null;
      }, "the plugin's prune to land while the mindmap tab is selected");
      assert.isNotNull(
        body.querySelector(".mindmap-link-row"),
        "the library pane rendered while its tab was not selected",
      );

      win.Zotero_Tabs.select(LIBRARY_TAB);
      // Both conditions at once: the render clears the body before its read
      // returns, so the link row being gone on its own could be that gap.
      await waitFor(
        () =>
          body.querySelector(".mindmap-current") &&
          !body.querySelector(".mindmap-link-row")
            ? true
            : null,
        "the section to drop the pruned link once the library tab is back",
      );
    });

    it("does not re-render for a write landing in a different library (AC #5)", async function () {
      const group = new Zotero.Group();
      Object.assign(group as unknown as Record<string, unknown>, {
        id: 987002,
        name: "Connections live test group",
        description: "",
        version: 1,
        editable: true,
        filesEditable: true,
      });
      await group.saveTx();
      const theirs = new Zotero.Item("journalArticle");
      theirs.libraryID = group.libraryID;
      theirs.setField("title", "In the group library");
      await theirs.saveTx({ skipSelect: true });
      try {
        const elsewhere = await createMindmap(
          "Elsewhere",
          undefined,
          group.libraryID,
        );
        await addToMindmap([theirs], elsewhere.id);

        const body = await selectAndAwaitEmptyState(article);
        const canary = win.document.createElement("div");
        canary.className = "test-canary";
        body.appendChild(canary);

        // Erasing a node's item makes the plugin's deletion cleanup prune it,
        // a write through the plugin's own queue into the group library.
        await theirs.eraseTx();
        await waitFor(async () => {
          const doc = await readMindmapDocument(elsewhere.id, group.libraryID);
          return doc.nodes.length === 0 ? true : null;
        }, "the plugin's prune to land in the group library");
        // The emit follows the save; give it a moment to have fired.
        await Zotero.Promise.delay(200);

        assert.isNotNull(
          body.querySelector(".test-canary"),
          "a write in a different library re-rendered the section",
        );
      } finally {
        await group.eraseTx();
      }
    });

    it("refreshes the library pane's own section when a note tab has opened its own copy (AC #4)", async function () {
      await createMindmap("Written to with a note tab open");
      const body = await selectAndAwaitEmptyState(article);
      const note = new Zotero.Item("note");
      note.libraryID = Zotero.Libraries.userLibraryID;
      note.setNote("unrelated note");
      await note.saveTx({ skipSelect: true });
      try {
        await Zotero.Notes.open(note.id, undefined, { openInWindow: false });
        await waitFor(
          () =>
            win.document.querySelectorAll(SECTION_SELECTOR).length >= 2
              ? true
              : null,
          "the note tab's own Connections section to register",
        );
        win.Zotero_Tabs.select(LIBRARY_TAB);

        addSelectionToMindmapThroughMenu();

        await waitFor(
          () => body.querySelector(".mindmap-current"),
          "the library pane's own section to refresh, not only the note tab's copy",
        );
      } finally {
        const tabID = win.Zotero_Tabs.getTabIDByItemID(note.id);
        if (tabID) {
          win.Zotero_Tabs.close(tabID);
        }
        await note.eraseTx();
      }
    });
  });
});

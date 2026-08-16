import { assert } from "chai";
import { config } from "../../package.json";
import { getString } from "../../src/utils/locale";
import {
  closeMindmapTab,
  openMindmapTab,
} from "../../src/modules/mindmap/mindmapTab";
import { createMindmap } from "../../src/modules/mindmap/storage";
import { clearStorageNotes } from "./storageNotes";

/**
 * The real tab, opened the way the menu item and the shortcut open it, rather
 * than a controller over three loose divs. This is where a string that only
 * resolves through the window's own l10n context, or a layout that only holds
 * together against detached elements, actually shows up.
 */
describe("mindmap/mindmapTab live tab", function () {
  const SIDEBAR = "#zoterolinkedmindmaps-mindmap-sidebar";
  const GRAPH = "#zoterolinkedmindmaps-mindmap-container";
  const DOCK = "#zoterolinkedmindmaps-mindmap-connections-dock";

  function mainDocument(): Document {
    return Zotero.getMainWindow().document;
  }

  before(function () {
    const instance = (Zotero as any)[config.addonInstance];
    (globalThis as any).addon = instance;
    // openMindmapTab reaches Zotero_Tabs through the plugin's own ztoolkit,
    // which the test bundle has no copy of.
    (globalThis as any).ztoolkit = instance.data.ztoolkit;
  });

  afterEach(async function () {
    this.timeout(30000);
    closeMindmapTab();
    await Zotero.Promise.delay(200);
    await clearStorageNotes();
  });

  it("renders translated text, not raw Fluent ids", async function () {
    this.timeout(30000);
    await createMindmap("Live tab check", "opened for real");

    await openMindmapTab();
    await Zotero.Promise.delay(1000);

    const sidebar = mainDocument().querySelector(SIDEBAR);
    assert.isNotNull(sidebar, "the tab did not build a sidebar");
    const text = sidebar!.textContent ?? "";
    assert.include(text, getString("mindmap-sidebar-heading"));
    assert.include(text, getString("mindmap-new-button"));
    assert.include(text, getString("mindmap-edit-button"));
    assert.include(text, getString("mindmap-delete-button"));
    assert.include(text, "Live tab check");
    // The bug this guards: every getString key rendered as its own prefixed
    // id, because initLocale loaded only addon.ftl.
    assert.notInclude(text, `${config.addonRef}-`);
  });

  it("titles the tab from the locale rather than an id", async function () {
    this.timeout(30000);
    await openMindmapTab();
    await Zotero.Promise.delay(1000);

    const tab = (Zotero.getMainWindow() as any).Zotero_Tabs._tabs.find(
      (entry: { type: string }) =>
        entry.type === "zoterolinkedmindmaps-mindmap",
    );
    assert.isDefined(tab);
    assert.equal(tab.title, getString("mindmap-tab-title"));
  });

  it("lays the tab out as sidebar, graph and dock in one row", async function () {
    this.timeout(30000);
    await openMindmapTab();
    await Zotero.Promise.delay(1000);

    const doc = mainDocument();
    const sidebar = doc.querySelector(SIDEBAR);
    const graph = doc.querySelector(GRAPH);
    const dock = doc.querySelector(DOCK);
    assert.isNotNull(sidebar);
    assert.isNotNull(graph);
    assert.isNotNull(dock);
    // Siblings in the order they are read in, left to right.
    assert.equal(sidebar!.nextElementSibling, graph);
    assert.equal(graph!.nextElementSibling, dock);
    // The header the sidebar replaced.
    assert.isNull(doc.querySelector("#zoterolinkedmindmaps-mindmap-toolbar"));
    // The graph has to end up with real width, or Cytoscape piles every node
    // on the origin.
    assert.isAbove((graph as HTMLElement).getBoundingClientRect().width, 0);
  });
});

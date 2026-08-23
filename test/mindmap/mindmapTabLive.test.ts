import { assert } from "chai";
import { config } from "../../package.json";
import { getString } from "../../src/utils/locale";
import {
  closeMindmapTab,
  openMindmapTab,
} from "../../src/modules/mindmap/mindmapTab";
import { createMindmap } from "../../src/modules/mindmap/storage";
import { clearStorageNotes } from "./storageNotes";
import { waitFor } from "../waitFor";

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

  /** Opens the tab and hands back its sidebar once the tab has built one. */
  async function openTab(): Promise<Element> {
    await openMindmapTab();
    return waitFor(
      () => mainDocument().querySelector(SIDEBAR),
      "the tab's sidebar",
    );
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
    await waitFor(
      () => mainDocument().querySelector(SIDEBAR) === null || null,
      "the tab to close",
    );
    Zotero.Prefs.clear(`${config.prefsPrefix}.sidebarCollapsed`, true);
    await clearStorageNotes();
  });

  it("renders translated text, not raw Fluent ids", async function () {
    this.timeout(30000);
    await createMindmap("Live tab check", "opened for real");

    const sidebar = await openTab();
    // Fluent translates after the elements are in the document, so the
    // heading is the last thing to arrive and the one worth waiting on.
    await waitFor(
      () =>
        sidebar.textContent?.includes(getString("mindmap-sidebar-heading")) ||
        null,
      "Fluent to translate the sidebar",
    );

    const text = sidebar.textContent ?? "";
    assert.include(text, "Live tab check");
    // Edit, Delete and the header's plus control are icon-only, translated
    // through their title attribute rather than through visible text - the
    // bug this guards against would show up there instead of in textContent.
    const editButton = sidebar.querySelector(".mindmap-sidebar-edit");
    const deleteButton = sidebar.querySelector(".mindmap-sidebar-delete");
    const newButton = sidebar.querySelector(
      "#zoterolinkedmindmaps-mindmap-new",
    );
    assert.isNotNull(editButton);
    assert.isNotNull(deleteButton);
    assert.isNotNull(newButton);
    for (const button of [editButton, newButton, deleteButton]) {
      const l10nId = button!.getAttribute("data-l10n-id") ?? "";
      assert.isNotEmpty(l10nId);
    }
    // The bug this guards: every getString key rendered as its own prefixed
    // id, because initLocale loaded only addon.ftl.
    assert.notInclude(text, `${config.addonRef}-`);
  });

  it("titles the tab from the locale rather than an id", async function () {
    this.timeout(30000);
    await openTab();

    const tab = (Zotero.getMainWindow() as any).Zotero_Tabs._tabs.find(
      (entry: { type: string }) =>
        entry.type === "zoterolinkedmindmaps-mindmap",
    );
    assert.isDefined(tab);
    assert.equal(tab.title, getString("mindmap-tab-title"));
  });

  it("lays the tab out as sidebar, graph and dock in one row", async function () {
    this.timeout(30000);
    const sidebar = await openTab();
    const doc = mainDocument();
    // Laid out, not merely present: the width assertion below is the point of
    // the test, and it reads zero until the row has been through layout.
    const graph = await waitFor(() => {
      const found = doc.querySelector(GRAPH) as HTMLElement | null;
      return found?.getBoundingClientRect().width ? found : null;
    }, "the graph area to be laid out");
    const dock = doc.querySelector(DOCK);
    assert.isNotNull(dock);
    // Siblings in the order they are read in, left to right.
    assert.equal(sidebar.nextElementSibling, graph);
    assert.equal(graph.nextElementSibling, dock);
    // The header the sidebar replaced.
    assert.isNull(doc.querySelector("#zoterolinkedmindmaps-mindmap-toolbar"));
    // The graph has to end up with real width, or Cytoscape piles every node
    // on the origin.
    assert.isAbove(graph.getBoundingClientRect().width, 0);
  });

  /**
   * The dock rendered off the right edge of the tab: the graph would not
   * shrink, so the row overflowed and the panel was drawn where it could not
   * be seen. Clicking a node looked like it did nothing at all.
   */
  it("opens the dock inside the tab rather than off its right edge", async function () {
    this.timeout(30000);
    await openTab();

    const doc = mainDocument();
    const dock = doc.querySelector(DOCK) as HTMLElement;
    const graph = doc.querySelector(GRAPH) as HTMLElement;
    const row = dock.parentElement!;
    dock.style.display = "";
    await waitFor(
      () => dock.getBoundingClientRect().width || null,
      "the dock to take up width",
    );

    const rowRect = row.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    assert.isAbove(dockRect.width, 0, "the dock has no width");
    assert.isAtMost(
      Math.round(dockRect.right),
      Math.round(rowRect.right) + 1,
      "the dock hangs off the right edge of the tab",
    );
    assert.isAtLeast(
      Math.round(dockRect.left),
      Math.round(rowRect.left),
      "the dock starts outside the tab",
    );
    // The graph gave the width up rather than the dock being squeezed out.
    assert.isAbove(graph.getBoundingClientRect().width, 0);
  });

  it("gives the graph the width back when the sidebar collapses", async function () {
    this.timeout(30000);
    await openTab();

    const doc = mainDocument();
    const graph = doc.querySelector(GRAPH) as HTMLElement;
    const before = await waitFor(
      () => graph.getBoundingClientRect().width || null,
      "the graph area to be laid out",
    );

    (
      doc.querySelector(
        "#zoterolinkedmindmaps-mindmap-sidebar-toggle",
      ) as HTMLButtonElement
    ).click();
    await waitFor(
      () => graph.getBoundingClientRect().width > before || null,
      "the graph to take the collapsed sidebar's width",
    );

    assert.isAbove(graph.getBoundingClientRect().width, before);
  });
});

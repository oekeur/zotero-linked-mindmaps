import { assert } from "chai";
import { config } from "../../package.json";
import {
  closeMindmapTab,
  openMindmapTab,
} from "../../src/modules/mindmap/mindmapTab";
import { removeMainWindowFTL } from "../../src/modules/mindmap/mainWindowFTL";
import { clearStorageNotes } from "./storageNotes";

/**
 * mainWindow.ftl's link in the main window. Left linked after the plugin shut
 * down, it made every Fluent translation in the window reject, and with it
 * Zotero's item context menu. Inserted through insertFTLIfNeeded after the tab
 * had shimmed a <head>, it landed there, as a second link for the same file
 * beside the original in <linkset>.
 *
 * removeMainWindowFTL is the function onShutdown runs per window; calling
 * onShutdown itself would shut the plugin down under the rest of the suite.
 */
describe("mindmap/mainWindowFTL", function () {
  this.timeout(30000);

  let win: any;
  let instance: any;

  before(function () {
    instance = (Zotero as any)[config.addonInstance];
    (globalThis as any).addon = instance;
    (globalThis as any).ztoolkit = instance.data.ztoolkit;
    win = Zotero.getMainWindows()[0];
  });

  after(async function () {
    closeMindmapTab();
    await clearStorageNotes();
    // Whatever a failed spec left, put the window back the way startup does.
    await instance.hooks.onMainWindowLoad(win);
  });

  function links(): Element[] {
    const href = `${config.addonRef}-mainWindow.ftl`;
    return Array.from(
      win.document.querySelectorAll('link[rel="localization"]'),
    ).filter((link: any) => link.getAttribute("href") === href) as Element[];
  }

  it("is linked once, into <linkset>, with the tab open and the load hook run again", async function () {
    await openMindmapTab();
    assert.ok(win.document.head, "positive control: the tab shims a <head>");

    await instance.hooks.onMainWindowLoad(win);

    const found = links();
    assert.lengthOf(found, 1, "the window does not hold exactly one link");
    assert.equal(found[0].parentElement?.localName, "linkset");
  });

  it("is unlinked by the shutdown removal", function () {
    assert.lengthOf(links(), 1, "positive control: linked at start");

    removeMainWindowFTL(win.document);
    assert.lengthOf(links(), 0, "a link survived the removal");
  });

  it("is linked once again, and resolvable, by the next load", async function () {
    assert.lengthOf(links(), 0, "positive control: unlinked at start");

    await instance.hooks.onMainWindowLoad(win);
    assert.lengthOf(links(), 1, "the next load did not link it exactly once");

    const [message] = await win.document.l10n.formatMessages([
      { id: "zoterolinkedmindmaps-menu-tools-mindmap" },
    ]);
    assert.ok(
      message?.attributes?.find((attr: any) => attr.name === "label")?.value,
      "zoterolinkedmindmaps-menu-tools-mindmap does not resolve",
    );
  });
});

import { assert } from "chai";
import {
  createMindmap,
  findAllMindmapNotes,
  findContainers,
} from "../../src/modules/mindmap/storage";
import {
  registerLibraryFilter,
  unregisterLibraryFilter,
} from "../../src/modules/mindmap/libraryFilter";
import { clearPref, getPref, setPref } from "../../src/utils/prefs";
import { clearStorageNotes } from "./storageNotes";

const CONTAINER_TAG = "_zoterolinkedmindmaps-container-v1";

// The row a library view builds its item list from. Constructed directly
// rather than read off ZoteroPane, so the assertions are about the search the
// patch produces rather than about whatever the open window happens to show.
function libraryRow(): Zotero.CollectionTreeRow {
  const CollectionTreeRow = (
    Zotero as unknown as { CollectionTreeRow: new (...args: any[]) => any }
  ).CollectionTreeRow;
  return new CollectionTreeRow(
    null,
    "library",
    Zotero.Libraries.userLibrary,
    0,
    true,
  ) as Zotero.CollectionTreeRow;
}

// Both ids, because a library row's search matches child items as well: the
// item tree draws a parent row for any match whose parent is missing, so
// hiding the container means hiding its notes too.
async function libraryItemIDs(options?: {
  unfiltered: boolean;
}): Promise<number[]> {
  const search = await libraryRow().getSearchObject(options);
  return search.search();
}

// The plugin registers the patch at startup and this file leaves that
// registration alone: calling registerLibraryFilter() from here would stack a
// second wrapper on top of the plugin's, since the test bundle holds its own
// copy of the module's state.
describe("mindmap/libraryFilter", function () {
  let containerID: number;
  let noteID: number;

  beforeEach(async function () {
    await clearStorageNotes();
    await createMindmap("Filtered");
    containerID = (await findContainers())[0].id;
    noteID = (await findAllMindmapNotes())[0].id;
  });

  afterEach(async function () {
    clearPref("hideMindmapNotes");
    await clearStorageNotes();
  });

  it("defaults to hiding the container, with no UI interaction (AC #2)", function () {
    clearPref("hideMindmapNotes");
    assert.isTrue(getPref("hideMindmapNotes"));
  });

  it("drops the container and its notes from the library view while the pref is on (AC #1)", async function () {
    setPref("hideMindmapNotes", true);

    const ids = await libraryItemIDs();

    assert.notInclude(ids, containerID);
    assert.notInclude(ids, noteID);
  });

  it("brings the container back when the pref is turned off (AC #3)", async function () {
    setPref("hideMindmapNotes", false);

    assert.include(await libraryItemIDs(), containerID);
  });

  it("leaves the unfiltered search alone, so the container stays reachable", async function () {
    setPref("hideMindmapNotes", true);

    assert.include(await libraryItemIDs({ unfiltered: true }), containerID);
  });

  it("keeps the view rendering when the wrap throws, with the row visible (AC #4)", async function () {
    setPref("hideMindmapNotes", true);
    const originalAddCondition = Zotero.Search.prototype.addCondition;
    // Break the one call the wrap makes on the search it builds - the failure
    // mode a Zotero change would produce - and check the result degrades to
    // the unwrapped search rather than throwing out of getSearchObject.
    (Zotero.Search.prototype as any).addCondition = function (
      ...args: unknown[]
    ) {
      if (args[2] === CONTAINER_TAG) {
        throw new Error("simulated Zotero change");
      }
      return (originalAddCondition as any).apply(this, args);
    };

    try {
      assert.include(await libraryItemIDs(), containerID);
    } finally {
      (Zotero.Search.prototype as any).addCondition = originalAddCondition;
    }
  });

  // Hot reload depends on this: a patch left in place is what the next load
  // wraps, so the previous closure ends up calling through to itself.
  it("puts back the exact method it replaced on unregister", function () {
    const proto = (
      Zotero as unknown as { CollectionTreeRow: { prototype: any } }
    ).CollectionTreeRow.prototype;
    const before = proto.getSearchObject;

    registerLibraryFilter();
    assert.notStrictEqual(proto.getSearchObject, before);

    unregisterLibraryFilter();
    assert.strictEqual(proto.getSearchObject, before);
  });
});

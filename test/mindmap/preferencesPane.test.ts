import { assert } from "chai";
import { config } from "../../package.json";
import {
  getLinkTypes,
  setLinkTypes,
  type LinkType,
} from "../../src/modules/mindmap/linkTypes";

const PANE_ID = "zoterolinkedmindmaps-link-types-pane";

describe("mindmap preferences pane", function () {
  let win: Window;
  let root: Element;
  let originalTypes: LinkType[];

  before(async function () {
    const opened = Zotero.Utilities.Internal.openPreferences(PANE_ID);
    assert.isNotNull(opened);
    win = opened!;
    await Zotero.Promise.delay(500);
    const found = win.document.querySelector(
      ".zoterolinkedmindmaps-link-types-container",
    );
    assert.isNotNull(found);
    root = found!;
  });

  after(function () {
    win?.close();
  });

  // The preferences window (and its already-loaded pane) is a singleton
  // that Zotero reuses across openPreferences() calls, so re-render
  // explicitly through the same entry point the pane's onload uses,
  // rather than relying on a fresh onload firing per test.
  function rerender(): void {
    (Zotero as any)[config.addonInstance].hooks.onPrefsEvent(
      "link-types-pane-load",
      { container: root },
    );
  }

  beforeEach(function () {
    originalTypes = getLinkTypes();
  });

  afterEach(function () {
    setLinkTypes(originalTypes);
    rerender();
  });

  it("resolves the pane's group headings through Fluent, not raw locale ids", function () {
    const linkTypesHeading = win.document.getElementById(
      "zoterolinkedmindmaps-link-types-heading",
    );
    const libraryHeading = win.document.getElementById(
      "zoterolinkedmindmaps-library-heading",
    );
    assert.isNotNull(linkTypesHeading);
    assert.isNotNull(libraryHeading);
    assert.notInclude(
      linkTypesHeading!.textContent ?? "",
      "zoterolinkedmindmaps-",
    );
    assert.notInclude(
      libraryHeading!.textContent ?? "",
      "zoterolinkedmindmaps-",
    );
  });

  it("renders add, edit and remove controls in the list's own footer", function () {
    rerender();
    const footer = root.querySelector(".zoterolinkedmindmaps-type-footer");
    assert.isNotNull(footer);
    assert.isNotNull(footer!.querySelector(".zoterolinkedmindmaps-type-add"));
    assert.isNotNull(footer!.querySelector(".zoterolinkedmindmaps-type-edit"));
    assert.isNotNull(
      footer!.querySelector(".zoterolinkedmindmaps-type-remove"),
    );
  });

  it("disables edit and remove until a row is selected, and enables them on click", function () {
    setLinkTypes([{ id: "test-type", label: "test type", directional: true }]);
    rerender();
    const editButton = root.querySelector(
      ".zoterolinkedmindmaps-type-edit",
    ) as HTMLButtonElement;
    const removeButton = root.querySelector(
      ".zoterolinkedmindmaps-type-remove",
    ) as HTMLButtonElement;
    assert.isTrue(editButton.disabled);
    assert.isTrue(removeButton.disabled);

    const row = root.querySelector(
      ".zoterolinkedmindmaps-type-row",
    ) as HTMLElement;
    row.click();

    const rerenderedEdit = root.querySelector(
      ".zoterolinkedmindmaps-type-edit",
    ) as HTMLButtonElement;
    const rerenderedRemove = root.querySelector(
      ".zoterolinkedmindmaps-type-remove",
    ) as HTMLButtonElement;
    const rerenderedRow = root.querySelector(".zoterolinkedmindmaps-type-row");
    assert.isFalse(rerenderedEdit.disabled);
    assert.isFalse(rerenderedRemove.disabled);
    assert.isTrue(rerenderedRow!.classList.contains("selected"));
  });

  it("shows the line the graph draws for a type beside its label", function () {
    setLinkTypes([
      { id: "directional-type", label: "directional type", directional: true },
      { id: "undirected-type", label: "undirected type", directional: false },
    ]);
    rerender();
    const rows = root.querySelectorAll(".zoterolinkedmindmaps-type-row");
    assert.equal(rows.length, 2);
    for (const row of Array.from(rows)) {
      assert.include(row.textContent ?? "", "type");
      assert.isNotNull(
        row.querySelector(".zoterolinkedmindmaps-type-line svg"),
      );
      assert.isNotNull(
        row.querySelector(".zoterolinkedmindmaps-type-line-label"),
      );
    }
  });

  it("adds a new type through the inline form", function () {
    setLinkTypes([]);
    rerender();
    (
      root.querySelector(".zoterolinkedmindmaps-type-add") as HTMLButtonElement
    ).click();

    const labelInput = root.querySelector(
      "input[type=text]",
    ) as HTMLInputElement;
    assert.isNotNull(labelInput);
    labelInput.value = "new type";
    (
      root.querySelector(".zoterolinkedmindmaps-type-save") as HTMLButtonElement
    ).click();

    const types = getLinkTypes();
    assert.equal(types.length, 1);
    assert.equal(types[0].label, "new type");
  });

  it("deletes a type immediately when no links use it", async function () {
    setLinkTypes([
      { id: "unused-type", label: "unused type", directional: true },
    ]);
    rerender();
    const row = root.querySelector(
      ".zoterolinkedmindmaps-type-row",
    ) as HTMLElement;
    row.click();
    (
      root.querySelector(
        ".zoterolinkedmindmaps-type-remove",
      ) as HTMLButtonElement
    ).click();
    await Zotero.Promise.delay(500);

    assert.equal(getLinkTypes().length, 0);
  });
});

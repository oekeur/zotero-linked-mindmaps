import { assert } from "chai";
import { config } from "../../package.json";
import {
  getLinkTypes,
  setLinkTypes,
  type LinkType,
} from "../../src/modules/mindmap/linkTypes";

const PANE_ID = "zoterolinkedmindmaps-link-types-pane";

function buttonWithText(root: Element, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text,
  );
  assert.isDefined(button, `expected a button labeled "${text}"`);
  return button as HTMLButtonElement;
}

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

  it("renders real localized heading and toolbar text, not raw locale ids", function () {
    rerender();
    const heading = root.querySelector("h2");
    assert.isNotNull(heading);
    assert.notInclude(heading!.textContent ?? "", "zoterolinkedmindmaps-");
    buttonWithText(root, "Add");
    buttonWithText(root, "Edit");
    buttonWithText(root, "Delete");
  });

  it("lists current link types with their directional flag", function () {
    setLinkTypes([{ id: "test-type", label: "test type", directional: false }]);
    rerender();
    const rows = root.querySelectorAll("tbody tr");
    assert.equal(rows.length, 1);
    assert.include(rows[0].textContent ?? "", "test type");
    assert.include(rows[0].textContent ?? "", "No");
  });

  it("adds a new type through the inline form", function () {
    setLinkTypes([]);
    rerender();
    buttonWithText(root, "Add").click();

    const labelInput = root.querySelector(
      "input[type=text]",
    ) as HTMLInputElement;
    assert.isNotNull(labelInput);
    labelInput.value = "new type";
    buttonWithText(root, "Save").click();

    const types = getLinkTypes();
    assert.equal(types.length, 1);
    assert.equal(types[0].label, "new type");
  });

  it("deletes a type immediately when no links use it", async function () {
    setLinkTypes([
      { id: "unused-type", label: "unused type", directional: true },
    ]);
    rerender();
    const row = root.querySelector("tbody tr") as HTMLElement;
    row.click();
    buttonWithText(root, "Delete").click();
    await Zotero.Promise.delay(500);

    assert.equal(getLinkTypes().length, 0);
  });
});

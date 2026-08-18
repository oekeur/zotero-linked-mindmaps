import { assert } from "chai";
import { config } from "../../package.json";
import {
  ADD_LINK_DIALOG_CONTENT_ID,
  CANCEL_BUTTON_CLASS,
  DIALOG_CONTEXT_CLASS,
  openAddLinkDialog,
} from "../../src/modules/mindmap/addLinkForm";
import { clearStorageNotes } from "./storageNotes";

/**
 * The standalone "Add link" window, opened the way the library context menu
 * opens it. Its own window means its own Fluent context and its own sizing,
 * neither of which the item-pane surfaces exercise.
 *
 * Each check is its own test: the scaffold's mocha reporter prints neither the
 * assertion message nor its values, so the test name is the only thing that
 * says what broke.
 */
describe("mindmap/addLinkForm standalone dialog", function () {
  const CONTENT_ID = ADD_LINK_DIALOG_CONTENT_ID;

  let item: Zotero.Item;

  /**
   * nsIWindowWatcher, not nsIWindowMediator: the mediator only tracks windows
   * carrying a windowtype, and the dialog's about:blank root has none.
   */
  function dialogWindows(): Window[] {
    const found: Window[] = [];
    const enumerator = Services.ww.getWindowEnumerator();
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext() as unknown as Window;
      try {
        if (win.document?.getElementById(CONTENT_ID)) {
          found.push(win);
        }
      } catch {
        // A window whose document can't be read from here isn't ours.
      }
    }
    return found;
  }

  async function closeOpenDialogs(): Promise<void> {
    for (const win of dialogWindows()) {
      win.close();
    }
    await Zotero.Promise.delay(300);
  }

  interface OpenDialog {
    content: HTMLElement;
    win: Window;
    closed: Promise<void>;
  }

  /**
   * True once every label and button carries text. Both are what the tests
   * below assert on, and both are written by Fluent rather than by the code
   * that builds the form.
   */
  function isLocalized(content: HTMLElement): boolean {
    const filled = (el: Element) => (el.textContent?.trim() ?? "") !== "";
    const labels = Array.from(content.querySelectorAll("label"));
    const buttons = Array.from(content.querySelectorAll("button"));
    return (
      labels.length > 0 &&
      buttons.length > 0 &&
      labels.every(filled) &&
      buttons.every(filled)
    );
  }

  /**
   * Resolves once the window's height has held steady across two checks, so a
   * measurement taken afterwards is where the dialog ended up rather than a
   * frame on the way there. innerHeight rather than outerHeight: the outer
   * value lags behind on this window.
   */
  async function settled(win: Window): Promise<void> {
    let previous = -1;
    for (let i = 0; i < 40; i++) {
      const height = win.innerHeight;
      if (height === previous && height > 0) {
        return;
      }
      previous = height;
      await Zotero.Promise.delay(100);
    }
  }

  /** Opens the dialog and waits until the form inside it has been filled in. */
  async function openDialog(): Promise<OpenDialog> {
    const closed = openAddLinkDialog(Zotero.getMainWindow(), item);
    for (let i = 0; i < 150; i++) {
      await Zotero.Promise.delay(100);
      const win = dialogWindows()[0];
      const content = win?.document.getElementById(CONTENT_ID);
      if (!content?.querySelector("button")) {
        continue;
      }
      // Existing markup is not a filled-in form: Fluent applies its
      // translations asynchronously after the elements are in the document,
      // and the resize waits on that too. Wait for the condition the tests
      // actually assert on rather than for a fixed delay, which held on an
      // idle machine and lost the race under load.
      if (!isLocalized(content as HTMLElement)) {
        continue;
      }
      // Localised is not yet settled: fitDialogToContent resizes after
      // awaiting l10n.ready and a frame, so the sizing test needs the height
      // to have stopped moving, not merely the text to have arrived.
      await settled(win);
      return { content: content as HTMLElement, win, closed };
    }
    throw new Error(
      "the Add link dialog never opened, or Fluent never filled it in",
    );
  }

  beforeEach(async function () {
    this.timeout(30000);
    // A dialog left open by an interrupted run would be found before this
    // one's, and it was built by whatever code was loaded then.
    await closeOpenDialogs();
    await clearStorageNotes();
    item = new Zotero.Item("journalArticle");
    item.libraryID = Zotero.Libraries.userLibraryID;
    item.setField("title", "Add Link Dialog Test Item");
    await item.saveTx();
  });

  afterEach(async function () {
    this.timeout(30000);
    await closeOpenDialogs();
    await item.eraseTx();
    await clearStorageNotes();
  });

  // The bug these guard: the form's data-l10n-id attributes resolved against a
  // window with no plugin strings registered, so every label and every button
  // came out empty and the dialog read as broken.
  it("fills in every field label", async function () {
    this.timeout(45000);
    const { content, win, closed } = await openDialog();
    const labels = Array.from(content.querySelectorAll("label"));

    assert.isNotEmpty(labels);
    for (const label of labels) {
      assert.isNotEmpty(label.textContent?.trim() ?? "");
    }

    win.close();
    await closed;
  });

  it("fills in every button", async function () {
    this.timeout(45000);
    const { content, win, closed } = await openDialog();
    const buttons = Array.from(content.querySelectorAll("button"));

    assert.isNotEmpty(buttons);
    for (const button of buttons) {
      assert.isNotEmpty(button.textContent?.trim() ?? "");
    }

    win.close();
    await closed;
  });

  it("names the item being linked, unlike the item-pane and docked forms", async function () {
    this.timeout(45000);
    const { content, win, closed } = await openDialog();

    const context = content.querySelector(`.${DIALOG_CONTEXT_CLASS}`);
    assert.isNotNull(context);
    assert.include(context!.textContent ?? "", "Add Link Dialog Test Item");

    win.close();
    await closed;
  });

  it("gives the footer a Cancel button that closes the window", async function () {
    this.timeout(45000);
    const { content, closed } = await openDialog();

    const cancelButton = content.querySelector(
      `.${CANCEL_BUTTON_CLASS}`,
    ) as HTMLButtonElement;
    assert.isNotNull(cancelButton);
    cancelButton.click();

    await closed;
  });

  it("shows translated text rather than raw Fluent ids", async function () {
    this.timeout(45000);
    const { content, win, closed } = await openDialog();

    assert.notInclude(content.textContent ?? "", `${config.addonRef}-`);

    win.close();
    await closed;
  });

  /**
   * Whether the native dropdown actually opens can only be seen by clicking
   * it, which no test here can do. What is checkable is that the element is a
   * real HTML select carrying its options, in the namespace the item pane
   * builds them in - the form having been rendered into a chrome document
   * rather than the blank window whose selects would not open.
   */
  it("builds the type field as an HTML select carrying its options", async function () {
    this.timeout(45000);
    const { content, win, closed } = await openDialog();
    const select = content.querySelector("select") as HTMLSelectElement;

    assert.isNotNull(select);
    assert.equal(select.namespaceURI, "http://www.w3.org/1999/xhtml");
    assert.isAbove(select.options.length, 1);
    assert.isNotEmpty(select.options[0].textContent?.trim() ?? "");

    win.close();
    await closed;
  });

  it("sizes the window so the whole form is on screen", async function () {
    this.timeout(45000);
    const { content, win, closed } = await openDialog();
    const buttons = Array.from(content.querySelectorAll("button"));
    const save = buttons[buttons.length - 1];

    assert.isAtMost(
      Math.round(save.getBoundingClientRect().bottom),
      win.innerHeight,
      `form is taller than the window it opened in (inner=${win.innerHeight})`,
    );

    win.close();
    await closed;
  });
});

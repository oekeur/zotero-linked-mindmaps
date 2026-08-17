import { assert } from "chai";
import {
  MINDMAP_CHOICE_CLASS,
  renderConnectionsContent,
} from "../../src/modules/mindmap/connectionsPanel";
import {
  createMindmap,
  updateMindmapDocument,
} from "../../src/modules/mindmap/storage";
import { UNKNOWN_TYPE_LABEL } from "../../src/modules/mindmap/linkTypes";
import { createMemberNode, refFor } from "../../src/modules/mindmap/mutations";
import { addToMindmap } from "../../src/modules/mindmap/libraryContextMenu";
import { getLocaleID } from "../../src/utils/locale";
import { clearStorageNotes } from "./storageNotes";

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

  describe("choosing a target mindmap", function () {
    function addLinkButton() {
      return container.querySelector(
        `[data-l10n-id="${getLocaleID("add-link-button")}"]`,
      ) as HTMLButtonElement;
    }

    function form() {
      return container.querySelector<HTMLElement>(".mindmap-add-link-form")!;
    }

    beforeEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    afterEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    it("asks which mindmap to add to when there is more than one (AC #1)", async function () {
      this.timeout(30000);
      await createMindmap("Chapter one", "sources for ch. 1");
      await createMindmap("Methods");
      await renderConnectionsContent(container, article);

      addLinkButton().click();
      await Zotero.Promise.delay(500);

      const choice = form().querySelector(`.${MINDMAP_CHOICE_CLASS}`);
      assert.isNotNull(choice);
      const picker = choice!.querySelector("select") as HTMLSelectElement;
      assert.deepEqual(
        [...picker.options].map((option) => option.textContent),
        ["Chapter one", "Methods"],
      );
      assert.equal(picker.options[0].title, "sources for ch. 1");
      // The form itself waits for an answer.
      assert.isNull(
        form().querySelector(
          `[data-l10n-id="${getLocaleID("add-link-save-button")}"]`,
        ),
      );
    });

    it("mounts the form for the chosen mindmap once continued", async function () {
      this.timeout(30000);
      await createMindmap("Chapter one");
      const second = await createMindmap("Methods");
      await renderConnectionsContent(container, article);

      addLinkButton().click();
      await Zotero.Promise.delay(500);

      const choice = form().querySelector(`.${MINDMAP_CHOICE_CLASS}`)!;
      (choice.querySelector("select") as HTMLSelectElement).value = second.id;
      (choice.querySelector("button") as HTMLButtonElement).click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(
        form().querySelector(
          `[data-l10n-id="${getLocaleID("add-link-save-button")}"]`,
        ),
      );
    });

    it("skips the question with exactly one mindmap (AC #2)", async function () {
      this.timeout(30000);
      await createMindmap("The only one");
      await renderConnectionsContent(container, article);

      addLinkButton().click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(
        form().querySelector(
          `[data-l10n-id="${getLocaleID("add-link-save-button")}"]`,
        ),
      );
    });

    it("skips the question with no mindmap at all", async function () {
      this.timeout(30000);
      await renderConnectionsContent(container, article);

      addLinkButton().click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(
        form().querySelector(
          `[data-l10n-id="${getLocaleID("add-link-save-button")}"]`,
        ),
      );
    });

    it("skips the question for a mindmap the panel already resolved", async function () {
      this.timeout(30000);
      await createMindmap("Chapter one");
      const second = await createMindmap("Methods");
      await addToMindmap([article], second.id);

      // No id passed: the panel finds the mindmap holding the item on its own,
      // and opening the form must not ask which one that was.
      await renderConnectionsContent(container, article);
      addLinkButton().click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(
        form().querySelector(
          `[data-l10n-id="${getLocaleID("add-link-save-button")}"]`,
        ),
      );
    });

    it("skips the question when the caller already named the mindmap", async function () {
      this.timeout(30000);
      await createMindmap("Chapter one");
      const second = await createMindmap("Methods");
      await renderConnectionsContent(container, article, second.id);

      addLinkButton().click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(
        form().querySelector(
          `[data-l10n-id="${getLocaleID("add-link-save-button")}"]`,
        ),
      );
    });
  });

  describe("link labels", function () {
    beforeEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    afterEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    it("names a link whose type was deleted the same way the graph does", async function () {
      this.timeout(30000);
      const created = await createMindmap("Orphaned types");
      await updateMindmapDocument(
        (doc) => {
          const source = createMemberNode(refFor(article));
          const target = createMemberNode({
            kind: "item",
            libraryID: article.libraryID,
            key: "NOSUCH01",
          });
          doc.nodes.push(source, target);
          doc.links.push({
            id: "orphaned-link",
            typeId: "a-type-that-was-deleted",
            sourceNodeId: source.id,
            targetNodeId: target.id,
          });
          return doc;
        },
        created.id,
        article.libraryID,
      );

      await renderConnectionsContent(container, article, created.id);

      const entry = container.querySelector("li")!;
      assert.include(entry.textContent!, UNKNOWN_TYPE_LABEL);
      assert.notInclude(entry.textContent!, "a-type-that-was-deleted");
    });
  });
});

import { assert } from "chai";
import {
  MINDMAP_CHOICE_CLASS,
  renderConnectionsContent,
} from "../../src/modules/mindmap/connectionsPanel";
import { SAVE_BUTTON_CLASS } from "../../src/modules/mindmap/addLinkForm";
import {
  createMindmap,
  readMindmapDocument,
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
      assert.isNull(form().querySelector(`.${SAVE_BUTTON_CLASS}`));
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
      assert.isNotNull(form().querySelector(`.${SAVE_BUTTON_CLASS}`));
    });

    it("skips the question with exactly one mindmap (AC #2)", async function () {
      this.timeout(30000);
      await createMindmap("The only one");
      await renderConnectionsContent(container, article);

      addLinkButton().click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(form().querySelector(`.${SAVE_BUTTON_CLASS}`));
    });

    it("skips the question with no mindmap at all", async function () {
      this.timeout(30000);
      await renderConnectionsContent(container, article);

      addLinkButton().click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(form().querySelector(`.${SAVE_BUTTON_CLASS}`));
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
      assert.isNotNull(form().querySelector(`.${SAVE_BUTTON_CLASS}`));
    });

    it("skips the question when the caller already named the mindmap", async function () {
      this.timeout(30000);
      await createMindmap("Chapter one");
      const second = await createMindmap("Methods");
      await renderConnectionsContent(container, article, second.id);

      addLinkButton().click();
      await Zotero.Promise.delay(600);

      assert.isNull(form().querySelector(`.${MINDMAP_CHOICE_CLASS}`));
      assert.isNotNull(form().querySelector(`.${SAVE_BUTTON_CLASS}`));
    });
  });

  describe("the mindmap the panel is showing", function () {
    beforeEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    afterEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    it("names the mindmap as plain text when the item is only in one", async function () {
      this.timeout(30000);
      const only = await createMindmap("Chapter one");
      await addToMindmap([article], only.id);

      await renderConnectionsContent(container, article, only.id);

      assert.isNull(
        container.querySelector("select.mindmap-current-picker"),
        "a picker with nothing to pick",
      );
      assert.equal(
        container.querySelector(".mindmap-current-picker")!.textContent,
        "Chapter one",
      );
    });

    it("offers a picker over every mindmap the item is in (AC #3)", async function () {
      this.timeout(30000);
      const first = await createMindmap("Chapter one");
      const second = await createMindmap("Methods");
      await addToMindmap([article], first.id);
      await addToMindmap([article], second.id);

      await renderConnectionsContent(container, article, first.id);

      const picker = container.querySelector<HTMLSelectElement>(
        "select.mindmap-current-picker",
      )!;
      assert.isNotNull(picker, "no picker for an item in two mindmaps");
      assert.deepEqual(
        Array.from(picker.options)
          .map((option) => option.textContent)
          .sort(),
        ["Chapter one", "Methods"],
      );
      assert.equal(
        picker.value,
        first.id,
        "the picker does not show the one being displayed",
      );
    });

    it("leaves a mindmap the item is not in out of the picker", async function () {
      this.timeout(30000);
      const holding = await createMindmap("Chapter one");
      await createMindmap("Unrelated");
      await addToMindmap([article], holding.id);

      await renderConnectionsContent(container, article, holding.id);

      assert.isNull(
        container.querySelector("select.mindmap-current-picker"),
        "a mindmap the item is not a node in was offered",
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

    // The row label used to push a direction glyph next to a separator that
    // was itself an arrow, so every directional link read "cites -> -> Target"
    // and every undirected one claimed a direction it never had.
    async function renderSeededLink(
      title: string,
      seeded: {
        typeId: string;
        direction?: "forward" | "backward";
        articleIsTarget?: boolean;
        name?: string;
      },
    ): Promise<string> {
      const created = await createMindmap(title);
      await updateMindmapDocument(
        (doc) => {
          const here = createMemberNode(refFor(article));
          const other = createMemberNode({
            kind: "item",
            libraryID: article.libraryID,
            key: "NOSUCH02",
          });
          doc.nodes.push(here, other);
          doc.links.push({
            id: "seeded-link",
            typeId: seeded.typeId,
            sourceNodeId: seeded.articleIsTarget ? other.id : here.id,
            targetNodeId: seeded.articleIsTarget ? here.id : other.id,
            ...(seeded.direction ? { direction: seeded.direction } : {}),
            ...(seeded.name ? { name: seeded.name } : {}),
          });
          return doc;
        },
        created.id,
        article.libraryID,
      );

      await renderConnectionsContent(container, article, created.id);
      return container.querySelector("li")!.textContent!;
    }

    function countArrows(label: string): number {
      return (label.match(/[\u2192\u2190]/g) ?? []).length;
    }

    it("draws one arrow, pointing away, on a forward link this item sources", async function () {
      this.timeout(30000);
      const label = await renderSeededLink("Forward from here", {
        typeId: "cites",
        direction: "forward",
      });

      assert.equal(countArrows(label), 1, `two arrows in "${label}"`);
      assert.include(label, "\u2192");
    });

    it("draws one arrow, pointing back, on a forward link this item targets", async function () {
      this.timeout(30000);
      const label = await renderSeededLink("Forward to here", {
        typeId: "cites",
        direction: "forward",
        articleIsTarget: true,
      });

      assert.equal(countArrows(label), 1, `two arrows in "${label}"`);
      assert.include(label, "\u2190");
    });

    it("keeps a freeform name beside the type, still with one arrow", async function () {
      this.timeout(30000);
      const label = await renderSeededLink("Named link", {
        typeId: "cites",
        direction: "forward",
        name: "see p.12",
      });

      // Same shape the graph uses for a named link, so one relation does not
      // read two ways depending on the surface.
      assert.include(label, "cites: see p.12");
      assert.equal(countArrows(label), 1, `two arrows in "${label}"`);
    });

    it("carries the type's own line style in the row's chip", async function () {
      this.timeout(30000);
      await renderSeededLink("Chip style", {
        typeId: "cites",
        direction: "forward",
      });

      const chip = container.querySelector(".mindmap-link-type")!;
      const line = chip.querySelector("svg path")!;
      assert.isNotNull(line, "the chip draws no line at all");
      assert.isNotNull(
        line.getAttribute("stroke-dasharray"),
        "a directional type should draw the dashed line the graph draws",
      );
      assert.isNotNull(
        chip.querySelector('svg path[fill="currentColor"]'),
        "a directional type should carry an arrowhead",
      );
    });

    it("draws an undirected type as a solid line with no arrowhead", async function () {
      this.timeout(30000);
      await renderSeededLink("Undirected chip", { typeId: "related-to" });

      const chip = container.querySelector(".mindmap-link-type")!;
      const line = chip.querySelector("svg path")!;
      assert.isNull(
        line.getAttribute("stroke-dasharray"),
        "an undirected type should draw a solid line",
      );
      assert.isNull(
        chip.querySelector('svg path[fill="currentColor"]'),
        "an undirected type should carry no arrowhead",
      );
    });

    it("puts the remove control at a fixed right edge, after the target", async function () {
      this.timeout(30000);
      await renderSeededLink("Row order", { typeId: "related-to" });

      const row = container.querySelector(".mindmap-link-row")!;
      const children = Array.from(row.children).map((el) => el.className);
      assert.deepEqual(children, [
        "mindmap-link-type",
        "mindmap-link-arrow",
        "mindmap-link-target",
        "mindmap-icon-button mindmap-link-edit",
        "mindmap-icon-button mindmap-link-remove",
      ]);
    });

    it("draws no arrow on an undirected link", async function () {
      this.timeout(30000);
      const label = await renderSeededLink("Undirected", {
        typeId: "related-to",
      });

      assert.equal(countArrows(label), 0, `an arrow in "${label}"`);
      assert.include(label, "related to");
    });
  });

  describe("editing a link", function () {
    beforeEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    afterEach(async function () {
      this.timeout(30000);
      await clearStorageNotes();
    });

    async function seedDirectionalLink(): Promise<{
      mindmapId: string;
      linkId: string;
    }> {
      const created = await createMindmap("Editable");
      const here = createMemberNode(refFor(article));
      const other = createMemberNode({
        kind: "item",
        libraryID: article.libraryID,
        key: "NOSUCH03",
      });
      await updateMindmapDocument(
        (doc) => {
          doc.nodes.push(here, other);
          doc.links.push({
            id: "edit-me",
            typeId: "cites",
            sourceNodeId: here.id,
            targetNodeId: other.id,
            direction: "forward",
          });
          return doc;
        },
        created.id,
        article.libraryID,
      );
      return { mindmapId: created.id, linkId: "edit-me" };
    }

    it("opens prefilled from the existing link with Save already enabled (AC #1, #2)", async function () {
      this.timeout(30000);
      const { mindmapId } = await seedDirectionalLink();
      await renderConnectionsContent(container, article, mindmapId);

      (
        container.querySelector(".mindmap-link-edit") as HTMLButtonElement
      ).click();
      await Zotero.Promise.delay(300);

      const typeSelect = container.querySelector("select") as HTMLSelectElement;
      assert.equal(typeSelect.value, "cites");
      const save = container.querySelector(
        `.${SAVE_BUTTON_CLASS}`,
      ) as HTMLButtonElement;
      assert.isNotNull(save);
      assert.isFalse(save.disabled);
    });

    it("updates the link in place and clears direction when retyped to a non-directional type (AC #3)", async function () {
      this.timeout(30000);
      const { mindmapId, linkId } = await seedDirectionalLink();
      await renderConnectionsContent(container, article, mindmapId);

      (
        container.querySelector(".mindmap-link-edit") as HTMLButtonElement
      ).click();
      await Zotero.Promise.delay(300);

      const typeSelect = container.querySelector("select") as HTMLSelectElement;
      typeSelect.value = "related-to";
      typeSelect.dispatchEvent(new Event("change"));
      (
        container.querySelector(`.${SAVE_BUTTON_CLASS}`) as HTMLButtonElement
      ).click();
      await Zotero.Promise.delay(600);

      const doc = await readMindmapDocument(mindmapId, article.libraryID);
      assert.lengthOf(doc.links, 1, "editing must not create a duplicate link");
      assert.equal(doc.links[0].id, linkId);
      assert.equal(doc.links[0].typeId, "related-to");
      assert.notProperty(doc.links[0], "direction");

      const row = container.querySelector(".mindmap-link-row")!;
      assert.notInclude(row.textContent!, "→");
    });

    it("closes without changing the link when cancelled", async function () {
      this.timeout(30000);
      const { mindmapId, linkId } = await seedDirectionalLink();
      await renderConnectionsContent(container, article, mindmapId);

      (
        container.querySelector(".mindmap-link-edit") as HTMLButtonElement
      ).click();
      await Zotero.Promise.delay(300);

      const cancel = container.querySelector(
        ".mindmap-form-cancel",
      ) as HTMLButtonElement;
      assert.isNotNull(cancel);
      cancel.click();
      await Zotero.Promise.delay(300);

      const doc = await readMindmapDocument(mindmapId, article.libraryID);
      assert.lengthOf(doc.links, 1);
      assert.equal(doc.links[0].typeId, "cites");
      assert.equal(doc.links[0].direction, "forward");
      assert.equal(doc.links[0].id, linkId);
    });
  });
});

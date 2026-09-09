/**
 * Fixture seeder for the manual user-journey pass.
 *
 * Puts a known set of items, notes and one attachment into the dev profile's
 * library so a journey run starts from the same library every time instead of
 * whatever the last session left behind. Idempotent: every object is keyed by
 * title inside the fixture collection, so re-running adds nothing and repairs a
 * partial seed.
 *
 * This is NOT a Node script. Zotero's data layer is only reachable from inside
 * a running Zotero, so there is nothing for `node` to attach to -- the profile's
 * sqlite is Zotero's private schema plus a sync layer, and writing it from
 * outside is how you corrupt a profile. Run it one of two ways:
 *
 *   Agent:  on the MCP client for this checkout (the port in .env,
 *           ZOTERO_MCP_RDP_PORT), let Zotero read the file rather than pushing
 *           it through the call:  zotero_execute_js with
 *             const src = await Zotero.File.getContentsAsync("<abs path>");
 *             return await eval(src);
 *   Human:  Tools -> Developer -> Run JavaScript, paste, tick "async", Run.
 *
 * It seeds library material only, never mindmap documents. Two reasons. The
 * storage format (a JSON blob in a tagged note under a tagged container item)
 * lives in src/modules/mindmap/storage.ts and a second copy of it here would
 * drift silently the first time the schema moves. And creating a mindmap is
 * itself the first thing the journeys exercise -- seeding one would skip the
 * interaction the checklist exists to check.
 *
 * Fixtures carry the `_zlm-journey-fixture` tag, so a seeded object is always
 * identifiable. The tag IS listed in the tag selector -- `addTag` creates a
 * manual tag and the leading underscore does not hide it, same as the plugin's
 * own storage tags.
 */
(async function seedDevProfile() {
  const COLLECTION_NAME = "Mindmap Journeys";
  const TAG = "_zlm-journey-fixture";
  const libraryID = Zotero.Libraries.userLibraryID;

  const created = [];
  const skipped = [];
  const failed = [];

  /** The fixture collection, made once and reused on every later run. */
  async function ensureCollection() {
    const existing = Zotero.Collections.getByLibrary(libraryID).find(
      (c) => c.name === COLLECTION_NAME,
    );
    if (existing) {
      skipped.push(`collection "${COLLECTION_NAME}"`);
      return existing;
    }
    const collection = new Zotero.Collection();
    collection.libraryID = libraryID;
    collection.name = COLLECTION_NAME;
    await collection.saveTx();
    created.push(`collection "${COLLECTION_NAME}"`);
    return collection;
  }

  const collection = await ensureCollection();

  // Reloaded rather than cached: getChildItems on a collection saved moments ago
  // returns [] until the collection object refreshes.
  function childItems() {
    return Zotero.Collections.get(collection.id).getChildItems();
  }

  function findByTitle(title) {
    return childItems().find((item) => item.getField("title") === title);
  }

  async function ensureRegularItem(itemType, title, fields, creators) {
    const existing = findByTitle(title);
    if (existing) {
      skipped.push(title);
      return existing;
    }
    const item = new Zotero.Item(itemType);
    item.libraryID = libraryID;
    item.setField("title", title);
    for (const [field, value] of Object.entries(fields || {})) {
      item.setField(field, value);
    }
    if (creators) {
      item.setCreators(
        creators.map((name) => {
          const parts = name.split(" ");
          return {
            firstName: parts.slice(0, -1).join(" "),
            lastName: parts[parts.length - 1],
            creatorType: "author",
          };
        }),
      );
    }
    item.addTag(TAG);
    item.addToCollection(collection.id);
    await item.saveTx();
    created.push(title);
    return item;
  }

  /**
   * Notes have no title field; Zotero derives the displayed title from the
   * first line of the note body, so the body opens with the title text and
   * findByTitle keeps working for them too.
   */
  async function ensureNote(title, body, parentItem) {
    const existing = parentItem
      ? parentItem
          .getNotes()
          .map((id) => Zotero.Items.get(id))
          .find((note) => note.getNoteTitle() === title)
      : findByTitle(title);
    if (existing) {
      skipped.push(title);
      return existing;
    }
    const note = new Zotero.Item("note");
    note.libraryID = libraryID;
    note.setNote(`<h1>${title}</h1>\n<p>${body}</p>`);
    if (parentItem) {
      note.parentID = parentItem.id;
    } else {
      note.addTag(TAG);
      note.addToCollection(collection.id);
    }
    await note.saveTx();
    created.push(title);
    return note;
  }

  const papers = [
    ["Attention Mechanisms in Sparse Graphs", "Rivera", "2021"],
    ["Citation Networks as Reading Aids", "Okonkwo", "2019"],
    ["Layout Stability Under Incremental Edits", "Halvorsen", "2022"],
    ["Notes as First-Class Graph Nodes", "Bakker", "2020"],
    ["On the Limits of Tag-Based Organisation", "Ferreira", "2018"],
    ["Reading Trails and Their Discontents", "Nakamura", "2023"],
  ];

  const items = [];
  for (const [title, author, year] of papers) {
    items.push(
      await ensureRegularItem(
        "journalArticle",
        title,
        { date: year, publicationTitle: "Journal of Applied Bibliometrics" },
        [`Ana ${author}`],
      ),
    );
  }

  // A second item type, so the graph's node labels and the dock's type line get
  // exercised against something that is not a journal article.
  const book = await ensureRegularItem(
    "book",
    "The Structure of Scholarly Argument",
    { date: "2017", publisher: "University Press" },
    ["Jonas Lindqvist"],
  );
  items.push(book);

  await ensureNote(
    "Standalone reading note",
    "A note that belongs to no item. Linkable on its own.",
  );
  await ensureNote(
    "Margin note on Rivera",
    "A child note. Its parent-child tie should draw on the graph.",
    items[0],
  );

  // The one non-linkable object in the fixture. Journeys use it to check the
  // "Only items and notes can be linked" refusal and the group-skipped count.
  // Wrapped because a failure here is not worth losing the rest of the seed.
  const attachmentTitle = "Preprint (link)";
  if (
    items[1]
      .getAttachments()
      .map((id) => Zotero.Items.get(id))
      .some((att) => att.getField("title") === attachmentTitle)
  ) {
    skipped.push(attachmentTitle);
  } else {
    try {
      await Zotero.Attachments.linkFromURL({
        url: "https://example.org/okonkwo-2019.pdf",
        parentItemID: items[1].id,
        contentType: "application/pdf",
        title: attachmentTitle,
      });
      created.push(attachmentTitle);
    } catch (e) {
      failed.push(`${attachmentTitle}: ${e}`);
    }
  }

  const report = [
    `library ${libraryID}, collection "${COLLECTION_NAME}"`,
    `created ${created.length}: ${created.join(", ") || "-"}`,
    `already present ${skipped.length}`,
  ];
  if (failed.length) {
    report.push(`FAILED ${failed.length}: ${failed.join("; ")}`);
  }
  return report.join("\n");
})();

/**
 * Read/write access to mindmap documents, each stored as JSON inside its own
 * Zotero note item. Notes are found by STORAGE_TAG rather than by
 * content-sniffing, so a corrupted one is still findable and distinguishable
 * from "no note yet".
 *
 * A library holds any number of mindmaps and the registry is exactly the set
 * of tagged notes - there is no index note to keep in step with them. Calls
 * name a mindmap by its document id; leaving the id out means "the library's
 * default mindmap", which is the lowest-numbered note and is created on
 * demand. That fallback is what lets a single-mindmap library work without
 * anything ever picking one.
 */
import {
  CURRENT_SCHEMA_VERSION,
  isUnplaced,
  type MindmapDocument,
  type MindmapNode,
} from "./schema";
import { parseMindmapDocument } from "./validate";

export const STORAGE_TAG = "_zoterolinkedmindmaps-storage-v1";

const DATA_BLOCK_ID = "zoterolinkedmindmaps-data";
const DATA_BLOCK_OPEN = `<pre id="${DATA_BLOCK_ID}">`;
// Zotero re-serializes a note's HTML through its own schema after save,
// wrapping the body in a data-schema-version div and dropping attributes the
// schema doesn't know - including the id on our <pre>. That happens without
// the user ever opening the note, so match any <pre> rather than the id.
const DATA_BLOCK_PATTERN = /<pre\b[^>]*>([\s\S]*?)<\/pre>/;
const NOTE_WARNING =
  "<p>This note stores structured data for the Zotero Linked Mindmaps plugin. Editing it manually will corrupt your mindmap.</p>";

export type StorageErrorReason =
  "block-missing" | "parse-failed" | "invalid-schema" | "not-found";

export class StorageError extends Error {
  reason: StorageErrorReason;

  constructor(reason: StorageErrorReason, message: string) {
    super(message);
    this.name = "StorageError";
    this.reason = reason;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// JSON.stringify turns a NaN *value* into null, but only when NaN sits at
// the top of the field it's serializing - a NaN nested inside {x, y} stays
// an object with x/y individually nulled, not a bare null. Normalize the
// unplaced marker to an actual `null` before serializing so what's on disk
// always uses the single canonical shape isMindmapNode expects back
// (position === null), regardless of whether the in-memory node used null
// or the NaN convenience marker.
function normalizeForStorage(doc: MindmapDocument): MindmapDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((node): MindmapNode =>
      isUnplaced(node.position) ? { ...node, position: null } : node,
    ),
  };
}

/**
 * The document exactly as it goes into the note. Two documents that serialize
 * identically are the same stored document, which is how a caller can tell a
 * change it made itself apart from someone else's.
 */
export function serializeDocument(doc: MindmapDocument): string {
  return JSON.stringify(normalizeForStorage(doc));
}

function buildNoteHtml(doc: MindmapDocument): string {
  return `${NOTE_WARNING}${DATA_BLOCK_OPEN}${escapeHtml(serializeDocument(doc))}</pre>`;
}

function extractDataBlock(html: string): string | null {
  return DATA_BLOCK_PATTERN.exec(html)?.[1] ?? null;
}

function defaultLibraryID(): number {
  return Zotero.Libraries.userLibraryID;
}

/**
 * Every storage note in a library, ordered by item id so repeated calls agree
 * on which one is "first". The registry of mindmaps is exactly this set: each
 * note carries its own id, title and description inside its JSON, so there is
 * no separate index note that could drift out of sync with it. The cost is
 * that listing opens and parses every note rather than reading one index,
 * which is fine at the low tens of mindmaps a library is expected to hold.
 */
export async function findAllMindmapNotes(
  libraryID = defaultLibraryID(),
): Promise<Zotero.Item[]> {
  const search = new Zotero.Search();
  search.addCondition("libraryID", "is", libraryID);
  search.addCondition("itemType", "is", "note");
  search.addCondition("tag", "is", STORAGE_TAG);
  const ids = await search.search();
  if (ids.length === 0) {
    return [];
  }
  const items = (await Zotero.Items.getAsync(ids)) as Zotero.Item[];
  // Sorted here rather than relying on getAsync echoing the id order back.
  return [...items].sort((a, b) => a.id - b.id);
}

/**
 * The storage note to use when no mindmap was named. Lowest item id wins, so
 * the choice is stable across calls.
 */
export async function findMindmapNote(
  libraryID = defaultLibraryID(),
): Promise<Zotero.Item | null> {
  return (await findAllMindmapNotes(libraryID))[0] ?? null;
}

/**
 * Reads and validates the document a storage note holds. Throws StorageError
 * rather than returning null so a corrupt note is distinguishable from an
 * empty one at every call site.
 *
 * Reloads the note text from the database first. A Zotero.Item's cached note
 * text can lag its own committed write for a moment - Zotero reloads the
 * object asynchronously after a save - so reading the cache can hand back the
 * document as it was before the write that just finished.
 */
export async function readDocumentFromNote(
  item: Zotero.Item,
): Promise<MindmapDocument> {
  await item.reload(["note"], true);
  const block = extractDataBlock(item.getNote());
  if (block === null) {
    throw new StorageError(
      "block-missing",
      "mindmap storage note is missing its data block",
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(unescapeHtml(block));
  } catch (err) {
    throw new StorageError(
      "parse-failed",
      `mindmap storage note contains invalid JSON: ${(err as Error).message}`,
    );
  }
  const result = parseMindmapDocument(data);
  if (!result.ok) {
    throw new StorageError("invalid-schema", result.error);
  }
  return result.doc;
}

async function findMindmapNoteById(
  id: string,
  libraryID: number,
): Promise<Zotero.Item | null> {
  for (const item of await findAllMindmapNotes(libraryID)) {
    let doc: MindmapDocument;
    try {
      doc = await readDocumentFromNote(item);
    } catch {
      // One unreadable note must not hide the mindmap being looked for.
      continue;
    }
    if (doc.id === id) {
      return item;
    }
  }
  return null;
}

async function requireMindmapNoteById(
  id: string,
  libraryID: number,
): Promise<Zotero.Item> {
  const item = await findMindmapNoteById(id, libraryID);
  if (!item) {
    throw new StorageError("not-found", `no mindmap with id ${id}`);
  }
  return item;
}

async function createNoteFor(
  doc: MindmapDocument,
  libraryID: number,
): Promise<Zotero.Item> {
  const item = new Zotero.Item("note");
  item.libraryID = libraryID;
  item.setNote(buildNoteHtml(doc));
  item.addTag(STORAGE_TAG);
  await item.saveTx();
  return item;
}

export async function createMindmapNote(
  libraryID = defaultLibraryID(),
): Promise<Zotero.Item> {
  return createNoteFor(emptyDocument("Mindmap"), libraryID);
}

export async function findOrCreateMindmapNote(
  libraryID = defaultLibraryID(),
): Promise<Zotero.Item> {
  const existing = await findMindmapNote(libraryID);
  return existing ?? (await createMindmapNote(libraryID));
}

function emptyDocument(title: string, description?: string): MindmapDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: Zotero.Utilities.generateObjectKey(),
    title,
    ...(description ? { description } : {}),
    nodes: [],
    links: [],
  };
}

export interface MindmapSummary {
  id: string;
  title: string;
  description?: string;
  noteItemID: number;
}

/**
 * Every mindmap in the library. A note whose content no longer validates is
 * skipped with a warning rather than throwing: one corrupt mindmap must not
 * make the others unlistable.
 */
export async function listMindmaps(
  libraryID = defaultLibraryID(),
): Promise<MindmapSummary[]> {
  const summaries: MindmapSummary[] = [];
  for (const item of await findAllMindmapNotes(libraryID)) {
    let doc: MindmapDocument;
    try {
      doc = await readDocumentFromNote(item);
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] skipping unreadable storage note ${item.id}: ${(err as Error).message}`,
      );
      continue;
    }
    summaries.push({
      id: doc.id,
      title: doc.title,
      ...(doc.description === undefined
        ? {}
        : { description: doc.description }),
      noteItemID: item.id,
    });
  }
  return summaries;
}

/**
 * Adds a mindmap. Touches nothing but the note it creates, so existing
 * mindmaps cannot be disturbed by it.
 */
export async function createMindmap(
  title: string,
  description?: string,
  libraryID = defaultLibraryID(),
): Promise<MindmapDocument> {
  if (title.trim() === "") {
    throw new StorageError("invalid-schema", "a mindmap needs a title");
  }
  const doc = emptyDocument(title, description);
  await enqueue(() => createNoteFor(doc, libraryID));
  return doc;
}

export async function readMindmapDocument(
  id?: string,
  libraryID = defaultLibraryID(),
): Promise<MindmapDocument> {
  const item =
    id === undefined
      ? await findOrCreateMindmapNote(libraryID)
      : await requireMindmapNoteById(id, libraryID);
  return readDocumentFromNote(item);
}

/**
 * Writes the document into the note it belongs to, resolved by the document's
 * own id. A document whose id matches no existing note falls back to the
 * library's default storage note, which is what makes a document assembled in
 * memory (or carried over from before the registry existed) still land
 * somewhere sensible.
 */
export async function writeMindmapDocument(
  doc: MindmapDocument,
  libraryID = defaultLibraryID(),
): Promise<void> {
  const result = parseMindmapDocument(doc);
  if (!result.ok) {
    throw new StorageError("invalid-schema", result.error);
  }
  await enqueue(async () => {
    const item =
      (await findMindmapNoteById(result.doc.id, libraryID)) ??
      (await findOrCreateMindmapNote(libraryID));
    await saveDocumentToNote(item, result.doc);
  });
}

// setNote runs inside the transaction, not before it. saveTx() calls
// _initSave - which reads the item's change flags - before Zotero opens the
// transaction, so a save that queues behind another transaction on the same
// item can have its pending note change wiped in between by the earlier
// save's _finalizeSave (reload() + _clearChanged()). The save then reports
// success and writes nothing, and the item's in-memory note text silently
// reverts. Opening the transaction first closes that window.
async function saveDocumentToNote(
  item: Zotero.Item,
  doc: MindmapDocument,
): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    item.setNote(buildNoteHtml(doc));
    await item.save();
  });
}

// The whole document lives in one note, so every caller that changes part of
// it reads the document, edits it, and writes all of it back. Two of those
// cycles overlapping means the later write is built on a document read before
// the earlier write landed, and the earlier change is gone. That is reachable
// without any user race: deletionCleanup runs from a Zotero notifier, so a
// delete arriving while the mindmap tab persists layout positions is enough.
//
// Serializing the cycles is what makes them safe, so read-modify-write goes
// through updateMindmapDocument rather than a bare read/write pair.
//
// The queue is not reentrant, and cannot be made so without async context
// tracking Zotero's sandbox doesn't provide. A queued task ends in saveTx(),
// and Zotero awaits every notifier observer inside that transaction's commit,
// so an observer that awaits a queued write parks it behind the task waiting
// on the observer: neither ever settles, and the queue stays wedged for the
// rest of the session with every later write hanging silently. A Zotero
// notifier observer must therefore never await writeMindmapDocument or
// updateMindmapDocument - start the work and let the notification return
// (see attachLiveRefresh in graphRenderer.ts).
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  // Each task chains off the previous one's settlement, not its value, so one
  // failing task doesn't wedge the queue for everything behind it.
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Reads the mindmap named by `id` (or the library's default one), applies
 * `mutate`, and writes the result back with no other storage operation
 * interleaving. Return null from `mutate` to leave the document untouched (no
 * write happens); otherwise the returned document is what gets written. The
 * note is resolved once, so the write lands in the same note the read came
 * from even if the mutation changed the document's own id.
 */
export async function updateMindmapDocument(
  mutate: (doc: MindmapDocument) => MindmapDocument | null,
  id?: string,
  libraryID = defaultLibraryID(),
): Promise<MindmapDocument | null> {
  return enqueue(async () => {
    const item =
      id === undefined
        ? await findOrCreateMindmapNote(libraryID)
        : await requireMindmapNoteById(id, libraryID);
    const next = mutate(await readDocumentFromNote(item));
    if (next === null) {
      return null;
    }
    const result = parseMindmapDocument(next);
    if (!result.ok) {
      throw new StorageError("invalid-schema", result.error);
    }
    await saveDocumentToNote(item, result.doc);
    return result.doc;
  });
}

/**
 * Resolves once every queued storage operation has settled. Tests need this:
 * a write triggered by a Zotero notifier (deletionCleanup) is not awaited by
 * whatever caused the delete, so without it that write lands in the middle of
 * a later test.
 */
export async function whenStorageIdle(): Promise<void> {
  await queue;
}

/**
 * Read/write access to the v1 mindmap document, stored as JSON inside a
 * dedicated Zotero note item. Phase 1 has exactly one implicit mindmap per
 * library, identified by STORAGE_TAG rather than by content-sniffing, so a
 * corrupted note is still findable and distinguishable from "no note yet".
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
  "block-missing" | "parse-failed" | "invalid-schema";

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

function buildNoteHtml(doc: MindmapDocument): string {
  const escaped = escapeHtml(JSON.stringify(normalizeForStorage(doc)));
  return `${NOTE_WARNING}${DATA_BLOCK_OPEN}${escaped}</pre>`;
}

function extractDataBlock(html: string): string | null {
  return DATA_BLOCK_PATTERN.exec(html)?.[1] ?? null;
}

function defaultLibraryID(): number {
  return Zotero.Libraries.userLibraryID;
}

/**
 * Finds the tagged storage note for a library. If more than one exists
 * (only possible via manual user tagging, not this module's own code),
 * picks the lowest item id, deterministically, and logs a warning.
 */
export async function findMindmapNote(
  libraryID = defaultLibraryID(),
): Promise<Zotero.Item | null> {
  const search = new Zotero.Search();
  search.addCondition("libraryID", "is", libraryID);
  search.addCondition("itemType", "is", "note");
  search.addCondition("tag", "is", STORAGE_TAG);
  const ids = await search.search();
  if (ids.length === 0) {
    return null;
  }
  if (ids.length > 1) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] multiple storage notes tagged ${STORAGE_TAG} in library ${libraryID}; using lowest item id`,
    );
  }
  const lowestId = Math.min(...ids);
  return (await Zotero.Items.getAsync(lowestId)) as Zotero.Item;
}

export async function createMindmapNote(
  libraryID = defaultLibraryID(),
): Promise<Zotero.Item> {
  const doc: MindmapDocument = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: Zotero.Utilities.generateObjectKey(),
    title: "Mindmap",
    nodes: [],
    links: [],
  };
  const item = new Zotero.Item("note");
  item.libraryID = libraryID;
  item.setNote(buildNoteHtml(doc));
  item.addTag(STORAGE_TAG);
  await item.saveTx();
  return item;
}

export async function findOrCreateMindmapNote(
  libraryID = defaultLibraryID(),
): Promise<Zotero.Item> {
  const existing = await findMindmapNote(libraryID);
  return existing ?? (await createMindmapNote(libraryID));
}

export async function readMindmapDocument(
  libraryID = defaultLibraryID(),
): Promise<MindmapDocument> {
  const item = await findOrCreateMindmapNote(libraryID);
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

export async function writeMindmapDocument(
  doc: MindmapDocument,
  libraryID = defaultLibraryID(),
): Promise<void> {
  const result = parseMindmapDocument(doc);
  if (!result.ok) {
    throw new StorageError("invalid-schema", result.error);
  }
  await enqueue(async () => {
    const item = await findOrCreateMindmapNote(libraryID);
    item.setNote(buildNoteHtml(result.doc));
    await item.saveTx();
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
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  // Each task chains off the previous one's settlement, not its value, so one
  // failing task doesn't wedge the queue for everything behind it.
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Reads the document, applies `mutate`, and writes the result back with no
 * other storage operation interleaving. Return null from `mutate` to leave the
 * document untouched (no write happens); otherwise the returned document is
 * what gets written.
 */
export async function updateMindmapDocument(
  mutate: (doc: MindmapDocument) => MindmapDocument | null,
  libraryID = defaultLibraryID(),
): Promise<MindmapDocument | null> {
  return enqueue(async () => {
    const doc = await readMindmapDocument(libraryID);
    const next = mutate(doc);
    if (next === null) {
      return null;
    }
    const result = parseMindmapDocument(next);
    if (!result.ok) {
      throw new StorageError("invalid-schema", result.error);
    }
    const item = await findOrCreateMindmapNote(libraryID);
    item.setNote(buildNoteHtml(result.doc));
    await item.saveTx();
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

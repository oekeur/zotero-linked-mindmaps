import { findAllMindmapNotes } from "../../src/modules/mindmap/storage";

/**
 * Erases every mindmap storage note in the library.
 *
 * Every one, not just the first: tests read and write by mindmap id, so a note
 * left behind by an earlier file makes the id-less lookups resolve somewhere
 * unexpected. Call it in both beforeEach and afterEach - the first protects
 * against what ran before, the second against what runs next.
 */
export async function clearStorageNotes(): Promise<void> {
  for (const note of await findAllMindmapNotes()) {
    await note.eraseTx();
  }
}

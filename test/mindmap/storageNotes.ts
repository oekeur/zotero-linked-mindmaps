import {
  findAllMindmapNotes,
  findContainers,
} from "../../src/modules/mindmap/storage";

/**
 * Erases every mindmap storage note in the library, and the container they
 * hang off.
 *
 * Every one, not just the first: tests read and write by mindmap id, so a note
 * left behind by an earlier file makes the id-less lookups resolve somewhere
 * unexpected. Call it in both beforeEach and afterEach - the first protects
 * against what ran before, the second against what runs next.
 *
 * Containers are erased including trashed ones: a test that trashes the
 * container to exercise the trash guard would otherwise leave one behind that
 * blocks every later test from getting a container at all.
 */
export async function clearStorageNotes(): Promise<void> {
  for (const note of await findAllMindmapNotes()) {
    await note.eraseTx();
  }
  for (const container of await findContainers(undefined, {
    includeTrashed: true,
  })) {
    await container.eraseTx();
  }
}

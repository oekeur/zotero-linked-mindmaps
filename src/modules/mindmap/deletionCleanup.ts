/**
 * Prunes the mindmap JSON when a linked item or note is deleted from
 * Zotero. Registered as a Zotero.Notifier observer on type "item" (notes
 * are items with itemType "note", so one registration covers both) and
 * filters to event "delete" itself, since registerObserver's `types` only
 * filters by Type, not Event.
 *
 * extraData for a "delete"/"item" notification is keyed by the deleted
 * item's numeric id and carries { libraryID, key } for that item
 * (Zotero's DataObject._initErase populates env.notifierData this way
 * before erase, and _finalizeErase passes it straight through to
 * Notifier.queue/trigger) - confirmed against zotero/zotero's
 * dataObject.js, so this reads extraData directly rather than caching a
 * pre-trash snapshot.
 */
import { listMindmaps, updateMindmapDocument, StorageError } from "./storage";

const OBSERVER_ID = "zoterolinkedmindmaps-deletion-cleanup";

function refKey(libraryID: number, key: string): string {
  return `${libraryID}:${key}`;
}

async function pruneLibrary(
  libraryID: number,
  deletedRefs: Set<string>,
): Promise<void> {
  // Listing rather than reading a single mindmap does two things: it prunes
  // every mindmap that referenced the deleted item, not just the first one,
  // and it avoids readMindmapDocument's findOrCreateMindmapNote creating a
  // storage note as a side effect of this notifier when there is nothing to
  // prune (or when the note being deleted *is* the storage note).
  for (const mindmap of await listMindmaps(libraryID)) {
    try {
      await updateMindmapDocument(
        (doc) => {
          const removedNodeIds = new Set(
            doc.nodes
              .filter((node) =>
                deletedRefs.has(refKey(node.ref.libraryID, node.ref.key)),
              )
              .map((node) => node.id),
          );
          if (removedNodeIds.size === 0) {
            return null;
          }
          return {
            ...doc,
            nodes: doc.nodes.filter((node) => !removedNodeIds.has(node.id)),
            links: doc.links.filter(
              (link) =>
                !removedNodeIds.has(link.sourceNodeId) &&
                !removedNodeIds.has(link.targetNodeId),
            ),
          };
        },
        mindmap.id,
        libraryID,
      );
    } catch (err) {
      if (err instanceof StorageError) {
        // A mindmap that vanished or stopped parsing between the listing and
        // the update is not a reason to skip the rest of them.
        Zotero.debug(
          `[zoteroLinkedMindmaps] deletion cleanup: could not update mindmap ${mindmap.id}: ${err.message}`,
        );
        continue;
      }
      throw err;
    }
  }
}

async function handleDelete(
  ids: string[] | number[],
  extraData: { [key: string]: any },
): Promise<void> {
  const deletedRefs = new Set<string>();
  const libraryIDs = new Set<number>();
  for (const id of ids) {
    const entry = extraData[id];
    if (
      entry &&
      typeof entry.libraryID === "number" &&
      typeof entry.key === "string"
    ) {
      deletedRefs.add(refKey(entry.libraryID, entry.key));
      libraryIDs.add(entry.libraryID);
    }
  }
  if (deletedRefs.size === 0) {
    return;
  }

  for (const libraryID of libraryIDs) {
    await pruneLibrary(libraryID, deletedRefs);
  }
}

async function notify(
  event: _ZoteroTypes.Notifier.Event,
  type: _ZoteroTypes.Notifier.Type,
  ids: string[] | number[],
  extraData: { [key: string]: any },
): Promise<void> {
  if (event !== "delete" || type !== "item") {
    return;
  }
  try {
    await handleDelete(ids, extraData);
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] deletion cleanup failed: ${(err as Error).message}`,
    );
  }
}

export function registerDeletionObserver(): string {
  return Zotero.Notifier.registerObserver({ notify }, ["item"], OBSERVER_ID);
}

export function unregisterDeletionObserver(id: string): void {
  Zotero.Notifier.unregisterObserver(id);
}

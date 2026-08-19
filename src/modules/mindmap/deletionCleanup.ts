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
import {
  readAllMindmaps,
  updateMindmapDocument,
  StorageError,
} from "./storage";
import { logFailure, logTrace } from "../../utils/logging";
import { pruneDanglingExternalNodes } from "./crossMindmapCleanup";
import { withoutNodes } from "./mutations";

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
  const stored = await readAllMindmaps(libraryID);
  // Nothing to prune if no node anywhere points at a deleted ref, and nothing
  // to reconcile if no mindmap borrows from another. Both checks come off
  // documents already in hand, so an unrelated deletion - the common case -
  // costs one pass over the registry rather than three.
  const touched = stored.filter(({ doc }) =>
    doc.nodes.some((node) =>
      deletedRefs.has(refKey(node.ref.libraryID, node.ref.key)),
    ),
  );
  const hasExternalNodes = stored.some(({ doc }) =>
    doc.nodes.some((node) => node.membership === "external"),
  );
  if (touched.length === 0 && !hasExternalNodes) {
    return;
  }

  for (const mindmap of touched.map(({ doc }) => doc)) {
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
          return withoutNodes(doc, removedNodeIds);
        },
        mindmap.id,
        libraryID,
      );
    } catch (err) {
      if (err instanceof StorageError) {
        // A mindmap that vanished or stopped parsing between the listing and
        // the update is not a reason to skip the rest of them.
        logTrace(
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
    // The deleted item may have been a mindmap's own storage note, which
    // leaves every stub reaching into that mindmap pointing at nothing. The
    // notification can't say so - it carries a key, and the document that key
    // named is already gone - so the check is done by reconciling against
    // what still exists rather than by identifying what was removed.
    await pruneDanglingExternalNodes(libraryID);
  }
}

/**
 * Returns nothing rather than a promise, and must keep doing so. Zotero awaits
 * each observer's return value inside the commit of the transaction that fired
 * the notification, and the pruning below ends in a storage-queue write - so
 * awaiting it here parks that write behind whichever queued task is waiting on
 * this notification to return. deleteMindmap is exactly that case: it erases
 * the storage note from inside a queued task, and the erase fires this
 * observer. Neither would ever settle, and every later write in the session
 * would hang silently (see the queue note in storage.ts).
 *
 * The work is deferred a turn rather than started inline for the same reason
 * the erase is what triggers it: the reads it opens with must see the state
 * the transaction leaves behind, not the one it is still committing.
 */
function notify(
  event: _ZoteroTypes.Notifier.Event,
  type: _ZoteroTypes.Notifier.Type,
  ids: string[] | number[],
  extraData: { [key: string]: any },
): void {
  if (event !== "delete" || type !== "item") {
    return;
  }
  void (async () => {
    try {
      await Zotero.Promise.delay(0);
      await handleDelete(ids, extraData);
    } catch (err) {
      logFailure(
        `[zoteroLinkedMindmaps] deletion cleanup failed: ${(err as Error).message}`,
        err,
      );
    }
  })();
}

export function registerDeletionObserver(): string {
  return Zotero.Notifier.registerObserver({ notify }, ["item"], OBSERVER_ID);
}

export function unregisterDeletionObserver(id: string): void {
  Zotero.Notifier.unregisterObserver(id);
}

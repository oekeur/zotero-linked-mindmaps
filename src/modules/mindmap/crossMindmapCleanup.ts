/**
 * Keeps cross-mindmap links honest. A link that reaches into another mindmap
 * lives entirely in the mindmap that owns it: an `external` node stub holding
 * (homeMindmapId, homeNodeId), plus an ordinary link pointing at that stub's
 * local id. Nothing is written into the mindmap being referenced, and no
 * reverse index of "who points at me" is kept - that would be a second copy of
 * the truth, and keeping two documents in step is the problem the strict
 * container model exists to avoid.
 *
 * The cost of no reverse index is that a stub can outlive what it points at:
 * the other mindmap can be deleted, or the node removed from it, with nothing
 * telling this one. So instead of tracking who deleted what, this reconciles:
 * it reads every mindmap, works out which (mindmap, node) pairs still exist,
 * and drops the stubs that point at pairs that don't, along with the links
 * touching them. That covers a deleted mindmap and a removed node with one
 * mechanism, and cannot be left holding stale bookkeeping.
 */
import { readAllMindmaps, updateMindmapDocument } from "./storage";
import { withoutNodes } from "./mutations";
import type { MindmapNode } from "./schema";

function isDangling(
  node: MindmapNode,
  available: Map<string, Set<string>>,
): boolean {
  if (node.membership !== "external") {
    return false;
  }
  return !available.get(node.homeMindmapId)?.has(node.homeNodeId);
}

/**
 * Drops every external stub whose target mindmap or target node is gone, and
 * every link touching one. Returns the ids of the mindmaps that changed, so a
 * caller can tell a no-op run from a real one; a mindmap with nothing to drop
 * is not written at all.
 */
export async function pruneDanglingExternalNodes(
  libraryID?: number,
): Promise<string[]> {
  const documents = (await readAllMindmaps(libraryID)).map(({ doc }) => doc);

  // Only member nodes count as a target. An external stub pointing at another
  // stub would be a chain this deliberately doesn't follow: a mindmap reaches
  // into another mindmap's own membership, not into its borrowings.
  const available = new Map<string, Set<string>>(
    documents.map((doc) => [
      doc.id,
      new Set(
        doc.nodes
          .filter((node) => node.membership === "member")
          .map((node) => node.id),
      ),
    ]),
  );

  const changed: string[] = [];
  for (const doc of documents) {
    if (!doc.nodes.some((node) => isDangling(node, available))) {
      continue;
    }
    const updated = await updateMindmapDocument(
      (current) => {
        // Recomputed against the document as it stands at write time, not the
        // copy read above: the panel can have changed it in between.
        const removedIds = new Set(
          current.nodes
            .filter((node) => isDangling(node, available))
            .map((node) => node.id),
        );
        return removedIds.size === 0 ? null : withoutNodes(current, removedIds);
      },
      doc.id,
      libraryID,
    );
    if (updated) {
      changed.push(doc.id);
    }
  }
  return changed;
}

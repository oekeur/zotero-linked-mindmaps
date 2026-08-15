/**
 * Computes positions for nodes that don't have one yet (PRODUCT.md: node
 * positions are computed once, by a layout algorithm, then persisted - not
 * recomputed on every open). Operates on a bare cytoscape.Core plus the
 * MindmapDocument it was built from, independent of Zotero item/label
 * resolution, so it stays unit-testable without a live Zotero instance.
 */
import type cytoscape from "cytoscape";
import { writeMindmapDocument } from "./storage";
import type { MindmapDocument, MindmapNode, Position } from "./schema";

const UNPLACED_SELECTOR = "[?unplaced]";

// Cytoscape's force-directed layouts can converge on -0 for a coordinate
// (e.g. two symmetric unconnected nodes with no starting-position jitter).
// -0 is numerically equal to 0 but round-trips through JSON.stringify as
// "0", so normalize it now rather than persisting a value nothing else in
// the codebase treats as meaningfully different from 0.
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Runs a layout scoped to only the unplaced nodes and persists the result.
 * Returns the updated document, or null if every node already had a stored
 * position (AC #2: reopening an already-laid-out mindmap triggers no
 * layout at all).
 */
export async function layoutUnplacedNodes(
  cy: cytoscape.Core,
  doc: MindmapDocument,
): Promise<MindmapDocument | null> {
  const unplaced = cy.nodes(UNPLACED_SELECTOR);
  if (unplaced.empty()) {
    return null;
  }

  const placed = cy.nodes(`:not(${UNPLACED_SELECTOR})`);
  placed.lock();
  try {
    const boundingBox = placed.empty() ? undefined : placed.boundingBox();
    await new Promise<void>((resolve) => {
      const layout = unplaced.layout({
        name: "cose",
        fit: false,
        animate: false,
        randomize: false,
        ...(boundingBox
          ? {
              boundingBox: {
                x1: boundingBox.x2,
                y1: boundingBox.y1,
                w: boundingBox.w,
                h: boundingBox.h,
              },
            }
          : {}),
      });
      layout.one("layoutstop", () => resolve());
      layout.run();
    });
  } finally {
    placed.unlock();
  }

  const updatedPositions = new Map<string, Position>();
  unplaced.forEach((node) => {
    const position = node.position();
    updatedPositions.set(node.id(), {
      x: normalizeZero(position.x),
      y: normalizeZero(position.y),
    });
    node.data("unplaced", false);
  });

  const updatedDoc: MindmapDocument = {
    ...doc,
    nodes: doc.nodes.map((node): MindmapNode => {
      const position = updatedPositions.get(node.id);
      return position ? { ...node, position } : node;
    }),
  };

  await writeMindmapDocument(updatedDoc);
  return updatedDoc;
}

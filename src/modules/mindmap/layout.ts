/**
 * Computes positions for nodes that don't have one yet (PRODUCT.md: node
 * positions are computed once, by a layout algorithm, then persisted - not
 * recomputed on every open). Operates on a bare cytoscape.Core plus the
 * MindmapDocument it was built from, independent of Zotero item/label
 * resolution, so it stays unit-testable without a live Zotero instance.
 */
import type cytoscape from "cytoscape";
import { writeMindmapDocument } from "./storage";
import { isCoincident } from "./schema";
import type { MindmapDocument, MindmapNode, Position } from "./schema";

const UNPLACED_SELECTOR = "[?unplaced]";

// Distance between neighbouring cells in the fallback grid, and the unit the
// layout's bounding box is sized in. Nodes render 50px wide with a wrapped
// label centred on them, so 160 leaves a readable gap at either side.
const NODE_SPACING = 160;

interface BoundingBox {
  x1: number;
  y1: number;
  w: number;
  h: number;
}

// Cytoscape's force-directed layouts can converge on -0 for a coordinate
// (e.g. two symmetric unconnected nodes with no starting-position jitter).
// -0 is numerically equal to 0 but round-trips through JSON.stringify as
// "0", so normalize it now rather than persisting a value nothing else in
// the codebase treats as meaningfully different from 0.
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Sizes the box the layout is allowed to place nodes in, from the node count
 * alone.
 *
 * Passing this explicitly is what keeps the layout off the container: cose
 * otherwise falls back to the container's viewport extent, and the mindmap
 * tab renders and lays out immediately after Zotero_Tabs.add(), before the
 * tab container has been measured. A zero-size viewport gives cose nowhere
 * to spread, so every node keeps the (0,0) it was rendered at and that gets
 * persisted as a real coordinate.
 *
 * Nodes that already have a position stay where they are, so the box for the
 * new ones starts clear of them rather than overlapping.
 */
function layoutBoundingBox(
  nodeCount: number,
  placed: cytoscape.NodeCollection,
): BoundingBox {
  const side = Math.max(1, Math.ceil(Math.sqrt(nodeCount))) * NODE_SPACING;
  if (placed.empty()) {
    return { x1: 0, y1: 0, w: side, h: side };
  }
  const occupied = placed.boundingBox();
  return { x1: occupied.x2 + NODE_SPACING, y1: occupied.y1, w: side, h: side };
}

/**
 * Deterministic grid placement inside `box`, ordered by node id so a rebuild
 * of the same document reproduces the same arrangement.
 */
export function gridPositions(
  nodeIds: string[],
  box: BoundingBox,
): Map<string, Position> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeIds.length)));
  const positions = new Map<string, Position>();
  [...nodeIds].sort().forEach((id, index) => {
    positions.set(id, {
      x: box.x1 + (index % columns) * NODE_SPACING,
      y: box.y1 + Math.floor(index / columns) * NODE_SPACING,
    });
  });
  return positions;
}

function anyCoincident(positions: Position[]): boolean {
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (isCoincident(positions[i], positions[j])) {
        return true;
      }
    }
  }
  return false;
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
  const box = layoutBoundingBox(unplaced.length, placed);
  placed.lock();
  try {
    await new Promise<void>((resolve) => {
      const layout = unplaced.layout({
        name: "cose",
        fit: false,
        animate: false,
        randomize: false,
        boundingBox: box,
      });
      layout.one("layoutstop", () => resolve());
      layout.run();
    });
  } finally {
    placed.unlock();
  }

  let updatedPositions = new Map<string, Position>();
  unplaced.forEach((node) => {
    const position = node.position();
    updatedPositions.set(node.id(), {
      x: normalizeZero(position.x),
      y: normalizeZero(position.y),
    });
  });

  // A layout can still hand back a pile: every node starts at the same
  // coordinate, and with no edges between them there is nothing to push them
  // apart. Persisting that is worse than an arbitrary arrangement, because
  // the pile then reads as a set of real positions. Fall back to the grid,
  // covering collisions with the already-placed nodes too.
  const placedPositions = placed.map((node) => node.position());
  if (anyCoincident([...updatedPositions.values(), ...placedPositions])) {
    updatedPositions = gridPositions([...updatedPositions.keys()], box);
    unplaced.forEach((node) => {
      node.position(updatedPositions.get(node.id())!);
    });
  }

  unplaced.forEach((node) => {
    node.data("unplaced", false);
  });

  const updatedDoc: MindmapDocument = {
    ...doc,
    nodes: doc.nodes.map((node): MindmapNode => {
      const position = updatedPositions.get(node.id);
      return position ? { ...node, position } : node;
    }),
  };

  // Writes the caller's document rather than re-reading storage inside the
  // write: this function's contract is to lay out the document it was handed,
  // which is not necessarily the persisted one (tests hand it a bare doc, and
  // the caller reads storage immediately before calling). The write itself is
  // still serialized against every other storage operation.
  await writeMindmapDocument(updatedDoc);
  return updatedDoc;
}

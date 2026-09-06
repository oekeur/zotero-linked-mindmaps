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

/**
 * Whether the layout put a node on top of something. Only collisions that
 * involve a node this run just placed count: two already-placed nodes sharing
 * a spot is a position the user dragged them into, and is not a reason to
 * throw away the layout's result for an unrelated new node.
 */
function anyNewCollision(updated: Position[], placed: Position[]): boolean {
  for (let i = 0; i < updated.length; i++) {
    for (let j = i + 1; j < updated.length; j++) {
      if (isCoincident(updated[i], updated[j])) {
        return true;
      }
    }
    for (const existing of placed) {
      if (isCoincident(updated[i], existing)) {
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
  if (anyNewCollision([...updatedPositions.values()], placedPositions)) {
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

/**
 * Recomputes positions for a re-layout, discarding the ones already stored.
 * Returns the new position per node id, and writes nothing: the caller
 * persists them, so this stays runnable headless and the write goes through
 * the same single-write path a drag uses.
 *
 * `targetIds` scopes it. Left out, every node on the mindmap is laid out
 * afresh. Given, only those nodes move and every other node is locked at its
 * stored position, which is what makes the selection case leave the rest of
 * the canvas alone.
 *
 * Group containers are never returned. A group is a compound node sized to
 * fit its members and has no stored position of its own, so it has nothing to
 * persist - but it does have to stay in the graph while the layout runs,
 * because keeping members inside their parent is precisely what stops a
 * group's box stretching across unrelated parts of the canvas.
 *
 * randomize is on, unlike the unplaced-node layout: this discards positions
 * on purpose, and seeding cose from the arrangement being replaced tends to
 * reproduce it.
 */
export async function relayoutPositions(
  cy: cytoscape.Core,
  targetIds?: string[],
): Promise<Map<string, Position>> {
  const isGroup = (node: cytoscape.NodeSingular): boolean =>
    node.data("isGroup") === true;

  const movable = cy
    .nodes()
    .filter((node) => !isGroup(node as cytoscape.NodeSingular));
  const targets =
    targetIds === undefined
      ? movable
      : movable.filter((node) => targetIds.includes(node.id()));

  if (targets.empty()) {
    return new Map();
  }

  const held = cy
    .nodes()
    .difference(targets)
    .filter((node) => !isGroup(node as cytoscape.NodeSingular));
  const box = layoutBoundingBox(targets.length, held);

  // The compound ancestors of the targets have to travel with them. cose
  // resolves each node's parent by id *within the collection it was handed*
  // (createLayoutInfo indexes layoutNodes by id, then dereferences the
  // parent's index), so laying out a child whose parent is absent throws
  // "can't access property children ... is undefined". Their positions are
  // still never read back: a group is sized to fit its members.
  const laidOut = targets.union(targets.parents());

  held.lock();
  try {
    await new Promise<void>((resolve) => {
      const layout = laidOut.layout({
        name: "cose",
        fit: false,
        animate: false,
        randomize: true,
        boundingBox: box,
      });
      layout.one("layoutstop", () => resolve());
      layout.run();
    });
  } finally {
    held.unlock();
  }

  let positions = new Map<string, Position>();
  targets.forEach((node) => {
    const position = node.position();
    positions.set(node.id(), {
      x: normalizeZero(position.x),
      y: normalizeZero(position.y),
    });
  });

  // Two ways cose can hand back something unusable, both falling back to the
  // deterministic grid.
  //
  // Non-finite coordinates: laying out a compound graph can produce NaN for a
  // member of a group, and NaN survives all the way into storage as JSON null,
  // which parses back as a node with no position at all. It also defeats the
  // pile check below, because every comparison against NaN is false - which is
  // how a test asserting only "nothing is piled" can pass on a graph where
  // every position is NaN.
  //
  // A pile: a set of nodes with no edges between them can come back stacked,
  // and a stack reads as deliberate.
  const heldPositions = held.map((node) =>
    (node as cytoscape.NodeSingular).position(),
  );
  const anyNonFinite = [...positions.values()].some(
    (position) => !Number.isFinite(position.x) || !Number.isFinite(position.y),
  );
  if (anyNonFinite || anyNewCollision([...positions.values()], heldPositions)) {
    positions = gridPositions([...positions.keys()], box);
    targets.forEach((node) => {
      node.position(positions.get(node.id())!);
    });
  }

  return positions;
}

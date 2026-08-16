/**
 * TS types for the mindmap JSON document stored inside a Zotero note item.
 * Pure types only, no Zotero API imports - see validate.ts for runtime checks.
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type ZoteroObjectRef =
  | { kind: "item"; libraryID: number; key: string }
  | { kind: "note"; libraryID: number; key: string };

// Two refs identify the same Zotero object only when all three fields agree.
// Key alone is not enough: keys are unique per library, not globally.
export function refsMatch(a: ZoteroObjectRef, b: ZoteroObjectRef): boolean {
  return a.kind === b.kind && a.libraryID === b.libraryID && a.key === b.key;
}

export interface Position {
  x: number;
  y: number;
}

// A node without a stored position yet is "unplaced". `null` is the
// canonical unplaced marker because it survives a JSON round-trip
// unchanged (unlike NaN, which JSON.stringify silently turns into `null`
// anyway - see below). Code that creates an unplaced node in memory before
// it's ever been through writeMindmapDocument may still use NaN as a
// convenience marker; isUnplaced recognizes both.
export const UNPLACED_POSITION: Position | null = null;

export function isUnplaced(position: Position | null): boolean {
  return (
    position === null || Number.isNaN(position.x) || Number.isNaN(position.y)
  );
}

// Two positions this close are one node hiding another on screen, so they
// count as the same spot rather than as two distinct placements.
export const COINCIDENT_TOLERANCE = 0.5;

export function isCoincident(a: Position, b: Position): boolean {
  return (
    Math.abs(a.x - b.x) < COINCIDENT_TOLERANCE &&
    Math.abs(a.y - b.y) < COINCIDENT_TOLERANCE
  );
}

const ORIGIN: Position = { x: 0, y: 0 };

/**
 * Ids of every placed node when the whole document is stacked on the origin,
 * and nothing otherwise. Such a document counts as fully placed under
 * isUnplaced alone - every node has a position, so no layout ever runs again
 * and the pile is permanent. Reporting those nodes hands them back to the
 * layout on the next open. Nodes with no position yet are left out: they are
 * already unplaced, and comparing a null position would throw.
 *
 * The rule is this narrow because dragging a node persists where it lands, so
 * any overlap a document carries can be one the user made on purpose, and
 * re-placing it would undo their work. Every node on (0,0) is the one case
 * that isn't ambiguous: it is what a layout with no room to spread writes, and
 * it is the damage this exists to recover from. An overlap anywhere else is
 * left alone.
 *
 * A lone node cannot be piled on anything, so a single-node mindmap keeps
 * whatever position it was given.
 */
export function piledNodeIds(nodes: MindmapNode[]): Set<string> {
  const placed = nodes.filter((node) => !isUnplaced(node.position));
  if (placed.length < 2) {
    return new Set();
  }
  if (!placed.every((node) => isCoincident(node.position!, ORIGIN))) {
    return new Set();
  }
  return new Set(placed.map((node) => node.id));
}

/**
 * A visual cluster of nodes, not a relationship between them. Grouping says
 * "these belong together" without claiming every pair is linked, which is what
 * the link vocabulary would have to do otherwise.
 */
export interface MindmapGroup {
  id: string;
  name?: string;
}

export type MindmapNode =
  | {
      membership: "member";
      id: string;
      position: Position | null;
      ref: ZoteroObjectRef;
      groupId?: string;
    }
  | {
      membership: "external";
      id: string;
      position: Position | null;
      ref: ZoteroObjectRef;
      homeMindmapId: string;
      homeNodeId: string;
      groupId?: string;
    };

export interface MindmapLink {
  id: string;
  typeId: string;
  name?: string;
  direction?: "forward" | "backward";
  sourceNodeId: string;
  targetNodeId: string;
}

export interface MindmapDocument {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  title: string;
  description?: string;
  nodes: MindmapNode[];
  links: MindmapLink[];
  // Optional rather than defaulted to []: a document written before grouping
  // existed has no groups key, and leaving it absent keeps that document
  // byte-identical through a read/write cycle.
  groups?: MindmapGroup[];
}

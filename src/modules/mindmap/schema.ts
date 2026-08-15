/**
 * TS types for the mindmap JSON document stored inside a Zotero note item.
 * Pure types only, no Zotero API imports - see validate.ts for runtime checks.
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type ZoteroObjectRef =
  | { kind: "item"; libraryID: number; key: string }
  | { kind: "note"; libraryID: number; key: string };

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

export type MindmapNode =
  | {
      membership: "member";
      id: string;
      position: Position | null;
      ref: ZoteroObjectRef;
    }
  | {
      membership: "external";
      id: string;
      position: Position | null;
      ref: ZoteroObjectRef;
      homeMindmapId: string;
      homeNodeId: string;
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
}

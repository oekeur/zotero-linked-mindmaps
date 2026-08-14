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

export type MindmapNode =
  | {
      membership: "member";
      id: string;
      position: Position;
      ref: ZoteroObjectRef;
    }
  | {
      membership: "external";
      id: string;
      position: Position;
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

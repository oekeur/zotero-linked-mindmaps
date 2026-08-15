/**
 * Runtime validation for MindmapDocument JSON read back from a note item.
 * Hand-rolled type guards, not a schema library: the shape is small and flat,
 * and this runs once per note-open, not on a hot path.
 */
import {
  CURRENT_SCHEMA_VERSION,
  type MindmapDocument,
  type MindmapLink,
  type MindmapNode,
  type Position,
  type ZoteroObjectRef,
} from "./schema";

type ParseResult =
  { ok: true; doc: MindmapDocument } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  );
}

export function isZoteroObjectRef(value: unknown): value is ZoteroObjectRef {
  return (
    isRecord(value) &&
    (value.kind === "item" || value.kind === "note") &&
    typeof value.libraryID === "number" &&
    typeof value.key === "string"
  );
}

export function isMindmapNode(value: unknown): value is MindmapNode {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.position !== null && !isPosition(value.position)) ||
    !isZoteroObjectRef(value.ref)
  ) {
    return false;
  }
  if (value.membership === "member") {
    return true;
  }
  if (value.membership === "external") {
    return (
      typeof value.homeMindmapId === "string" &&
      typeof value.homeNodeId === "string"
    );
  }
  return false;
}

export function isMindmapLink(value: unknown): value is MindmapLink {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.typeId !== "string" ||
    typeof value.sourceNodeId !== "string" ||
    typeof value.targetNodeId !== "string"
  ) {
    return false;
  }
  if (value.name !== undefined && typeof value.name !== "string") {
    return false;
  }
  if (
    value.direction !== undefined &&
    value.direction !== "forward" &&
    value.direction !== "backward"
  ) {
    return false;
  }
  return true;
}

export function parseMindmapDocument(data: unknown): ParseResult {
  if (!isRecord(data)) {
    return { ok: false, error: "document is not an object" };
  }
  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `unsupported schemaVersion: ${String(data.schemaVersion)}`,
    };
  }
  if (typeof data.id !== "string") {
    return { ok: false, error: "missing or invalid id" };
  }
  if (typeof data.title !== "string") {
    return { ok: false, error: "missing or invalid title" };
  }
  if (data.description !== undefined && typeof data.description !== "string") {
    return { ok: false, error: "invalid description" };
  }
  if (!Array.isArray(data.nodes) || !data.nodes.every(isMindmapNode)) {
    return { ok: false, error: "invalid nodes array" };
  }
  if (!Array.isArray(data.links) || !data.links.every(isMindmapLink)) {
    return { ok: false, error: "invalid links array" };
  }
  return {
    ok: true,
    doc: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: data.id,
      title: data.title,
      // Only set the key when a description is actually present - `title`
      // etc. above always exist, but `description` is optional, and adding
      // it as an explicit `undefined` property makes this object diverge
      // (by key membership, not by value) from a doc literal that never
      // mentions description at all - e.g. deepEqual round-trip checks.
      ...(data.description !== undefined
        ? { description: data.description as string }
        : {}),
      nodes: data.nodes,
      links: data.links,
    },
  };
}

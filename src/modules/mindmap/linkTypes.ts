/**
 * Default link-type vocabulary and its Zotero.Prefs-backed storage. Types are
 * global (shared across all mindmaps), independent of MindmapLink.name, which
 * is a freeform per-link label. Links reference a type by id (MindmapLink.typeId
 * in schema.ts), never by label, so renaming a type's label never orphans a link.
 */
import { config } from "../../../package.json";
import { logFailure } from "../../utils/logging";

export interface LinkType {
  id: string;
  label: string;
  directional: boolean;
}

/**
 * What a link whose typeId matches no type is called. A type can be deleted
 * from settings while links still reference it, and the delete confirmation
 * promises the user those links "will show as (unknown type)" - so every
 * surface that names a link type has to use this one, not the raw typeId.
 */
export const UNKNOWN_TYPE_LABEL = "(unknown type)";

const LINK_TYPES_PREF_KEY = `${config.prefsPrefix}.linkTypes`;

export const DEFAULT_LINK_TYPES: LinkType[] = [
  { id: "cites", label: "cites", directional: true },
  { id: "supports", label: "supports", directional: true },
  { id: "contradicts", label: "contradicts", directional: true },
  { id: "primary-source-for", label: "primary source for", directional: true },
  { id: "related-to", label: "related to", directional: false },
];

function isLinkType(value: unknown): value is LinkType {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LinkType).id === "string" &&
    typeof (value as LinkType).label === "string" &&
    typeof (value as LinkType).directional === "boolean"
  );
}

/**
 * Reads the global link-type list from prefs. Falls back to
 * DEFAULT_LINK_TYPES (without persisting it) when unset or unparseable, so a
 * future revision of the defaults isn't silently forked into every profile
 * that never called setLinkTypes().
 */
export function getLinkTypes(): LinkType[] {
  const raw = Zotero.Prefs.get(LINK_TYPES_PREF_KEY, true);
  if (typeof raw !== "string") {
    return DEFAULT_LINK_TYPES;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logFailure(
      `[zoteroLinkedMindmaps] link-types pref would not parse, falling back to defaults: ${(err as Error).message}`,
      err,
    );
    return DEFAULT_LINK_TYPES;
  }
  if (!Array.isArray(parsed) || !parsed.every(isLinkType)) {
    logFailure(
      "[zoteroLinkedMindmaps] link-types pref has an unexpected shape, falling back to defaults",
    );
    return DEFAULT_LINK_TYPES;
  }
  return parsed;
}

export function setLinkTypes(types: LinkType[]): void {
  Zotero.Prefs.set(LINK_TYPES_PREF_KEY, JSON.stringify(types), true);
}

/**
 * Looks up a link type strictly by id, never by label, so it stays valid
 * across renames. Returns undefined for an unknown id rather than throwing -
 * a future type-deletion flow relies on this being a soft-fail lookup.
 */
export function getLinkTypeById(id: string): LinkType | undefined {
  return getLinkTypes().find((type) => type.id === id);
}

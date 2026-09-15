/**
 * Default link-type vocabulary and its Zotero.Prefs-backed storage. Types are
 * global (shared across all mindmaps), independent of MindmapLink.name, which
 * is a freeform per-link label. Links reference a type by id (MindmapLink.typeId
 * in schema.ts), never by label, so renaming a type's label never orphans a link.
 */
import { config } from "../../../package.json";
import type { FluentMessageId } from "../../../typings/i10n";
import { getLocaleID, getString } from "../../utils/locale";
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

/**
 * The defaults with their English labels. What a profile that has never
 * edited its vocabulary sees when the locale bundle is not up (a read before
 * initLocale, or the test bundle, which never runs startup); otherwise
 * localizedDefaultLinkTypes() is what getLinkTypes() hands out.
 */
export const DEFAULT_LINK_TYPES: LinkType[] = [
  { id: "cites", label: "cites", directional: true },
  { id: "supports", label: "supports", directional: true },
  { id: "contradicts", label: "contradicts", directional: true },
  { id: "primary-source-for", label: "primary source for", directional: true },
  { id: "related-to", label: "related to", directional: false },
];

const DEFAULT_LABEL_MESSAGES: Record<string, FluentMessageId> = {
  cites: "link-type-default-cites",
  supports: "link-type-default-supports",
  contradicts: "link-type-default-contradicts",
  "primary-source-for": "link-type-default-primary-source-for",
  "related-to": "link-type-default-related-to",
};

/**
 * The default label in the running locale, or undefined when the bundle
 * cannot answer: not set up yet, or the message missing from it, in which
 * case getString hands back the raw id and a link would be labelled
 * `zoterolinkedmindmaps-link-type-default-cites`.
 */
function localeLabel(message: FluentMessageId): string | undefined {
  if (typeof addon === "undefined" || !addon.data.locale) {
    return undefined;
  }
  const text = getString(message);
  return text === getLocaleID(message) ? undefined : text;
}

/**
 * The defaults labelled in the running locale. Ids and directionality never
 * vary with locale: links store the id, and a Dutch profile and an English
 * one linking "cites" agree on what they mean. The labels are data rather
 * than UI strings, so they follow the locale only until the vocabulary is
 * first persisted, at which point setLinkTypes() writes whatever they
 * resolved to and later locale changes leave them alone, as they would any
 * label the user typed. `label` is injectable so a spec can supply a locale
 * without relaunching Zotero.
 */
export function localizedDefaultLinkTypes(
  label: (message: FluentMessageId) => string | undefined = localeLabel,
): LinkType[] {
  return DEFAULT_LINK_TYPES.map((type) => ({
    ...type,
    label: label(DEFAULT_LABEL_MESSAGES[type.id]) ?? type.label,
  }));
}

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
 * Reads the global link-type list from prefs. Falls back to the localized
 * defaults (without persisting them) when unset or unparseable, so a future
 * revision of the defaults isn't silently forked into every profile that
 * never called setLinkTypes().
 */
export function getLinkTypes(): LinkType[] {
  const raw = Zotero.Prefs.get(LINK_TYPES_PREF_KEY, true);
  if (typeof raw !== "string") {
    return localizedDefaultLinkTypes();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logFailure(
      `[zoteroLinkedMindmaps] link-types pref would not parse, falling back to defaults: ${(err as Error).message}`,
      err,
    );
    return localizedDefaultLinkTypes();
  }
  if (!Array.isArray(parsed) || !parsed.every(isLinkType)) {
    logFailure(
      "[zoteroLinkedMindmaps] link-types pref has an unexpected shape, falling back to defaults",
    );
    return localizedDefaultLinkTypes();
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

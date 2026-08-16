/**
 * How a node reference is named wherever one is shown: on the graph, in the
 * Connections panel, and in the add-link form's target lists. Kept apart from
 * the renderer so a form can label a node without pulling the graph library in
 * behind it.
 */
import type { ZoteroObjectRef } from "./schema";

export const MISSING_ITEM_LABEL = "(missing item)";
export const EMPTY_NOTE_LABEL = "(empty note)";

// Long enough to tell two notes apart at a glance, short enough that the
// label still wraps inside a node.
const NOTE_PREVIEW_LENGTH = 60;

// The entities Zotero's note editor actually emits. A DOM parse would be more
// thorough, but note HTML is simple enough not to warrant one here.
const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&amp;/g, "&"],
];

export function resolveZoteroItem(ref: ZoteroObjectRef): Zotero.Item | false {
  return Zotero.Items.getByLibraryAndKey(ref.libraryID, ref.key);
}

/**
 * A note's label is a preview of its content, not its title: Zotero derives a
 * note's title from its first line and it is often absent or unhelpful.
 *
 * Tags become spaces rather than nothing, so `</p><p>` doesn't glue the last
 * word of one paragraph to the first of the next. A note that reduces to
 * nothing - genuinely empty, or only markup like a blank paragraph - gets a
 * placeholder, because Cytoscape renders an empty label as a bare circle with
 * no indication of what it is.
 */
export function buildNoteLabel(item: Zotero.Item): string {
  let text = item.getNote().replace(/<[^>]*>/g, " ");
  for (const [pattern, replacement] of ENTITIES) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/\s+/g, " ").trim();

  if (text === "") {
    return EMPTY_NOTE_LABEL;
  }
  if (text.length <= NOTE_PREVIEW_LENGTH) {
    return text;
  }
  return `${text.slice(0, NOTE_PREVIEW_LENGTH).trimEnd()}…`;
}

export function resolveNodeLabel(ref: ZoteroObjectRef): string {
  const target = resolveZoteroItem(ref);
  if (!target) {
    return MISSING_ITEM_LABEL;
  }
  // Checks the item rather than ref.kind: a ref can outlive what it points at
  // being replaced, and the label should describe what is actually there.
  return target.isNote() ? buildNoteLabel(target) : target.getDisplayTitle();
}

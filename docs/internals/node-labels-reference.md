# Node labels reference

`src/modules/mindmap/nodeLabels.ts` names a node reference wherever one is shown: on the graph, in the Connections panel, and in the add-link form's target lists. It sits apart from the renderer so a form can label a node without pulling the graph library in behind it.

## Exported constants

### `MISSING_ITEM_LABEL`

```ts
export const MISSING_ITEM_LABEL = "(missing item)";
```

What a node reads as when its `ZoteroObjectRef` resolves to nothing: the Zotero item it points at was deleted, or lives in a library this Zotero profile does not have. The user sees it on the graph node itself, and again in the docked panel when they click that node, because `renderMissingItem` in `nodeOverview.ts` uses the same constant. The two match on purpose, so a deleted item reads as one condition rather than two unrelated failures.

The node stays on the graph. It is not pruned here; removal is [deletion cleanup](deletion-cleanup-reference.md)'s job.

### `EMPTY_NOTE_LABEL`

```ts
export const EMPTY_NOTE_LABEL = "(empty note)";
```

What a note node reads as when its content reduces to no text at all: a genuinely empty note, or one holding only markup such as a blank paragraph or an empty list item. Without it Cytoscape draws an empty label as a bare circle with nothing to say what it is.

The user sees this on the graph and in the dock's overview title, which also runs through `buildNoteLabel`.

## Module constants

`NOTE_PREVIEW_LENGTH = 60` is the cutoff for a note preview: long enough to tell two notes apart at a glance, short enough that the label still wraps inside a 50px node. Not exported.

`ENTITIES` is an ordered list of regex/replacement pairs covering the HTML entities Zotero's note editor emits: `&nbsp;` to a space, then `&lt;`, `&gt;`, `&quot;`, `&#39;`, and `&amp;` last. A DOM parse would be more thorough; note HTML is simple enough that this does not warrant one. Not exported.

## `resolveZoteroItem`

```ts
export function resolveZoteroItem(ref: ZoteroObjectRef): Zotero.Item | false;
```

Looks the referenced object up with `Zotero.Items.getByLibraryAndKey(ref.libraryID, ref.key)`.

Returns the `Zotero.Item`, or `false` when nothing matches. The `false` (rather than `undefined` or `null`) is Zotero's own return value, passed through unchanged. Callers treat it as falsy: `resolveNodeLabel` falls back to `MISSING_ITEM_LABEL`, `buildParentChildTies` skips the node, and `showNodeInDock` renders the missing-item state.

No side effects.

## `buildNoteLabel`

```ts
export function buildNoteLabel(item: Zotero.Item): string;
```

Builds a note's label from a preview of its content rather than from its title. Zotero derives a note's title from its first line, which is often absent or unhelpful.

Takes `item.getNote()`, replaces every tag with a single space, decodes the entities above in order, collapses whitespace runs, and trims. Replacing tags with a space rather than nothing is what keeps `</p><p>` from gluing the last word of one paragraph to the first of the next.

Returns `EMPTY_NOTE_LABEL` when the result is empty. Returns the text unchanged when it is 60 characters or fewer. Otherwise returns the first 60 characters, right-trimmed, with a `…` appended, so the returned string is at most 61 characters.

No side effects. The caller is expected to pass a note item; nothing here checks.

## `resolveNodeLabel`

```ts
export function resolveNodeLabel(ref: ZoteroObjectRef): string;
```

The label for one node reference.

Resolves the ref through `resolveZoteroItem`. Returns `MISSING_ITEM_LABEL` when that fails. Otherwise returns `buildNoteLabel(target)` for a note and `target.getDisplayTitle()` for anything else.

The note check is `target.isNote()`, on the resolved item, not `ref.kind`. A ref can outlive what it points at being replaced, and the label should describe what is actually there.

No side effects.

## Related

- [rendering-reference.md](rendering-reference.md), which calls `resolveNodeLabel` for every node and `resolveZoteroItem` for the parent-child ties
- [schema-reference.md](schema-reference.md), the `ZoteroObjectRef` shape
- [../user-guide/node-overview-reference.md](../user-guide/node-overview-reference.md), the docked panel that reuses `buildNoteLabel` and `MISSING_ITEM_LABEL`
- [deletion-cleanup-reference.md](deletion-cleanup-reference.md), what eventually removes a node whose item is gone

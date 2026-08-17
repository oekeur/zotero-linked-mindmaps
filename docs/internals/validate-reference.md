# Validation reference

Every exported symbol in `src/modules/mindmap/validate.ts`. Hand-rolled type guards over the types in [schema-reference.md](schema-reference.md); no schema library is involved.

All of these are synchronous, pure, and throw nothing. Rejection is reported by a `false` return or an `{ok: false}` result.

## `isZoteroObjectRef`

```ts
function isZoteroObjectRef(value: unknown): value is ZoteroObjectRef;
```

Requires a non-null, non-array object with `kind` exactly `"item"` or `"note"`, a numeric `libraryID`, and a string `key`.

Rejects: any other `kind` value, a missing `kind`, a `libraryID` that is a numeric string, a missing or non-string `key`. Does not check that the key is well-formed or that the object exists in Zotero.

## `isMindmapGroup`

```ts
function isMindmapGroup(value: unknown): value is MindmapGroup;
```

Requires an object with a string `id`. `name` may be absent or a string.

Rejects: a missing or non-string `id`, a `name` that is present and not a string. Extra keys are ignored.

## `isMindmapNode`

```ts
function isMindmapNode(value: unknown): value is MindmapNode;
```

Requires an object with a string `id`, a `position` that is either `null` or an object with numeric `x` and `y`, a `ref` that passes `isZoteroObjectRef`, and a `groupId` that is absent or a string. Then it switches on `membership`: `"member"` needs nothing further, `"external"` additionally needs string `homeMindmapId` and string `homeNodeId`.

Rejects: a missing `membership`, any `membership` value other than those two, a `position` that is neither `null` nor a `{x, y}` pair of numbers (`test/mindmap/validate.test.ts` covers the string case), a missing or malformed `ref`, an `"external"` node missing either home field, a non-string `groupId`.

Accepts `NaN` for `x` or `y`, because `typeof NaN === "number"`. That is deliberate: `isUnplaced` treats a NaN position as unplaced, and `serializeDocument` normalizes it to `null` before it reaches disk.

Does not check that `groupId` names a group that exists in the document.

## `isMindmapLink`

```ts
function isMindmapLink(value: unknown): value is MindmapLink;
```

Requires an object with string `id`, `typeId`, `sourceNodeId` and `targetNodeId`. `name` may be absent or a string. `direction` may be absent, `"forward"` or `"backward"`.

Rejects: any of the four required fields missing or non-string, a non-string `name`, a `direction` outside the two allowed values.

Does not check that `typeId` names a known link type, that `sourceNodeId` and `targetNodeId` name nodes in the document, or that the two differ. Two links between the same node pair both validate.

## `ParseResult`

```ts
type ParseResult =
  { ok: true; doc: MindmapDocument } | { ok: false; error: string };
```

Not exported. `parseMindmapDocument` returns it; callers narrow on `ok`. The `error` string is a short lowercase phrase, and `storage.ts` passes it straight through as the message of a `StorageError` with reason `invalid-schema`.

## `parseMindmapDocument`

```ts
function parseMindmapDocument(data: unknown): ParseResult;
```

Validates a whole document and, on success, returns a freshly built object rather than the input.

Checks in order, each with its own error string:

| Condition                                                              | Error                                |
| ---------------------------------------------------------------------- | ------------------------------------ |
| Not a non-null, non-array object                                       | `document is not an object`          |
| `schemaVersion !== 1`                                                  | `unsupported schemaVersion: <value>` |
| `id` not a string                                                      | `missing or invalid id`              |
| `title` not a string                                                   | `missing or invalid title`           |
| `description` present and not a string                                 | `invalid description`                |
| `nodes` not an array, or any entry fails `isMindmapNode`               | `invalid nodes array`                |
| `links` not an array, or any entry fails `isMindmapLink`               | `invalid links array`                |
| `groups` present and not an array, or any entry fails `isMindmapGroup` | `invalid groups array`               |

The returned `doc` is rebuilt key by key: `schemaVersion` is set to the constant, `id`, `title`, `nodes` and `links` are copied across, and `description` and `groups` are spread in only when present in the input. Setting them as explicit `undefined` properties would make the result diverge by key membership from a document literal that never mentions them, which `deepEqual` round-trip assertions in the test suite would catch.

The arrays themselves are the same array instances as the input's, not copies. A caller that mutates `result.doc.nodes` mutates what it passed in.

An empty `title` string passes here. The non-blank rule lives in `storage.ts` (`createMindmap` and `updateMindmapMetadata`), not in the parser.

Nothing about referential integrity is checked: a link pointing at a node id that does not exist, a `groupId` naming a missing group, or an external node whose home mindmap is gone all validate. Those are [deletion cleanup](deletion-cleanup-reference.md) and [cross-mindmap cleanup](cross-mindmap-cleanup-reference.md)'s territory.

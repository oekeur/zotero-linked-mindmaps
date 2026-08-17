# Document schema reference

Every exported symbol in `src/modules/mindmap/schema.ts`. Types plus the handful of pure functions that operate on them; no Zotero API is imported here, and runtime validation lives in [validate-reference.md](validate-reference.md).

## `CURRENT_SCHEMA_VERSION`

```ts
const CURRENT_SCHEMA_VERSION = 1 as const;
```

The only version `parseMindmapDocument` accepts. A document carrying anything else is rejected.

## `ZoteroObjectRef`

```ts
type ZoteroObjectRef =
  | { kind: "item"; libraryID: number; key: string }
  | { kind: "note"; libraryID: number; key: string };
```

What a mindmap node points at. `kind` distinguishes a regular Zotero item from a note; both carry the same two identifying fields.

### `refsMatch`

```ts
function refsMatch(a: ZoteroObjectRef, b: ZoteroObjectRef): boolean;
```

True when `kind`, `libraryID` and `key` all agree. Key alone is not enough: Zotero keys are unique per library, not globally.

## Positions

### `Position`

```ts
interface Position {
  x: number;
  y: number;
}
```

Graph coordinates in Cytoscape's model space. See [layout-reference.md](layout-reference.md).

### `UNPLACED_POSITION`

```ts
const UNPLACED_POSITION: Position | null = null;
```

The canonical marker for a node that has no stored position. `null` survives a JSON round-trip unchanged.

### `isUnplaced`

```ts
function isUnplaced(position: Position | null): boolean;
```

True for `null`, and also for a `Position` whose `x` or `y` is `NaN`. Code that builds an unplaced node in memory before it has been through `writeMindmapDocument` may use `NaN` as a convenience marker, and this recognises both. `serializeDocument` normalizes the `NaN` form to `null` on the way to disk.

### `COINCIDENT_TOLERANCE`

```ts
const COINCIDENT_TOLERANCE = 0.5;
```

Distance below which two positions count as the same spot, per axis.

### `isCoincident`

```ts
function isCoincident(a: Position, b: Position): boolean;
```

True when `|a.x - b.x|` and `|a.y - b.y|` are both strictly less than `COINCIDENT_TOLERANCE`. Neither argument may be `null`.

### `piledNodeIds`

```ts
function piledNodeIds(nodes: MindmapNode[]): Set<string>;
```

The ids of every placed node when the entire document is stacked on the origin, and an empty set otherwise.

Returns an empty set when fewer than two nodes are placed (a lone node cannot be piled on anything), and when any placed node is not coincident with `{x: 0, y: 0}`. Unplaced nodes are excluded from the check and never appear in the result: they are already unplaced, and comparing a `null` position would throw.

Such a document counts as fully placed under `isUnplaced` alone, so no layout would ever run on it again and the pile would be permanent. Reporting those ids hands them back to the layout on the next open. See [node-layout-explanation.md](../user-guide/node-layout-explanation.md).

## `MindmapGroup`

```ts
interface MindmapGroup {
  id: string;
  name?: string;
}
```

A visual cluster of nodes, not a relationship between them. Membership is recorded on the node (`groupId`), not in a member list here.

## `MindmapNode`

A discriminated union on `membership`.

```ts
type MindmapNode =
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
```

`id` is the node's identity within its own document, generated with `Zotero.Utilities.generateObjectKey()`. Links reference nodes by this, not by `ref`.

A `member` node is one this mindmap owns. An `external` node is a stub standing in for a node that belongs to another mindmap in the same library; `homeMindmapId` and `homeNodeId` name it. The `ref` is carried on the stub as well so it can be drawn without opening the other document, but the other document stays the source of truth. See [cross-mindmap-cleanup-reference.md](cross-mindmap-cleanup-reference.md).

`groupId` is absent rather than `undefined` when a node is ungrouped, so a never-grouped node and an ungrouped one serialize identically.

## `MindmapLink`

```ts
interface MindmapLink {
  id: string;
  typeId: string;
  name?: string;
  direction?: "forward" | "backward";
  sourceNodeId: string;
  targetNodeId: string;
}
```

`typeId` names an entry in the link-type vocabulary (see [link-types-reference.md](../user-guide/link-types-reference.md)). `name` is an optional freeform per-link label, separate from the type. `direction` is optional because undirected link types do not require one; `"forward"` reads source to target.

`sourceNodeId` and `targetNodeId` are `MindmapNode.id` values inside the same document. Links are not keyed by node pair: more than one link may connect the same two nodes, and `test/mindmap/validate.test.ts` asserts the validator accepts that.

## `MindmapDocument`

```ts
interface MindmapDocument {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  title: string;
  description?: string;
  nodes: MindmapNode[];
  links: MindmapLink[];
  groups?: MindmapGroup[];
}
```

The whole stored document. `id` is the mindmap's identity across the library, generated at creation and never changed by any operation in `mutations.ts`. `title` is required and non-empty (storage rejects a blank one). `description` is optional and its key is omitted when absent.

`groups` is optional rather than defaulted to `[]`: a document written before grouping existed has no `groups` key, and leaving it absent keeps that document byte-identical through a read/write cycle.

Serialized, a small document looks like this (the JSON that goes inside the note's `<pre>`):

```json
{
  "schemaVersion": 1,
  "id": "K2NPQ8VX",
  "title": "Chapter one",
  "description": "sources for ch. 1",
  "nodes": [
    {
      "membership": "member",
      "id": "node-a",
      "position": { "x": 120, "y": -40 },
      "ref": { "kind": "item", "libraryID": 1, "key": "AAAAAAAA" },
      "groupId": "G7XQ2M4B"
    },
    {
      "membership": "external",
      "id": "node-b",
      "position": null,
      "ref": { "kind": "note", "libraryID": 1, "key": "BBBBBBBB" },
      "homeMindmapId": "M4RT9WPZ",
      "homeNodeId": "node-t"
    }
  ],
  "links": [
    {
      "id": "link-1",
      "typeId": "cites",
      "name": "primary source for ch. 3",
      "direction": "forward",
      "sourceNodeId": "node-a",
      "targetNodeId": "node-b"
    }
  ],
  "groups": [{ "id": "G7XQ2M4B", "name": "Evidence" }]
}
```

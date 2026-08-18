# Document mutations reference

Every exported symbol in `src/modules/mindmap/mutations.ts`. In-memory operations on a `MindmapDocument` (see [schema-reference.md](schema-reference.md)); nothing here touches storage, Zotero items, or the write queue.

Mutation style is not uniform. `withoutNodes` returns a new document and leaves its argument alone; every other function that takes a `doc` mutates it in place and returns either `void` or the object it created. Each entry below states which.

The intended pairing is that an in-place mutator runs inside the callback passed to `updateMindmapDocument`, which returns the same `doc` object it was handed. See [storage-reference.md](storage-reference.md).

## `canBeMindmapNode`

```ts
function canBeMindmapNode(item: Zotero.Item): boolean;
```

Two tests, in order. An item carrying `CONTAINER_TAG` (`_zoterolinkedmindmaps-container-v1`) or `STORAGE_TAG` (`_zoterolinkedmindmaps-storage-v1`) is rejected outright. Everything else is true when `item.isRegularItem()` or `item.isNote()`.

So: regular items and notes qualify, except the plugin's own container item and its JSON storage notes. Attachments, annotations and collections are excluded by the type test. Pure; no document involved, and no storage read (both tags are read off the item in hand).

The tag test is not redundant with hiding plugin data from the library. The container is a regular item and the storage notes are notes, so a type test alone lets a user add the plugin's data row, or a mindmap's own JSON, to a mindmap as a node. `hideMindmapNotes` is a preference the user can turn off, and the trash view is never filtered at all. See [library-filter-reference.md](library-filter-reference.md) and [storage-reference.md](storage-reference.md) for the tags themselves.

Every surface that decides whether an item is linkable calls this: the library context menu, the Mindmaps section's render check, and the add-link target picker.

## `refFor`

```ts
function refFor(item: Zotero.Item): ZoteroObjectRef;
```

Builds a ref from a live item: `kind` is `"note"` when `item.isNote()` and `"item"` otherwise, with `libraryID` and `key` copied off the item. Does not check `canBeMindmapNode` first. Pure.

## `createMemberNode`

```ts
function createMemberNode(ref: ZoteroObjectRef): MindmapNode;
```

Returns a new `membership: "member"` node with a fresh id from `Zotero.Utilities.generateObjectKey()`, the given `ref`, and `position: UNPLACED_POSITION` (which is `null`).

Does not add the node to any document. The unplaced position is deliberate: `layoutUnplacedNodes` only picks up nodes `isUnplaced` reports as unplaced, so a node born at `{x: 0, y: 0}` would never be laid out and would sit at the origin under every other such node.

## `createExternalNode`

```ts
function createExternalNode(
  ref: ZoteroObjectRef,
  homeMindmapId: string,
  homeNodeId: string,
): MindmapNode;
```

Returns a new `membership: "external"` stub, standing in on this mindmap for a node that belongs to another one. Fresh generated id, unplaced position, the given `ref` and home pair.

The `(homeMindmapId, homeNodeId)` pair is the whole record of what the stub points at. The `ref` is carried alongside so the node can be drawn without opening the other document, but the other document stays the source of truth. Does not add the node to any document, and writes nothing into the mindmap being referenced.

## `withoutNodes`

```ts
function withoutNodes(
  doc: MindmapDocument,
  nodeIds: Set<string>,
): MindmapDocument;
```

**Returns a new document; does not mutate its argument.** The result drops every node whose id is in `nodeIds`, and every link whose `sourceNodeId` or `targetNodeId` is in it. All other fields are carried over by spread, so `groups` keeps its presence or absence.

Dropping a node and leaving a link pointing at it is the one way this document can go incoherent, so the two filters stay together everywhere nodes are removed: by the user, by a Zotero deletion, or by cross-mindmap reconciliation. Group membership is not cleaned up here, since it lives on the node being removed.

## `removeNode`

```ts
function removeNode(doc: MindmapDocument, nodeId: string): void;
```

**Mutates `doc` in place** by `Object.assign`ing `withoutNodes(doc, new Set([nodeId]))` onto it. Removes the node and every link touching it. A no-op for an id no node carries, and it leaves the underlying Zotero item or note alone.

## `removeLink`

```ts
function removeLink(doc: MindmapDocument, linkId: string): void;
```

**Mutates `doc` in place**, replacing `doc.links` with a filtered array. Both endpoint nodes stay. A no-op for an unknown link id.

## `createGroup`

```ts
function createGroup(
  doc: MindmapDocument,
  nodeIds: string[],
  name?: string,
): MindmapGroup;
```

**Mutates `doc` in place** and returns the group it created. The group gets a fresh generated id; the `name` key is omitted entirely when `name` is falsy, rather than set to `undefined`.

Appends the group to `doc.groups` (creating the array when the document had none) and rewrites `doc.nodes`, setting `groupId` on every node whose id appears in `nodeIds`.

Membership is exclusive: a node already in another group moves, it does not end up in both. That falls out of the rendering (a Cytoscape node has one parent) rather than from a product judgement, and is the one thing here that would need rethinking if overlapping groups are ever wanted.

Positions are not touched. A group is drawn around wherever its members already sit; it never moves them. `test/mindmap/mutations.test.ts` asserts every position is byte-identical after a `createGroup` call.

Ids in `nodeIds` that no node carries are ignored silently.

## `renameGroup`

```ts
function renameGroup(doc: MindmapDocument, groupId: string, name: string): void;
```

**Mutates `doc` in place**, replacing the named group's `name`. Members are untouched.

Returns without doing anything when `name` is empty. Clearing a name is not an offered operation, so a blank one means the user cancelled out of the field rather than asked for an unnamed group. A `groupId` no group carries is a no-op.

## `deleteGroup`

```ts
function deleteGroup(doc: MindmapDocument, groupId: string): void;
```

**Mutates `doc` in place.** Removes the group from `doc.groups` and deletes the `groupId` key from every node that carried it. Members stay where they are and keep their links; only the fact that they were clustered goes away.

## `removeFromGroup`

```ts
function removeFromGroup(doc: MindmapDocument, nodeId: string): void;
```

**Mutates `doc` in place.** Deletes the `groupId` key from the one named node. The group itself survives with its remaining members, even when this empties it.

Both this and `deleteGroup` delete the key rather than setting it to `undefined`, so a node that was never grouped and one that has been ungrouped serialize identically.

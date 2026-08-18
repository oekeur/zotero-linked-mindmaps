# Why the document is shaped this way

Four decisions in `src/modules/mindmap/schema.ts` that the types don't make obvious: the version field, the nullable position, the coincidence tolerance, and the reference by key. For the types themselves see [schema-reference.md](schema-reference.md).

## The schema version

`schemaVersion` is the first thing `parseMindmapDocument` checks, and anything other than `1` gets rejected outright.

The field earns its place because of where the document lives. A mindmap is JSON inside a synced Zotero note, so a document written by a newer plugin version can land on a machine running an older one. Without a version field the older plugin would parse whatever it recognises, drop what it doesn't, then write the survivors back and destroy the newer data permanently.

Rejecting an unknown version turns that silent loss into a visible failure. `readDocumentFromNote` throws `invalid-schema`, `readAllMindmaps` skips the note with a debug line, and nothing writes over it. The mindmap disappears from the older machine's list until the plugin is updated, which you can recover from. Silent data loss you cannot.

The version doesn't yet do the other thing version fields usually do, which is drive a migration. There is only one version, so there is no migration code and no upgrade path written. When version 2 arrives, the reader will need a branch that reads 1 and rewrites it, and the rejection above is what buys room to add that.

## Why a position can be null

A node with no position is `position: null`, not `position: {x: 0, y: 0}`.

The layout only touches nodes that `isUnplaced` reports as unplaced, and a node created at the origin is indistinguishable from a node the user dragged to the origin. So it would never be laid out, and would sit under every other origin-born node forever. `null` says "nobody has placed this yet" in a way a coordinate can't.

`NaN` was the earlier marker and still turns up in memory. Code that builds a node before it has been through `writeMindmapDocument` may use `{x: NaN, y: NaN}`, and `isUnplaced` accepts it. What it can't do is survive storage. `JSON.stringify` turns a top-level `NaN` value into `null`, but a `NaN` nested inside `{x, y}` stays an object with `x` and `y` individually nulled, which `isMindmapNode` then rejects as a malformed position. That produced an unreadable note, and an unpleasant one to diagnose: the write succeeded, the read threw `invalid nodes array`. `serializeDocument` now normalizes any unplaced node to a literal `null` before stringifying, and `test/mindmap/storage.test.ts` writes a `NaN`-positioned node and asserts it reads back as `null` and still unplaced.

Two markers for one concept is a wart. What keeps it harmless is that only one of them can ever reach disk.

## Coincidence tolerance and pile detection

`isCoincident` calls two positions the same spot when they are within 0.5 units on both axes. `piledNodeIds` uses it to recognise one specific broken state: every placed node in the document stacked on the origin.

That state has a real cause. Cytoscape lays out into whatever container it is given, and a container that is 0 by 0 at layout time (a tab rendered before it has been sized, say) gives the layout no room to spread. Every node gets written back at or near (0, 0). Once that is stored, every node has a position, `isUnplaced` reports the document as fully placed, no layout ever runs on it again, and the pile is permanent. The user sees one node where they had thirty.

The rule stays narrow on purpose. Dragging a node persists where it lands, so any overlap in a stored document might be one the user made deliberately, and re-laying it out would undo their work. Every node sitting on the origin is the one overlap that isn't ambiguous. It is what a layout with no room writes, and nothing anyone does by hand produces it. An overlap anywhere else gets left alone, even a total pile at (400, 300).

The two guards around it come from the same caution. A single placed node returns nothing, because one node can't be piled on anything, and a user who dragged their only node to the origin should get to keep it there. Unplaced nodes are excluded, because they are already going to be laid out and comparing a `null` position would throw.

The tolerance value itself isn't tuned to anything measured. 0.5 is well under a pixel of separation at any usable zoom, so anything inside it means one node is hiding another.

## Why nodes carry a `ZoteroObjectRef` and not an item ID

A node points at `{kind, libraryID, key}` instead of at Zotero's numeric item id.

Numeric item ids are local to one database. The same article synced to a second machine has a different id there, so a document storing ids would be meaningless the moment it synced, which defeats the entire reason the document lives in a note (see [storage-explanation.md](storage-explanation.md)). Keys are what Zotero itself syncs by, so a ref means the same object everywhere the library reaches.

`libraryID` rides along because keys are unique per library rather than globally. Two libraries can hold the same key for different objects, which is why `refsMatch` compares all three fields instead of just the key. `libraryID` is numeric and therefore local, which looks like the same problem all over again, but a mindmap and the items it references live in the same library, and the plugin never resolves a ref against a library it didn't read the document from.

`kind` separates a regular item from a note. Zotero's own item id space covers both, so you don't need the distinction to look an object up. You need it to decide what to draw and what the Mindmaps section offers. See [node-labels-reference.md](node-labels-reference.md).

Keying by key costs you a loud failure when the target is gone. `Zotero.Items.getByLibraryAndKey` just returns false, and a stale ref sits in the document rendering as a node with nothing behind it. Pruning those is what [deletion cleanup](deletion-cleanup-explanation.md) exists for, and it is why that module reconciles against current state instead of trusting a delete notification.

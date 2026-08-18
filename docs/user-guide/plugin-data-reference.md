# Plugin data reference: the container item and storage notes

Zotero Linked Mindmaps keeps all of its data inside ordinary Zotero items, so the data syncs with the rest of your library. This page describes what those items are, how the plugin recognises them, and the states it can find them in.

If your mindmaps have vanished, go to [Recovering plugin data](plugin-data-howto.md) first. For the reasoning behind this storage design, see [Why mindmaps live in a Zotero note](plugin-data-explanation.md).

## The container item

Each library that holds mindmaps gets one container item.

| Property    | Value                                      |
| ----------- | ------------------------------------------ |
| Item type   | Document                                   |
| Title       | `Zotero Linked Mindmaps (plugin data)`     |
| Tag         | `_zoterolinkedmindmaps-container-v1`       |
| Collections | none                                       |
| Children    | every mindmap storage note in that library |
| Count       | one per library                            |

The plugin finds the container by its tag, not by its title. Renaming the item does not break anything; removing the tag does, because the plugin then treats the library as having no container.

The title is stored data and stays in English in every locale. Two devices running Zotero in different languages have to recognise the same item.

The container belongs to no collection, so it appears under Unfiled Items. That was chosen over creating a plugin collection, which would add a permanent entry to the left pane.

The plugin creates the container the first time a library needs to store a mindmap. A library with no mindmaps has no container. When you delete a library's last mindmap, the plugin erases the container along with it, unless you have hung a note of your own off it.

By default the container is hidden from the library view. See [Hiding plugin data](hide-plugin-data-reference.md).

## The storage notes

One Zotero note per mindmap, each a child of the container.

| Property  | Value                              |
| --------- | ---------------------------------- |
| Item type | Note                               |
| Tag       | `_zoterolinkedmindmaps-storage-v1` |
| Parent    | the library's container item       |

The note content is a warning paragraph followed by a `<pre>` block holding the mindmap as JSON:

> This note stores structured data for the Zotero Linked Mindmaps plugin. Editing it manually will corrupt your mindmap.

The JSON holds the mindmap's schema version, its own id, its title, an optional description, its nodes (each pointing at a Zotero item or note by library id and item key, with a stored layout position), and its links. The items and notes a mindmap points at are separate Zotero items; nothing about them is copied into the storage note.

There is no index note. The set of mindmaps in a library is exactly the set of tagged notes, and each note carries its own id and title. Listing mindmaps opens and parses every note.

When no mindmap is named, the plugin uses the library's default mindmap, which is the storage note with the lowest item id. That choice is stable across calls.

## States the plugin can find a library in

At startup, and after each library's windows have loaded, the plugin reconciles the containers in every library you can write to. Read-only group libraries are skipped.

**No container, no storage notes.** Nothing happens. The plugin adds no row to a library that holds no mindmaps.

**No container, storage notes present.** The plugin creates a container and moves every stray note under it, in one transaction. A note that was filed in a collection is removed from that collection first, because Zotero does not allow a child item to sit in a collection. Note keys and note content are untouched.

**One container.** Any storage note not already parented to it is moved under it. A library already in this shape is written to not at all; the reconciliation is idempotent.

**Two or more containers.** This happens when two devices each created a container before syncing. The plugin adopts the container with the lowest item key (the key rather than the item id, because ids are local to one device and both devices must reach the same answer), moves every storage note under it, and erases the duplicates that are left empty. A duplicate that still holds a note of your own is left alone.

**Every container in the trash.** The plugin warns and does nothing else. It does not restore the container, and it deliberately does not create a replacement: a fresh container would take the next write while the real mindmaps sat in the trash, unreachable. The same refusal applies outside startup. Any write that would need a container throws instead of building one, so opening the Mindmap tab or pressing New while the container is in the trash creates nothing.

## Trash behaviour

Zotero's search excludes the child notes of a deleted item. A trashed container therefore hides every storage note under it, which hides every mindmap in that library from the plugin. The data is still there, and restoring the container brings it back.

Trashing a single storage note rather than the container hides that one mindmap and leaves the rest working.

The plugin warns through a popup in the corner of the main window. The popup has no auto-close timer; it stays until you click it. There are four messages.

When you move the container to the trash:

> The Zotero Linked Mindmaps item was moved to the trash. Every mindmap in that library stays hidden until you restore it.

When you move a single storage note to the trash:

> A mindmap's data note was moved to the trash. That mindmap stays hidden until you restore it.

A batch that trashes both the container and notes under it gets only the container message, since that is the wider of the two.

At the next startup, while the container is still in the trash:

> The Zotero Linked Mindmaps item is in the trash. Every mindmap in that library stays hidden until you restore it.

There is no startup equivalent for a trashed storage note. A note trashed in an earlier session goes unreported until you notice its mindmap missing.

When you open the Mindmap tab in a library whose registry is empty but whose trash holds plugin data, either a container or a storage note:

> Mindmap data for this library is in the trash. Nothing new was created - restore it to get your mindmaps back.

None of the messages names the library it is about. If you have several writable libraries, you have to check each one's trash.

The plugin never takes an item out of the trash on your behalf. Emptying the trash erases the container and its notes for good, and the plugin cannot recover them.

See [Recovering plugin data](plugin-data-howto.md) for the recovery steps.

## Read errors

When the plugin reads a storage note, it can fail in four ways:

- `block-missing`: the note has no `<pre>` data block. This is what manual editing of the note usually produces.
- `parse-failed`: the data block is not valid JSON.
- `invalid-schema`: the JSON parsed but does not match the mindmap schema.
- `not-found`: no storage note in this library holds a mindmap with the requested id.

A note that fails to read is skipped when the plugin lists mindmaps, with the reason written to Zotero's debug output. One corrupt mindmap does not make the others unlistable.

## Related

- [Recovering plugin data](plugin-data-howto.md)
- [Why mindmaps live in a Zotero note](plugin-data-explanation.md)
- [Hiding plugin data](hide-plugin-data-reference.md)
- [Managing mindmaps](mindmaps-manage-howto.md)

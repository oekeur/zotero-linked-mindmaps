# Link types reference

The vocabulary every link picks its type from. One list, shared by every mindmap in every library.

## Shape

A link type has three fields:

| Field         | Type    | Meaning                                                                                   |
| ------------- | ------- | ----------------------------------------------------------------------------------------- |
| `id`          | string  | Stable identity. Links store this, never the label.                                       |
| `label`       | string  | What the type is called in the Type dropdown, the link list, and the graph's edge labels. |
| `directional` | boolean | Whether links of this type carry a direction.                                             |

Ids for the built-in types are readable slugs. A type added in the settings pane gets a generated Zotero object key as its id.

## Defaults

The list a profile starts with:

| Label              | Id                   | Directional |
| ------------------ | -------------------- | ----------- |
| cites              | `cites`              | Yes         |
| supports           | `supports`           | Yes         |
| contradicts        | `contradicts`        | Yes         |
| primary source for | `primary-source-for` | Yes         |
| related to         | `related-to`         | No          |

These are returned whenever the stored list is missing, is not valid JSON, is not an array, or holds an entry missing one of the three fields. The fallback is not written back to the preference, so a profile that never edited the list picks up a later revision of the defaults instead of being forked onto the old set.

Editing anything in the settings pane writes the whole list, defaults included. From that point the list is yours and default changes no longer reach it.

## What "directional" means

A directional type adds a "Direction" dropdown to the add-link form, with the options "Forward" and "Backward". The choice is stored on the link. A non-directional type hides that field and the link is saved with no direction at all.

Direction is a property of the link, not of the node order: the link always records its source and target as authored, and the direction says which way to read it.

On the graph, a directional link is drawn as a dashed line with a triangular arrowhead; a non-directional one as a solid line with no arrowhead. In the Connections panel, a link with a stored direction gets an arrow pointing away from or toward the current item.

Flipping an existing type from directional to non-directional does not strip the direction already stored on its links. The graph stops drawing the arrowhead, but the Connections panel keeps showing the arrow, because it reads the link's own direction field rather than the type.

## Where types are stored

In a single Zotero preference, `extensions.zotero.zoterolinkedmindmaps.linkTypes`, holding the whole list as a JSON string. That is profile-level preference storage, not mindmap data: types live outside the storage notes that carry nodes and links, so they do not travel with a synced library the way the mindmaps themselves do (see [plugin-data-explanation.md](plugin-data-explanation.md)).

A consequence worth knowing: opening a synced mindmap on a second machine whose profile has a different link-type list shows its links against that machine's vocabulary. Types the second profile lacks render as unknown.

## Links whose type was deleted

Deleting a type does not touch any link. The link keeps its `typeId`, which now matches nothing.

Such a link still renders. On the graph it is labelled "(unknown type)", or `(unknown type): <name>` when it has a name, and drawn as a grey dotted line with no arrowhead, distinct from both the dashed directional and solid non-directional styles. In the Connections panel it is listed by its raw stored type id instead, which is the one place the two surfaces disagree.

Recreating a type with the same label does not reattach those links: a new type gets a new generated id. Restoring a deleted default (`cites`, `supports`, `contradicts`, `primary-source-for`, `related-to`) by hand is only possible by editing the preference directly, since the settings pane cannot set an id.

## Related

- [link-types-howto.md](link-types-howto.md) for managing the list
- [link-types-explanation.md](link-types-explanation.md) for why it works this way
- [links-add-reference.md](links-add-reference.md) for how a type is picked

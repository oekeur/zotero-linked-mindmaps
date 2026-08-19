# Add link form reference

The form that creates a link between two Zotero objects. It appears in the Mindmaps item-pane section, in the docked panel beside the graph in the mindmap tab, and in a standalone dialog titled "Add link" opened from the library context menu. All three render the same fields.

The source of the link is always the item the form was opened for. It is never a field.

## Fields

### Type

A dropdown listing every link type in the current vocabulary, in stored order, showing each type's label. The first entry is preselected, so a form saved without touching this field uses the first type in the list. See [link-types-reference.md](link-types-reference.md) for the vocabulary and its defaults.

The saved link records the type's id, not its label. Renaming a type later changes what the link displays; it does not detach the link.

### Name (optional)

A free text field, labelled "Name (optional)". Leading and trailing whitespace is trimmed on save. A field left blank (or holding only whitespace) is saved as no name at all rather than as an empty string.

The name is a per-link label. It is independent of the type: two links can share a type and carry different names.

### Direction

A dropdown with two options under the label "Direction". Each names both ends of the relation and uses the chosen type as the verb, so for a type called `cites` they read "This item cites the target" and "The target cites this item". It is present only while the selected type is directional, and it is shown or hidden again each time the Type dropdown changes. Choosing a non-directional type hides it, and the link is then saved with no direction at all.

The first option means the link runs from the item the form was opened for to the target; the second means it runs the other way. Both are stored on the same link record; the source and target node ids do not swap.

### Target

Two buttons, and no text field:

"Choose target" opens Zotero's own item-selector dialog, scoped to the library the source item is in. Only one item can be picked. Regular items and notes are selectable, including child notes, which appear as rows of their own.

"Choose from another mindmap" reveals a second pair of dropdowns for linking to a node whose membership is in a different mindmap. The node dropdown leaves out any node standing for the source item itself, so that route cannot produce a self-link either. See [cross-mindmap-links-reference.md](cross-mindmap-links-reference.md).

Once a valid target is chosen, the form shows its name next to the buttons:

- A regular item is named by its title.
- A note is named by a preview of its content, up to 60 characters, followed by an ellipsis when it is longer. A note that reduces to no text at all reads "(empty note)".
- A child item or child note has its parent's title appended in parentheses, for example `Chapter three notes (Kuhn 1962)`.
- A target picked from another mindmap has that mindmap's title appended in parentheses instead.

### Save

Labelled "Save". Disabled until a target has been chosen, and re-disabled while the other-mindmap node dropdown is reloading.

## Error conditions

The form reports three conditions inline, next to the target buttons.

Picking the source item itself shows "An item can't be linked to itself." The target is not accepted and Save stays disabled.

Picking an attachment, or anything else that is neither a regular item nor a note, shows "Only items and notes can be linked. Attachments can't." Zotero's item-selector dialog has no filter that excludes attachments while keeping notes, so an attachment can be selected and is rejected afterwards. The plugin's own "Zotero Linked Mindmaps (plugin data)" item and the storage notes under it are refused the same way, even though the storage notes are notes.

Pressing "Choose from another mindmap" in a library with no other mindmap shows "No other mindmaps to link to yet."

The other-mindmap route reports nothing inline. A node standing for the source item is left out of the dropdown rather than offered and rejected, so an other-mindmap selection is either valid or absent. Where that leaves the dropdown empty, Save stays disabled.

A failed write is not reported in the form. The error goes to Zotero's debug output, the form stays open, and the panel behind it does not redraw. The self-link check runs a second time at save, for a local target and an other-mindmap one alike; if it trips there (the stored document changed between picking and saving), the save is discarded silently.

Cancelling the item-selector dialog leaves the form untouched, including any target chosen before.

## What gets saved

Saving appends to the mindmap document as it stands at that moment, not to the copy the form was rendered from. The form can sit open while other edits land.

The write adds one link record:

| Field          | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| `id`           | A newly generated Zotero object key                             |
| `typeId`       | The id of the selected type                                     |
| `name`         | The trimmed Name field, omitted when blank                      |
| `direction`    | `"forward"` or `"backward"`, omitted for a non-directional type |
| `sourceNodeId` | The node for the source item                                    |
| `targetNodeId` | The node for the target                                         |

Nodes are created as needed: if the source item is not yet a node in this mindmap, a member node is added for it, positioned as unplaced so the layout can place it. The same happens for a local target. A target in another mindmap gets an external stub instead.

Saving never modifies or removes an existing node or link. Adding a second link between the same two nodes leaves the first one alone, so parallel links are two separate records with their own types, names and directions. The graph fans them apart rather than drawing them on top of each other.

## Editing an existing link

The edit control on a link row (see [mindmaps-panel-reference.md](mindmaps-panel-reference.md)) opens this same form against that link instead of a new one. It differs from the add form in a few ways:

- Type, Name and Direction are prefilled from the link being edited.
- The endpoints are fixed: the target buttons and "Choose from another mindmap" are not shown, and the other end's title appears as plain text instead.
- Save starts enabled, since the target is already known.
- Save updates the link in place - the same `id`, `sourceNodeId` and `targetNodeId` - rather than appending a new one. Retyping to a non-directional type clears `direction` from the record rather than leaving a stale value behind.
- A "Cancel" button is present; closing it that way leaves the link untouched.

## Which mindmap is written

The answer comes from whatever opened the form, and the form only asks when nothing gave it one.

In the Mindmaps section, the mindmap the panel is showing is the mindmap the link is written to. That covers the docked panel in the mindmap tab (the graph on screen), the item pane once the panel has resolved a mindmap for the item, and a redraw straight after a save (the mindmap just written to). Both of the panel's add-link controls use it: the header "+" and the in-body "Add link" button. Right-clicking a node on the graph and choosing "Add link" lands on the mindmap that graph is drawing.

The chooser appears only when the panel has no mindmap to pass on, which means the item is a node in none yet and the library holds more than one. It is the label "Add to mindmap:", a dropdown of every mindmap in the library, and a "Continue" button. With exactly one mindmap that mindmap is used without asking. With none, the library's default mindmap is created on save, titled "Mindmap".

The standalone dialog opened from the library context menu is told which mindmap to use by the entry that opened it. A library holding more than one mindmap gets an "Add link" submenu listing them by title, and the entry chosen names the mindmap. A library with one mindmap or none gets a plain "Add link…" entry, which writes to the library's default mindmap: the storage note with the lowest item id, or a new one titled "Mindmap" when the library has none. A dialog that cannot read the mindmap shows `Failed to load mindmap:` followed by the error instead of the form.

## Related

- [links-add-howto.md](links-add-howto.md) for the steps at each entry point
- [mindmaps-panel-reference.md](mindmaps-panel-reference.md) for where links are listed and removed
- [link-types-reference.md](link-types-reference.md) for the type vocabulary

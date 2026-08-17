# Add link form reference

The form that creates a link between two Zotero objects. It appears in the Connections item-pane section, in the docked panel beside the graph in the mindmap tab, and in a standalone dialog titled "Add link" opened from the library context menu. All three render the same fields.

The source of the link is always the item the form was opened for. It is never a field.

## Fields

### Type

A dropdown listing every link type in the current vocabulary, in stored order, showing each type's label. The first entry is preselected, so a form saved without touching this field uses the first type in the list. See [link-types-reference.md](link-types-reference.md) for the vocabulary and its defaults.

The saved link records the type's id, not its label. Renaming a type later changes what the link displays; it does not detach the link.

### Name (optional)

A free text field, labelled "Name (optional)". Leading and trailing whitespace is trimmed on save. A field left blank (or holding only whitespace) is saved as no name at all rather than as an empty string.

The name is a per-link label. It is independent of the type: two links can share a type and carry different names.

### Direction

A dropdown with two options, "Forward" and "Backward", under the label "Direction". It is present only while the selected type is directional, and it is shown or hidden again each time the Type dropdown changes. Choosing a non-directional type hides it, and the link is then saved with no direction at all.

"Forward" means the link runs from the item the form was opened for to the target. "Backward" means it runs the other way. Both are stored on the same link record; the source and target node ids do not swap.

### Target

Two buttons, and no text field:

"Choose target" opens Zotero's own item-selector dialog, scoped to the library the source item is in. Only one item can be picked. Regular items and notes are selectable, including child notes, which appear as rows of their own.

"Choose from another mindmap" reveals a second pair of dropdowns for linking to a node whose membership is in a different mindmap. See [cross-mindmap-links-reference.md](cross-mindmap-links-reference.md).

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

Picking an attachment, or anything else that is neither a regular item nor a note, shows "Only items and notes can be linked. Attachments can't." Zotero's item-selector dialog has no filter that excludes attachments while keeping notes, so an attachment can be selected and is rejected afterwards.

Pressing "Choose from another mindmap" in a library with no other mindmap shows "No other mindmaps to link to yet."

A failed write is not reported in the form. The error goes to Zotero's debug output, the form stays open, and the panel behind it does not redraw. The self-link check runs a second time at save; if it trips there (the stored document changed between picking and saving), the save is discarded silently.

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

## Which mindmap is written

When the library holds more than one mindmap, the form is preceded by a mindmap chooser: the label "Add to mindmap:", a dropdown of every mindmap in the library, and a "Continue" button. With exactly one mindmap that mindmap is used without asking. With none, the library's default mindmap is created on save, titled "Mindmap".

The chooser belongs to the Connections panel, so it appears at both of that panel's mounts: the item pane and the docked panel in the mindmap tab.

Known rough edge: opening the form by right-clicking a node on the graph still shows the chooser when the library holds more than one mindmap, and nothing in it is preselected to the mindmap on screen. The panel is pinned to that mindmap for display, but the add-link flow is not told which one it is, so the user has to pick again the mindmap they are already looking at, and the first entry in the dropdown wins if they do not. Picking a different one writes the link into that other mindmap instead, and the panel then redraws against whichever mindmap was written.

The standalone dialog opened from the library context menu has no chooser. It always writes to the library's default mindmap, which is the storage note with the lowest item id, or a new one titled "Mindmap" when the library has none. A dialog that cannot read that mindmap shows `Failed to load mindmap:` followed by the error instead of the form.

## Related

- [links-add-howto.md](links-add-howto.md) for the steps at each entry point
- [connections-panel-reference.md](connections-panel-reference.md) for where links are listed and removed
- [link-types-reference.md](link-types-reference.md) for the type vocabulary

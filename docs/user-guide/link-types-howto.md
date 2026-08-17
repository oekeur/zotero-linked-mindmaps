# Manage link types

The vocabulary is edited in Zotero's settings, in a pane the plugin registers. Field meanings and the default list are in [link-types-reference.md](link-types-reference.md).

## Open the pane

1. Open Zotero's settings window (Edit, then Settings).
2. Select "Link Types" in the pane list on the left.

The pane opens on a table headed "Label" and "Directional", one row per type, with "Yes" or "No" in the second column. Three buttons sit above it: "Add", "Edit" and "Delete".

## Add a type

1. Click "Add".
2. Type the name in the "Label" field. This is what the Type dropdown and the graph's edge labels will show.
3. Tick or untick "Directional", which is ticked by default. Tick it when links of this type read one way (A cites B), untick it when they read the same both ways (A related to B).
4. Click "Save".

The table comes back with the new type selected. "Cancel" returns to the table without adding anything. Be aware that saving with a blank label does nothing at all: the button simply doesn't respond, and no message tells you why.

## Edit a type

1. Click the type's row in the table. The selected row is shown in bold.
2. Click "Edit". The button is disabled while nothing is selected.
3. Change the "Label" field, the "Directional" checkbox, or both.
4. Click "Save".

Renaming is safe. Existing links keep their type, because a link stores the type's id rather than its label, and the new label shows up on the graph and in the Connections panel the next time each one redraws.

## Delete a type

1. Click the type's row in the table.
2. Click "Delete".

What happens next depends on how many links use the type. The plugin counts them across every mindmap in every library, since the vocabulary is shared by all of them.

No links use it: the type is deleted immediately, with no confirmation.

Some links use it: a dialog titled "Delete link type" asks

> Delete this link type? 4 links use it and will show as "(unknown type)" there.

with the real count, and "link" in the singular when the count is one. Confirm and the type goes, while those links stay exactly where they are, reading "(unknown type)" on the graph and in the Connections panel alike. Cancel and nothing changes.

A mindmap couldn't be read: the count is unknown, and the dialog says

> Could not check how many links use this type - its mindmap data could not be read. Delete anyway?

Read that as a warning that the number could be anything. It is not a hint that the type is unused.

Deletion can't be undone from the pane. Add a type back with the same label and it gets a new id, so the old links stay unknown. See [link-types-explanation.md](link-types-explanation.md).

# Recover your mindmaps after they disappeared

## Symptom: every mindmap in a library is gone

The Mindmap tab shows an empty list, or "No mindmaps yet. Create one to start linking items.", and the Mindmaps section shows "Not in a mindmap yet. Add it to one to start linking." for items you know were on a mindmap. You may have seen a popup saying:

> The Zotero Linked Mindmaps item was moved to the trash. Every mindmap in that library stays hidden until you restore it.

Opening the Mindmap tab in this state shows a second popup:

> Mindmap data for this library is in the trash. Nothing new was created; restore it to get your mindmaps back.

Nine times out of ten the cause is that the item titled `Zotero Linked Mindmaps (plugin data)` is in the trash. Every mindmap in that library is stored in notes hanging off that item, and Zotero hides the child notes of a trashed item, so one trash action hides the lot. The good news is that your data is all still there, and restoring the item brings it back.

Before you do anything else: don't empty the trash. That erases the item and its notes for good, and nothing can get them back.

### Restore the container

1. Leave the Mindmap tab open if you like. It writes nothing while the container is in the trash, because the plugin checks the trash before creating a library's first mindmap and declines when it finds data there. Clicking the `+` icon in the sidebar header creates nothing either. The mindmap doesn't appear, and the reason goes to the debug log (Help > Debug Output Logging).
2. In Zotero's left pane, click Trash under the library whose mindmaps are missing. If you have several libraries, check each one. The warning popup doesn't say which library it was about, which is a shortcoming of the warning.
3. Look for an item titled `Zotero Linked Mindmaps (plugin data)`. The setting that hides this item from your library doesn't apply to the trash view, so it's visible there whether that setting is on or off.
4. Right-click it and choose Restore to Library.
5. Restart Zotero. If any storage note came back at the top level, the startup reconciliation puts it under the container again without touching its content.

### Confirm your mindmaps came back

1. Open the Mindmap tab with File > Mindmap, or press Shift+G.
2. The sidebar under the heading "Mindmaps" should list your mindmaps again, with their nodes and links intact.
3. Select an item that was on a mindmap and check the Mindmaps section in the item pane. It should show the mindmap and its links rather than the empty state.

Nothing was created while the container sat in the trash, so there's no leftover mindmap to tidy up afterwards.

If the container wasn't in the trash, or restoring it changed nothing, try [When a single mindmap is missing](#symptom-one-mindmap-is-missing-the-rest-are-fine) below. And if most of your mindmaps came back but one didn't, that one's note may be corrupt. The plugin skips a storage note it can't parse and writes the reason to Zotero's debug output (Help > Debug Output Logging).

## Symptom: one mindmap is missing, the rest are fine

This is a trashed storage note rather than a trashed container. Only the one mindmap is affected, and the popup at trash time says so:

> A mindmap's data note was moved to the trash. That mindmap stays hidden until you restore it.

That popup appears when the note goes into the trash, and only then. It doesn't come back at the next startup, so if you trashed the note in an earlier session the mindmap is simply missing with nothing to explain it. That gap is known and not yet fixed.

If the trashed note held the library's only mindmap, opening the Mindmap tab shows:

> Mindmap data for this library is in the trash. Nothing new was created; restore it to get your mindmaps back.

No replacement mindmap is made in that case. Your data stays in the trashed note.

1. Do not empty the trash.
2. Click Trash in the left pane for the library concerned.
3. Look for a note whose text starts with "This note stores structured data for the Zotero Linked Mindmaps plugin." Each mindmap has one such note. Open it to check the title of the mindmap in the JSON if you have more than one and need to tell them apart.
4. Right-click the note and choose Restore to Library.
5. Restart Zotero. The restored note may come back as a top-level note rather than under the container item; the startup reconciliation moves it back under the container without touching its content.
6. Open the Mindmap tab and check the sidebar for the mindmap.

## What not to do

Don't empty the trash before you've restored the item. This is the one action the plugin can't undo for you. Once the container and its notes are erased, every mindmap in that library is gone, along with its nodes, links and layout. Your items and notes survive, since the nodes only pointed at them. What you lose is the structure you built around them.

Don't remove the tag `_zoterolinkedmindmaps-container-v1` from the container item, or `_zoterolinkedmindmaps-storage-v1` from a storage note. Those tags are how the plugin finds its data. Strip the tag from a container and the plugin builds a new one and leaves the old notes stranded. Strip it from a storage note and that note stops being a mindmap as far as the plugin is concerned.

Don't edit a storage note by hand. Zotero's note editor rewrites the note's HTML when it saves, which can break the data block the plugin reads. Renaming the container item is fine, though, since the plugin matches on the tag and ignores the title.

Don't delete the container item to tidy up your library. If you want it out of sight, use the setting described in [Hiding plugin data](hide-plugin-data-howto.md), which is on by default anyway. And when you delete a library's last mindmap, the plugin erases the container for you.

## Related

- [Plugin data reference](plugin-data-reference.md)
- [Why mindmaps live in a Zotero note](plugin-data-explanation.md)
- [Hiding plugin data](hide-plugin-data-howto.md)
- [Managing mindmaps](mindmaps-manage-howto.md)

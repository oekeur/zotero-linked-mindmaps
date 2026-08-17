# Recover your mindmaps after they disappeared

## Symptom: every mindmap in a library is gone

The Mindmap tab shows an empty list, or "No mindmaps yet. Create one to start linking items.", and the Connections panel shows "Not in any mindmap yet." for items you know were on a mindmap. You may have seen a popup saying:

> "Zotero Linked Mindmaps (plugin data)" was moved to the trash. Every mindmap in that library stays hidden until you restore it.

Opening the Mindmap tab in this state shows a second popup:

> Mindmap data for this library is in the trash. Nothing new was created - restore it to get your mindmaps back.

The cause is almost always that the item titled `Zotero Linked Mindmaps (plugin data)` is in the trash. Every mindmap in that library is stored in notes hanging off that item, and Zotero hides the child notes of a trashed item, so one trash action hides all of them at once. Your data is still there. Restoring the item brings it back.

Before anything else: do not empty the trash. That erases the item and its notes for good, and nothing can recover them.

### Restore the container

1. You can leave the Mindmap tab open. It writes nothing while the container is in the trash: the plugin checks the trash before creating a library's first mindmap and declines when it finds data there. Pressing New in the sidebar also creates nothing; the mindmap does not appear, and the reason goes to the debug log (Help > Debug Output Logging).
2. In Zotero's left pane, click Trash under the library whose mindmaps are missing. If you have several libraries, check each one; the warning popup does not say which library it was about.
3. Look for an item titled `Zotero Linked Mindmaps (plugin data)`. The setting that hides this item from your library does not apply to the trash view, so it is visible there whether or not that setting is on.
4. Right-click it and choose Restore to Library.
5. Restart Zotero. The startup reconciliation puts any storage note that came back at the top level under the container again, without touching its content.

### Confirm your mindmaps came back

1. Open the Mindmap tab with File > Mindmap, or press Shift+G.
2. The sidebar under the heading "Mindmaps" should list your mindmaps again, with their nodes and links intact.
3. Select an item that was on a mindmap and check the Connections panel in the item pane. It should show the mindmap and its links rather than the empty state.

Nothing was created while the container sat in the trash, so there is no leftover mindmap to clean up.

If the container was not in the trash, or restoring it changed nothing, see [When a single mindmap is missing](#symptom-one-mindmap-is-missing-the-rest-are-fine) below. If some mindmaps came back and one did not, that one's note may be corrupt; the plugin skips a storage note it cannot parse and writes the reason to Zotero's debug output (Help > Debug Output Logging).

## Symptom: one mindmap is missing, the rest are fine

This is a trashed storage note rather than a trashed container. Only the one mindmap is affected, and the popup at trash time says so:

> A mindmap's data note was moved to the trash. That mindmap stays hidden until you restore it.

That popup appears when the note goes into the trash. It is not repeated at the next startup, so a note trashed in an earlier session is missing with no message.

If the trashed note held the library's only mindmap, opening the Mindmap tab shows:

> Mindmap data for this library is in the trash. Nothing new was created - restore it to get your mindmaps back.

No replacement mindmap is made in that case. Your data stays in the trashed note.

1. Do not empty the trash.
2. Click Trash in the left pane for the library concerned.
3. Look for a note whose text starts with "This note stores structured data for the Zotero Linked Mindmaps plugin." Each mindmap has one such note. Open it to check the title of the mindmap in the JSON if you have more than one and need to tell them apart.
4. Right-click the note and choose Restore to Library.
5. Restart Zotero. The restored note may come back as a top-level note rather than under the container item; the startup reconciliation moves it back under the container without touching its content.
6. Open the Mindmap tab and check the sidebar for the mindmap.

## What not to do

Do not empty the trash before you have restored the item. This is the one action the plugin cannot undo for you. Once the container and its notes are erased, every mindmap in that library is gone, along with its nodes, links and layout. The items and notes those nodes pointed at stay in your library; the mindmap structure around them does not.

Do not remove the tag `_zoterolinkedmindmaps-container-v1` from the container item, or `_zoterolinkedmindmaps-storage-v1` from a storage note. The plugin finds its data by those tags. An untagged container makes the plugin build a new one and leave the old notes stranded; an untagged storage note stops being a mindmap as far as the plugin is concerned.

Do not edit a storage note by hand. Zotero's note editor rewrites the note's HTML when it saves, which can break the data block the plugin reads. Renaming the container item is fine, since the plugin matches on the tag, not on the title.

Do not delete the container item to tidy up your library. To keep it out of sight, use the setting described in [Hiding plugin data](hide-plugin-data-howto.md), which is on by default. When you delete a library's last mindmap, the plugin erases the container by itself.

## Related

- [Plugin data reference](plugin-data-reference.md)
- [Why mindmaps live in a Zotero note](plugin-data-explanation.md)
- [Hiding plugin data](hide-plugin-data-howto.md)
- [Managing mindmaps](mindmaps-manage-howto.md)

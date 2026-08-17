# Connections panel reference

An item-pane section headed "Connections" that shows which mindmap the selected item belongs to, lists the links touching it, and offers controls to add or remove them. The sidenav icon's tooltip reads "Connections: mindmap links for this item".

The same content is drawn in a second place: the docked panel beside the graph in the mindmap tab, under the node summary. The two mounts differ in how the add-link form is opened, noted below; everything else is the same content from the same code.

## When the section is available

Enabled for regular items and notes. Disabled for everything else, attachments included, and for the plugin's own bookkeeping: the "Zotero Linked Mindmaps (plugin data)" item and the storage notes under it are refused even though the notes are notes. Removing an item from a mindmap here never touches the Zotero item or note itself.

## Which mindmap it shows

An item can be a node in several mindmaps. The panel reads every mindmap storage note in the item's library and shows one of them:

- The docked panel in the mindmap tab shows the mindmap the graph is displaying.
- Straight after saving a link, the panel shows the mindmap that link was written to.
- Otherwise it shows the first mindmap (lowest storage note id) that holds a node for the item.

Links in the mindmaps it did not pick are not shown. There is no switcher in the panel for changing which mindmap it displays.

A storage note whose content will not parse is skipped rather than failing the whole lookup, so one corrupt mindmap does not hide the item's links in the others. Skipping is remembered: if nothing was found after a skip, the panel shows the error state rather than claiming the item is in no mindmap.

## States

Nothing at all. The selected object is neither a regular item nor a note, so the body is left empty.

"Could not read mindmap data." Either the lookup threw, or every readable mindmap was searched, one was unreadable, and none held the item. No add-link controls are offered in this state.

"Not in any mindmap yet." No mindmap holds a node for this item, and nothing was unreadable. The same message appears when the panel is pinned to one mindmap (the graph's, or the one just written to) and the item is not a node in that one, even if it is a node elsewhere. The add-link controls are offered below the message.

"No links yet." The item is a node in the shown mindmap but no link touches it. The mindmap title, the remove-node button, and the add-link controls are all present.

Links listed. One list entry per link where this item's node is either end. Each entry reads as the type label, then the name in double quotes when the link has one, then a direction arrow when it has one, then an arrow and the other end's title:

```
supports "reanalysis" → Kuhn 1962
```

The direction arrow is drawn from this item's point of view: it points right when the stored direction runs away from this item, left when it runs toward it. The second arrow is fixed and separates the link description from the other end's name.

A link whose type is no longer in the vocabulary is listed as "(unknown type)", the same label the graph draws on that link's edge. The raw stored type id is never shown.

The other end's title is a regular item's title, a note's content preview, or "(missing item)" when the node points at something no longer in the library.

## Controls

"+" in the section header, tooltip "Add link". Present in the item pane only. Expands the section if it was collapsed, then opens the add-link form.

"Add link", a button in the panel body. Present only where the panel has no section header, which today means the docked panel in the mindmap tab. Toggles the form: pressing it while the form is open hides it.

Either control writes to the mindmap the panel is showing, the one named after "Mindmap:" at the top. The panel records it on the form when it draws, so the header "+" reaches it too even though the item pane hands that button nothing but the panel body.

"Add to mindmap:" with a dropdown and a "Continue" button. Appears in place of the add-link form only when the panel has no mindmap to hand on: the item is a node in none yet and the library holds more than one. Skipped when the library has one mindmap or none, and skipped whenever the panel is already showing a mindmap. The dropdown lists mindmaps in storage order with the first one selected.

"Remove from mindmap". Removes this item's node from the shown mindmap, along with every link touching it. Afterwards the plugin reconciles cross-mindmap stubs in the library, dropping any that pointed at the removed node (see [cross-mindmap-links-reference.md](cross-mindmap-links-reference.md)). The Zotero item is untouched.

"Remove from group". Shown only when the node is in a group. Takes the node out of the group and leaves the group itself in place. See [grouping-reference.md](grouping-reference.md).

"Remove", one per listed link. Removes that link and nothing else. Both nodes stay on the mindmap.

None of the remove controls asks for confirmation.

## Failure behavior

A failed write is logged to Zotero's debug output and swallowed. The panel redraws either way and stays on the mindmap the change was aimed at, so it ends up showing what is actually stored rather than a half-applied change. Nothing appears on screen to say the write failed.

## Related

- [connections-panel-howto.md](connections-panel-howto.md)
- [links-add-reference.md](links-add-reference.md)
- [node-overview-reference.md](node-overview-reference.md) for the summary above the panel in the mindmap tab

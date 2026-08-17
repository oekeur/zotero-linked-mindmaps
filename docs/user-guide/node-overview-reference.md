# Node overview panel (the dock)

The panel on the right of the Mindmap tab, shown when you click or right-click a node. It identifies the node's Zotero item and holds the controls for its links.

The panel is 320px wide, scrolls on its own, and is hidden until a node is opened in it. Opening another node replaces its contents.

It is pinned to the mindmap the graph is showing. An item that is a node in several mindmaps shows this graph's links here, not another mindmap's.

## For a node whose item exists

Top to bottom:

| Element             | Content                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Close"             | Button. Hides the panel and clears it.                                                                                                                                                                                                                                               |
| Title               | The item's display title, in bold. For a note, the first 60 characters of its text instead, ending in an ellipsis when longer, or "(empty note)" when the note has no text.                                                                                                          |
| Item type           | Zotero's localized name for the item type, for example "Journal Article". Not shown for notes.                                                                                                                                                                                       |
| Creator             | The item's first creator, as Zotero's item list shows it. Omitted when the item has none. Not shown for notes.                                                                                                                                                                       |
| Date                | The item's date field, as stored. Omitted when empty. Not shown for notes.                                                                                                                                                                                                           |
| "Show in library"   | Button. Selects the item in the Library tab, which switches Zotero away from the Mindmap tab.                                                                                                                                                                                        |
| Connections content | The same component as the item pane's Connections section: the mindmap's title, "Remove from mindmap", "Remove from group" when the node is in one, the node's links each with a "Remove" button, and "Add link". See [Connections panel reference](connections-panel-reference.md). |

The three fields are the ones Zotero's own item list shows as columns (type, creator, date), chosen for telling nodes apart rather than for reading the item. The full item pane is one "Show in library" click away.

Clicking a node opens the panel without opening the link form. Right-clicking a node and choosing "Add link" opens the panel with the link form already open.

## For a node whose item is missing

When the Zotero item or note behind the node no longer exists, the panel shows one line reading "(missing item)" and nothing else. No title, no fields, no "Show in library", no "Close", and no link controls.

That is the same wording the node itself carries on the graph, so the two read as one situation rather than two failures.

Reaching this state means the item was deleted or erased while the node stayed behind. Remove the node from the mindmap through the item pane's Connections section, or restore the item from Zotero's trash and reopen the mindmap.

## Closing

"Close" hides the panel and empties it. There is no second gesture for closing: right-clicking a node opens the link menu, so closing needs a control of its own.

The panel also closes when you switch to a different mindmap in the sidebar.

## Known limits

The panel has no controls of its own for editing the item. It reads Zotero's fields and does not write them.

The panel does not check Zotero's trash. It either finds the item behind the node and shows it, or does not and shows "(missing item)"; a trashed item is not called out as trashed.

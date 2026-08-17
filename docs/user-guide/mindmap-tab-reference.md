# Mindmap tab reference

The Mindmap tab is a main-window Zotero tab that shows one mindmap at a time. It has three areas side by side: the mindmap list on the left, the graph in the middle, the node panel (the dock) on the right.

## Opening and closing

| Route                | Detail                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| File menu, "Mindmap" | Registered per main window. Present in every open Zotero window.                                                                                    |
| Shift+G              | Ignored while focus is in a text input, a textarea, or any editable element, so typing a capital G in a note or a search box does not open the tab. |

Only one Mindmap tab exists at a time. Invoking either route while the tab is open selects the existing tab instead of adding a second one.

The tab closes like any Zotero tab, with its close button or Zotero's own tab shortcuts. Closing it unhooks the graph's refresh observer and forgets which mindmap was loaded; reopening starts from the first mindmap in the list again. The plugin also closes the tab when it shuts down (on disable or on Zotero exit).

Opening the tab in a library that holds no mindmap creates one, titled "Mindmap", so the tab lands on a usable graph rather than on an empty state.

## Sidebar (mindmap list)

Headed "Mindmaps". Lists every mindmap in the library, ordered by the Zotero item id of the storage note behind each one. On the device where they were created that is creation order, oldest first; a mindmap arriving by sync takes an id from when it was downloaded, so the order can differ between devices.

Each row shows the mindmap's title, its description underneath in smaller grey text when it has one, and two buttons:

| Control          | Effect                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Row body (click) | Loads that mindmap into the graph. The row is highlighted while it is the loaded one.                                               |
| "Edit"           | Replaces the list with the title/description form for that row. Does not load the mindmap.                                          |
| "Delete"         | Asks for confirmation, then erases that mindmap. See [managing mindmaps](mindmaps-manage-howto.md).                                 |
| "New"            | Below the last row. Replaces the list with an empty title/description form.                                                         |
| `‹` / `›`        | Collapses the sidebar to a 28px bar, or expands it back to 220px. Tooltip reads "Hide the mindmap list" or "Show the mindmap list". |

Edit and Delete act on the row they sit in, not on the mindmap currently loaded in the graph. Editing a mindmap you are not looking at leaves the graph where it was.

The collapsed state is stored in the preference `extensions.zotero.zoterolinkedmindmaps.sidebarCollapsed` and survives restarts. With no preference set, the sidebar starts expanded. Collapsed, the sidebar shows only the toggle; the rows, the "New" button and the heading are all gone until you expand it again.

### Mindmap form

Shown in place of the list, not in a separate window. Fields: "Title" and "Description (optional)". Buttons: "Save" and "Cancel".

Saving with a blank title does nothing at all: the form stays open and no message appears. Cancel discards the form and brings the list back.

### Empty state

With no mindmaps in the library, the graph area shows "No mindmaps yet. Create one to start linking items." You reach this by deleting every mindmap while the tab is open, since opening the tab creates one when none exists.

### Load failure

When the mindmap cannot be read (its storage note is corrupt, or the id no longer resolves), the graph area shows `Failed to load mindmap:` followed by the underlying reason instead of a graph.

## Graph canvas

Rendered with Cytoscape. Node positions come from the stored document and are never recomputed for nodes that already have one. See [node layout](node-layout-reference.md).

### Nodes

| Kind                               | Appearance                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Item or note in this mindmap       | Blue-filled circle, 50px, solid border, label centred and wrapped.                                                |
| Node borrowed from another mindmap | Same shape and size, paler fill, dashed blue border. See [cross-mindmap links](cross-mindmap-links-reference.md). |
| Group                              | Dashed round rectangle drawn behind its members, label above them. See [grouping](grouping-reference.md).         |

Node labels: a regular item shows its display title; a note shows the first 60 characters of its text, ending in an ellipsis when it is longer, or "(empty note)" when the note has no text; a node whose Zotero item no longer exists shows "(missing item)".

### Edges

Every link is drawn with a text label: the link type's label, or `type: name` when the link has a name.

| Link kind                        | Line                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| Directional type                 | Dashed, triangular arrowhead at the target.                       |
| Non-directional type             | Solid, no arrowhead.                                              |
| Type no longer in the vocabulary | Dotted grey, labelled "(unknown type)" or "(unknown type): name". |
| Parent/child tie                 | Light dotted grey, thin, unlabelled, no arrowheads.               |

Parent/child ties are not links. They are drawn between a Zotero item's node and the node of one of its own child notes when both are on the mindmap, recomputed from Zotero's data on every render. Nothing stores them and nothing can author or remove them directly; they appear and disappear as you add or remove the two ends.

Two or more links between the same pair of nodes are fanned out around each other rather than drawn on top of one another. A link from a node to itself is not offered by the link form.

### Mouse and keyboard

| Gesture                                                  | Effect                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Click a node                                             | Opens that node in the dock.                                                                  |
| Drag a node                                              | Moves it and saves the new position. See [node layout](node-layout-reference.md).             |
| Right-click a node                                       | Opens a one-entry menu, "Add link", which docks the node and opens the link form in one step. |
| Right-click empty canvas with two or more nodes selected | Opens a menu with "Group selected nodes".                                                     |
| Right-click a group's region                             | Opens a menu with a name field, "Rename group" and "Ungroup".                                 |
| Click anywhere                                           | Closes an open menu.                                                                          |
| Shift-click, or Shift-drag on empty canvas               | Cytoscape's own selection: adds nodes to the selection, or box-selects several.               |
| Drag empty canvas, scroll wheel                          | Cytoscape's own pan and zoom.                                                                 |

A drag never also counts as a click, so repositioning a node does not open it in the dock.

Right-clicking a group's region does not open the "Add link" menu, and right-clicking a node does not open the grouping menu. Each gesture means one thing at a time.

Nothing here has a keyboard equivalent. Grouping, linking and inspection are mouse-driven.

## Dock (node panel)

Hidden until you click or right-click a node. Fixed 320px wide on the right of the tab, scrolls independently.

It holds a read-only overview of the node's item on top of the Connections content for that item. Full field list and controls: [node overview reference](node-overview-reference.md). The links half is the same component as the item pane's Connections section: [Connections panel reference](connections-panel-reference.md).

The dock is pinned to the mindmap the graph is showing, so an item that appears in several mindmaps shows this graph's links rather than another mindmap's.

## Live refresh

The graph watches the Zotero note its mindmap is stored in and redraws when that note changes, whether the change came from this tab, the Connections panel, the library right-click menu, or a sync landing an edit from another device. The redraw is a full rebuild, not a partial update.

Redraws are skipped when the stored mindmap already matches what is on screen, which is why dragging a node does not make the graph flash.

Switching mindmaps in the sidebar unhooks the previous graph's observer, so only the mindmap you are looking at is being watched.

## Known limits

Writes made by the graph (dragging a node, grouping, ungrouping, renaming a group) report failure only to Zotero's debug output. When one fails, the graph redraws from what was actually stored, so the change reverts on screen with no message.

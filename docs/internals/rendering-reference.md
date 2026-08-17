# Rendering reference

`src/modules/mindmap/graphRenderer.ts` turns a `MindmapDocument` into a Cytoscape graph inside the mindmap tab, wires the pointer gestures the graph answers to, and keeps the drawn graph in step with the storage note.

The layout is always Cytoscape's `preset`: positions come from the document and no force-directed pass runs at render time. Placing nodes that have no position yet is [`layoutUnplacedNodes`](layout-reference.md), called by the tab after `renderMindmap` returns.

For the reasoning behind the visual encoding and the refresh mechanism, see [rendering-explanation.md](rendering-explanation.md). For the browser-global and container constraints Cytoscape imposes inside Zotero, see [cytoscape-explanation.md](cytoscape-explanation.md).

## Exported constants

### `UNKNOWN_TYPE_LABEL`

```ts
export const UNKNOWN_TYPE_LABEL = "(unknown type)";
```

Label text `resolveLinkVisual` returns when a link's `typeId` has no entry in the link-type vocabulary. Used alone when the link has no `name`, and as the prefix `"(unknown type): <name>"` when it does.

### `EXTERNAL_NODE_CLASS`

```ts
export const EXTERNAL_NODE_CLASS = "external-node";
```

Cytoscape class put on a node whose `membership` is `"external"` (a node borrowed from another mindmap). The stylesheet selector `node.external-node` gives it a paler fill (`#eef3fa`), a dashed border (`#7aa7d9`, width 2), and leaves shape and size untouched.

### `GROUP_NODE_CLASS`

```ts
export const GROUP_NODE_CLASS = "node-group";
```

Cytoscape class put on every compound node built from a `MindmapGroup`. The selector `node.node-group` draws a round-rectangle with a 0.6-opacity `#f2f4f7` fill, a dashed `#aab4c2` border, 14px padding, and the group name above the cluster (`text-valign: top`).

### `PARENT_CHILD_TIE_CLASS`

```ts
export const PARENT_CHILD_TIE_CLASS = "parent-child-tie";
```

Cytoscape class on edges produced by `buildParentChildTies`. The selector `edge.parent-child-tie` draws a dotted `#ddd` line of width 1, with `label: ""` and no arrowheads at either end.

### `NODE_MENU_ADD_LINK_CLASS`

```ts
export const NODE_MENU_ADD_LINK_CLASS = "mindmap-node-menu-add-link";
```

DOM class added to the "Add link" button inside the node context menu. Tests query the graph container for `.mindmap-node-menu-add-link` to find that button.

### `GROUP_MENU_CLASS`

```ts
export const GROUP_MENU_CLASS = "mindmap-group-menu";
```

DOM class on the popup menu element the renderer appends to the Cytoscape container. Both the node context menu and the grouping menus use it, and the internal `closeMenu` removes every `.mindmap-group-menu` under the container.

## Link visuals

### `LinkVisual`

```ts
export interface LinkVisual {
  label: string;
  classes: "directional" | "undirectional" | "unknown-type";
}
```

What one link contributes to its edge element: the text drawn along the edge, and the single Cytoscape class that selects its line style. The three class values map to stylesheet rules `edge.directional` (dashed line, triangle target arrow), `edge.undirectional` (solid line, no arrow), and `edge.unknown-type` (dotted `#999` line, no arrow).

### `resolveLinkVisual`

```ts
export function resolveLinkVisual(
  link: MindmapLink,
  typeMap: Map<string, LinkType>,
): LinkVisual;
```

Resolves a link's display label and style class against a link-type vocabulary.

`link` is the stored link; only `typeId` and `name` are read. `typeMap` maps type id to [`LinkType`](../user-guide/link-types-reference.md); `renderMindmap` builds it from the `linkTypes` array it was passed.

Returns a `LinkVisual`. With a matching type, `label` is the type's `label`, or `"<type label>: <link name>"` when the link has a name, and `classes` is `"directional"` or `"undirectional"` from `type.directional`. With no matching type, `label` is `UNKNOWN_TYPE_LABEL`, or `"(unknown type): <link name>"` when the link has a name, and `classes` is `"unknown-type"`.

No side effects. Never throws on an unresolved `typeId`: a type deleted from settings leaves live links pointing at it, and those links still render.

### `computeParallelOffsets`

```ts
export function computeParallelOffsets(
  links: MindmapLink[],
): Map<string, number>;
```

Computes the bezier control-point distance for each link so that several links between the same node pair draw as separate curves.

Groups links by the unordered pair `[sourceNodeId, targetNodeId].sort().join("::")`, so a reverse-direction link between the same two nodes lands in the same group. Within a group, links are sorted by `id` with `localeCompare`, and link `i` of `n` gets `40 * (i - (n - 1) / 2)`. The step constant is module-private (`PARALLEL_EDGE_STEP = 40`).

Returns a map from link id to offset. A pair with one link gets `0`, so the common case draws unchanged. A self-link (`source === target`) is alone in its own pair group and also gets `0`; Cytoscape loop edges do not respond to `control-point-distances`, and the source leaves that case as-is rather than special-casing it.

No side effects. The stylesheet reads the value through `"control-point-distances": "data(parallelOffset)"` on the base `edge` selector, with `control-point-weights: 0.5`.

Contracts the tests pin down that the source does not state outright: two parallel links come out at `-20` and `+20`, three at `-40`, `0`, `+40`; ordering is by link id rather than array order, so a live-refresh rebuild reproduces the same arrangement; links between different pairs both get `0`.

### `buildParentChildTies`

```ts
export function buildParentChildTies(
  nodes: MindmapNode[],
): cytoscape.EdgeDefinition[];
```

Builds the faint connectors between an item node and its own child-note nodes, for pairs where both are on the mindmap.

Resolves every node's ref through [`resolveZoteroItem`](node-labels-reference.md); nodes whose Zotero item is gone are skipped. Notes go into one list, everything else into a map from Zotero item id to mindmap node id. For each note node with a `parentItemID` present in that map, emits an edge with `data.id` of `` `tie:${parentNodeId}:${nodeId}` ``, `data.source` the parent's node id, `data.target` the note's node id, `data.parallelOffset` of `0`, and `classes` of `PARENT_CHILD_TIE_CLASS`.

Returns the edge definitions, possibly empty. A child note whose parent is not on the mindmap gets no tie, and neither does a standalone note or an item with no child notes on the graph.

No side effects and nothing persisted: ties are recomputed on every render from Zotero's parent/child data and never touch `doc.links`. Tie edge data carries no `label` key at all, which the tests assert directly.

## Dock and gesture handlers

### `showNodeInDock`

```ts
export function showNodeInDock(
  dockContainer: HTMLElement,
  ref: ZoteroObjectRef,
  mindmapId?: string,
  openAddLink = false,
): void;
```

Fills the docked panel beside the graph with one node's item.

Sets `dockContainer.style.display = ""` and clears its content. Resolves `ref` through `resolveZoteroItem`. When the item is gone, calls `renderMissingItem(dockContainer)` and returns, so a stale ref shows the missing-item state rather than leaving whatever the dock last held. Otherwise calls `renderNodeOverview` with a "show in library" callback (`Zotero.getActiveZoteroPane().selectItem(item.id)`, awaited) and a close callback that hides and empties the dock, then appends a fresh `div` and starts `renderConnectionsContent(connections, item, mindmapId, openAddLink)` without awaiting it.

`mindmapId` pins the Connections content to one mindmap, so a node that appears in several shows this graph's links. `openAddLink` reveals the add-link form as part of the same render.

Returns nothing. The DOM it produces comes from [`renderNodeOverview`](../user-guide/node-overview-reference.md) and carries `OVERVIEW_CLASS` (`mindmap-node-overview`), `SHOW_IN_LIBRARY_CLASS` (`mindmap-show-in-library`) and `CLOSE_CLASS` (`mindmap-dock-close`), all exported from `nodeOverview.ts`.

### `attachNodeClickHandler`

```ts
export function attachNodeClickHandler(
  cy: cytoscape.Core,
  nodeRefsById: Map<string, ZoteroObjectRef>,
  dockContainer?: HTMLElement,
  mindmapId?: string,
): void;
```

Registers a `tap` handler on nodes that fills the dock. Cytoscape emits `tap` on pointer-up only when the gesture was not a drag, so a click never fires alongside a reposition.

Ignores a target whose `data("isGroup")` is truthy: a group container is a node to Cytoscape but has no item behind it. Ignores a node id with no entry in `nodeRefsById`. With no `dockContainer`, the handler does nothing at all; a headless render or a test has nowhere to draw.

Returns nothing; the side effect is the registered handler and, when it fires, `showNodeInDock`. Selecting the item in the library is deliberately not part of a tap, which would switch Zotero away from the mindmap tab. The test asserts `Zotero_Tabs.selectedIndex` is unchanged after a tap.

### `RenderedState`

```ts
export interface RenderedState {
  document: string | null;
}
```

What one rendered graph believes is stored, as the serialized document string from `serializeDocument`. `renderMindmap` writes the document it drew into it, `persistNodePositions` writes the document it is about to save, and `attachLiveRefresh` compares a freshly read document against it and skips the rebuild when they match.

One box per rendered graph rather than one per module: two tabs render two graphs over two documents, and a shared box would let one graph's write suppress the other's refresh. The tests cover both directions, that a graph does not rebuild for its own drag write, and that a second graph still does.

### `attachNodeDragHandler`

```ts
export function attachNodeDragHandler(
  cy: cytoscape.Core,
  mindmapId: string,
  rendered: RenderedState = { document: null },
): void;
```

Persists where dragged nodes land.

Registers a `dragfree` handler on nodes. Each event copies the node's `x`/`y` into a pending map and schedules a microtask flush; a gesture moving N selected nodes emits N `dragfree` events in one tick and produces one flush. The flush calls the module-private `persistNodePositions`, which goes through [`updateMindmapDocument`](storage-reference.md) rather than a read/write pair, writes only nodes whose coordinates actually changed, returns `null` from the mutator (writing nothing) when none did, and records the serialized result into `rendered.document` before the write resolves. A failed write is caught and reported through `Zotero.debug` with the prefix `[zoteroLinkedMindmaps]`.

Returns nothing. Reading `node.position()` copies the coordinates out rather than storing the object Cytoscape hands back, which Cytoscape owns and mutates.

### `attachNodeContextMenuHandler`

```ts
export function attachNodeContextMenuHandler(
  cy: cytoscape.Core,
  nodeRefsById: Map<string, ZoteroObjectRef>,
  dockContainer: HTMLElement,
  mindmapId?: string,
): void;
```

Registers a `cxttap` handler on nodes that opens the link-creation menu at the click point.

Ignores group containers (`data("isGroup")`) and node ids with no ref. Otherwise builds a menu `div` with class `GROUP_MENU_CLASS`, appended to `cy.container()` and absolutely positioned at `evt.renderedPosition`, and appends one button through [`appendL10nButton`](ui-elements-reference.md) with the Fluent id `add-link-button` plus the class `NODE_MENU_ADD_LINK_CLASS`. Clicking it closes the menu and calls `showNodeInDock(dockContainer, ref, mindmapId, true)`, docking the node with the add-link form already open.

Right-click alone does not dock the node; the tests assert the dock stays hidden until the menu action is used. Cytoscape registers its own `contextmenu` preventDefault on the container and removes it on destroy, so this handler adds none: a per-render listener would outlive every rebuild, since the container is reused.

Returns nothing.

### `attachGroupingHandlers`

```ts
export function attachGroupingHandlers(
  cy: cytoscape.Core,
  mindmapId: string,
): void;
```

Registers the grouping menus, driven from right-click. See [grouping-reference.md](../user-guide/grouping-reference.md) for the user-facing behavior.

Three handlers:

A `cxttap` on the core itself (`evt.target === cy`) collects `node:selected` minus group containers. With fewer than two selected it closes any open menu and returns. With two or more it opens a menu holding one button, Fluent id `mindmap-group-create`, that calls [`createGroup`](mutations-reference.md) with the selected ids.

A `cxttap` on a node whose `data("isGroup")` is truthy opens a menu holding a text `input` prefilled with the group's current label, plus buttons `mindmap-group-rename` (calls `renameGroup` with the trimmed field value) and `mindmap-group-delete` (calls `deleteGroup`).

A `tap` on anything closes the open menu.

Every mutation runs through a shared `apply` helper that closes the menu, calls `updateMindmapDocument(mutate, mindmapId)`, and reports a failure through `Zotero.debug`. Nothing redraws directly: the write fires a modify notification and `attachLiveRefresh` rebuilds from what was stored.

The menu element stops `mousedown` from propagating. Without that, Cytoscape's container `mousedown` handler calls `preventDefault` (the rename field can then never take focus) and arms the capture flag its window-level `mouseup` handler needs to emit `tap`, and the `tap` handler above would remove the menu during `mouseup`, before the button's own `click` is dispatched.

Returns nothing.

## Rendering and refresh

### `renderMindmap`

```ts
export async function renderMindmap(
  container: HTMLElement,
  doc: MindmapDocument,
  linkTypes: LinkType[],
  dockContainer?: HTMLElement,
  rendered: RenderedState = { document: null },
): Promise<cytoscape.Core>;
```

Builds the Cytoscape instance for one document and wires every handler above.

Before constructing anything it shims a `<head>` onto the container's document when there is none (Zotero's main chrome window is XUL, and Cytoscape's canvas renderer does `document.head.insertBefore(...)` on init), and calls [`ensureCytoscapeWindowGlobals`](polyfills-reference.md) with the container's `defaultView`.

Elements are built in a fixed order. Group containers come first, because Cytoscape needs a parent to exist before the children naming it; a group with no member nodes is skipped rather than drawn as an empty region. Node elements follow, each carrying `id`, `label` from [`resolveNodeLabel`](node-labels-reference.md), an `unplaced` flag (true when the stored position is unplaced, or when the node is in [`piledNodeIds`](schema-reference.md)), a `parent` key when the node has a `groupId`, a copied position (`{x: 0, y: 0}` when unplaced), and `EXTERNAL_NODE_CLASS` for external nodes. Edges come next: real links first, then parent-child ties, so an authored link between the same parent and child paints above the plain tie and keeps its label.

Group containers are given no position (supplying one under a preset layout would override Cytoscape's auto-fit to their children) and `grabbable: false` (dragging a container would carry every member along and rewrite positions the user set).

After construction it records `serializeDocument(doc)` into `rendered.document`, observes the container with the host window's `ResizeObserver` (calling `cy.resize()` on every change, disconnecting on `cy`'s `destroy` event), and attaches the click, drag and grouping handlers. The context-menu handler is attached only when a `dockContainer` was passed.

Returns the `cytoscape.Core`. The caller is responsible for calling `layoutUnplacedNodes` afterwards; `renderMindmap` never lays out.

The container must establish a positioning context (`position: relative`); the tab sets it on `#zoterolinkedmindmaps-mindmap-container`, and every test that renders a real graph sets it too. See [cytoscape-explanation.md](cytoscape-explanation.md).

### `attachLiveRefresh`

```ts
export function attachLiveRefresh(
  cy: cytoscape.Core,
  container: HTMLElement,
  storageNoteItemID: number,
  linkTypes: LinkType[],
  dockContainer?: HTMLElement,
  rendered: RenderedState = { document: null },
): () => void;
```

Keeps the drawn graph in step with the storage note without a plugin reload.

Registers a `Zotero.Notifier` observer over `["item"]` under the id `zoterolinkedmindmaps-mindmap-live-refresh`. The observer ignores everything but a `modify` on `item` whose id list contains `storageNoteItemID`, then schedules a rebuild.

A rebuild reads the note by item id (never by an id-less mindmap lookup, which would resolve to whichever mindmap sorts first), calls `refreshNote` before reading because the notification arrives while Zotero's cache may still lag, and compares `serializeDocument(doc)` against `rendered.document`. Equal means the graph already shows this, and nothing redraws. Otherwise it destroys the current instance, calls `renderMindmap` with the same container, link types, dock and state box, and then `layoutUnplacedNodes`. Failures are caught and reported through `Zotero.debug`.

Scheduling runs one rebuild at a time and runs another straight after when a notification arrived while the first was in flight, so a prune that lands mid-rebuild is not dropped.

The observer's `notify` returns `void` and must keep doing so. Zotero awaits each observer's return value inside the DB transaction commit that fired the notification, and the storage write runs inside a queued task; awaiting a rebuild there wedges the storage queue for the rest of the session. See [notifier-queue-explanation.md](notifier-queue-explanation.md).

Returns a teardown function that unregisters the observer and destroys the currently rendered instance. The tab calls it before loading a different mindmap.

## Related

- [rendering-explanation.md](rendering-explanation.md), the design reasoning behind these visuals and the refresh loop
- [layout-reference.md](layout-reference.md), how an unplaced node gets a position
- [node-labels-reference.md](node-labels-reference.md), how a node's text is derived
- [ui-elements-reference.md](ui-elements-reference.md), `appendL10nButton` and `appendMindmapOptions`
- [schema-reference.md](schema-reference.md) and [storage-reference.md](storage-reference.md), the document being drawn and where it lives
- [../user-guide/mindmap-tab-reference.md](../user-guide/mindmap-tab-reference.md), the tab this renders into

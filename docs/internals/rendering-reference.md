# Rendering reference

`src/modules/mindmap/graphRenderer.ts` turns a `MindmapDocument` into a Cytoscape graph inside the mindmap tab, wires the pointer gestures the graph answers to, and keeps the drawn graph in step with the storage note.

The layout is always Cytoscape's `preset`: positions come from the document and no force-directed pass runs at render time. Placing nodes that have no position yet is [`layoutUnplacedNodes`](layout-reference.md), called by the tab after the graph is painted.

For the reasoning behind the visual encoding and the refresh mechanism, see [rendering-explanation.md](rendering-explanation.md). For the browser-global and container constraints Cytoscape imposes inside Zotero, see [cytoscape-explanation.md](cytoscape-explanation.md).

## Exported constants

`UNKNOWN_TYPE_LABEL` (`"(unknown type)"`) is not one of them. It lives in `linkTypes.ts` and is imported here. `resolveLinkVisual` returns it as the label when a link's `typeId` has no entry in the link-type vocabulary: alone when the link has no `name`, and as the prefix `"(unknown type): <name>"` when it does. The Mindmaps section imports the same constant for its own link rows, so a link whose type was deleted reads identically on the graph and in the item pane, which is what the type-deletion confirmation ("... will show as \"(unknown type)\" there") promises.

### `EXTERNAL_NODE_CLASS`

```ts
export const EXTERNAL_NODE_CLASS = "external-node";
```

Cytoscape class put on a node whose `membership` is `"external"` (a node borrowed from another mindmap). The stylesheet selector `node.external-node` gives it a paler fill (`#eef3fa`), a dashed border (`#7aa7d9`, width 2), and leaves shape and size untouched.

### `GROUP_OVERLAY_CLASS`, `GROUP_REGION_CLASS`, `GROUP_PIP_CLASS`

```ts
export const GROUP_OVERLAY_CLASS = "mindmap-group-overlay";
export const GROUP_REGION_CLASS = "mindmap-group-region";
export const GROUP_PIP_CLASS = "mindmap-group-pip";
export const GROUP_HUE_COUNT = 6;
```

Classes on the SVG a group's region is drawn into, from `groupOverlay.ts`. One
`.mindmap-group-overlay` SVG per graph, holding one
`.mindmap-group-region` `<g>` per non-empty group, tagged with
`data-group-id`, plus one `.mindmap-group-pip` circle per membership per node,
tagged with `data-node-id`. Colour comes from `zoteroPane.css`, not from
`buildStylesheet`: the overlay is DOM, so the canvas exception does not apply
to it.

Each group takes a hue from Zotero's accent tokens, indexed by the group's
position in `doc.groups` modulo `GROUP_HUE_COUNT`, and both its region and its
pips carry it as a `-<n>` suffix class (`.mindmap-group-region-2`,
`.mindmap-group-pip-2`). The index comes from the document rather than from the
drawn list, so an empty group opening or closing a gap does not recolour every
group after it. The region fill takes its alpha from CSS (`fill-opacity`)
because the accent tokens are opaque, unlike the `--fill-*` ramp the region
used while every group drew in one neutral colour.

The pips are what make a shared node decodable. Two region fills that overlap
composite to a third colour naming neither group; a pip is drawn outside any
region at full opacity, so its hue never mixes with what it sits on.

Opacity sits on the region `<g>` with opaque children inside, so a halo and the
band meeting it composite once. Per-shape opacity doubles the alpha along every
join and draws seams that mean nothing.

The overlay is inserted before Cytoscape's own canvas container rather than
given a negative z-index. That container is `position: relative; z-index: 0`
(`cytoscape.cjs.js:35030`), so at the same stacking level document order is
what puts the region underneath. It carries `pointer-events: none`.

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

`mindmapId` pins the Mindmaps content to one mindmap, so a node that appears in several shows this graph's links. `openAddLink` reveals the add-link form as part of the same render.

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

Ignores a node id with no entry in `nodeRefsById`, and ignores a tap carrying a modifier key, which means the user is building a multi-select rather than opening something. With no `dockContainer`, the handler does nothing at all; a headless render or a test has nowhere to draw.

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

Registers a `dragfree` handler on nodes. Each event copies the node's `x`/`y` into a pending map and schedules a microtask flush; a gesture moving N selected nodes emits N `dragfree` events in one tick and produces one flush. The flush calls the module-private `persistNodePositions`, which goes through [`updateMindmapDocument`](storage-reference.md) rather than a read/write pair, writes only nodes whose coordinates actually changed, returns `null` from the mutator (writing nothing) when none did, and records the serialized result into `rendered.document` before the write resolves. A failed write is caught and reported through `logFailure` with the prefix `[zoteroLinkedMindmaps]`.

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

Ignores node ids with no ref. Otherwise builds a menu `div` with class `GROUP_MENU_CLASS`, appended to `cy.container()` and positioned beside the node, and appends one button through [`appendL10nButton`](ui-elements-reference.md) with the Fluent id `add-link-button` plus the class `NODE_MENU_ADD_LINK_CLASS`. Clicking it closes the menu and calls `showNodeInDock(dockContainer, ref, mindmapId, true)`, docking the node with the add-link form already open.

When the right-clicked node is itself part of a selection of two or more, a second button follows with the Fluent id `mindmap-group-create`, calling [`createGroup`](mutations-reference.md) with the selected ids. Grouping rides this handler rather than the empty-canvas one so that right-clicking an unselected node while others are selected stays unambiguous: Add link only.

Right-click alone does not dock the node; the tests assert the dock stays hidden until the menu action is used. Cytoscape registers its own `contextmenu` preventDefault on the container and removes it on destroy, so this handler adds none: a per-render listener would outlive every rebuild, since the container is reused.

Returns nothing.

### `attachGroupingHandlers`

```ts
export function attachGroupingHandlers(
  cy: cytoscape.Core,
  mindmapId: string,
  overlay?: GroupOverlay,
  groupNames?: Map<string, string>,
): void;
```

Registers the grouping menu, driven from right-click on the canvas. See [grouping-reference.md](../user-guide/grouping-reference.md) for the user-facing behavior.

Two handlers:

A `cxttap` on the core itself (`evt.target === cy`) tests two conditions and appends the controls for each that holds. Two or more selected nodes gets a button with the Fluent id `mindmap-group-create`, calling [`createGroup`](mutations-reference.md) with the selected ids. A click landing inside a region gets a text `input` prefilled from `groupNames`, plus `mindmap-group-rename` (calls `renameGroup` with the trimmed field value) and `mindmap-group-delete` (calls `deleteGroup`). Both conditions can hold at once, and then all three controls appear rather than the handler picking a mode on the user's behalf. When neither holds it closes any open menu and returns.

Which group a click landed in comes from `overlay.hitTest(evt.position)`, not from the event target. A group used to be a Cytoscape node, so rename and delete could hang off right-clicking it; the region is drawn rather than laid out, so there is no node to hit and the position is tested against the region geometry instead. `hitTest` answers with the smallest region containing the point, so a click inside two overlapping regions reaches the more specific one. Without an `overlay` the region half is simply never offered.

A `tap` on anything closes the open menu.

Every mutation runs through a shared `apply` helper that closes the menu, calls `updateMindmapDocument(mutate, mindmapId)`, and reports a failure through `logFailure`. Nothing redraws directly: the write fires a modify notification and `attachLiveRefresh` rebuilds from what was stored.

The menu element stops `mousedown` from propagating. Without that, Cytoscape's container `mousedown` handler calls `preventDefault` (the rename field can then never take focus) and arms the capture flag its window-level `mouseup` handler needs to emit `tap`, and the `tap` handler above would remove the menu during `mouseup`, before the button's own `click` is dispatched.

Returns nothing.

## View toolbar and legend

Both are DOM overlays positioned inside the graph container, not Cytoscape elements, so neither is part of the graph model and neither can be selected, dragged or exported with it.

The toolbar sits top right and carries zoom out, zoom in, fit-to-window, and a legend toggle. Zoom and fit act on the Cytoscape viewport only (`cy.zoom`, `cy.fit`); nothing here writes a node position, and a test asserts that fitting leaves every stored position untouched. That matters because the layout is `preset` and the arrangement belongs to the user.

The legend sits bottom left and lists every style the renderer can produce, each drawn as a small inline SVG sample rather than described in words: a directional link, an undirected link, an unknown-type link, the parent-child tie, an external node, a group region, and the dots naming a node's groups. Seven rows, held in the module-level `LEGEND_ROWS` array beside the stylesheet they mirror, so a style added there is a visible gap here rather than a silent one. A test asserts the row count, which is what makes adding a style without its row fail rather than pass quietly. Its shown state persists in the `legendCollapsed` preference (see [prefs-reference.md](prefs-reference.md)) and is never written to the mindmap document.

## The graph area

`src/modules/mindmap/graphArea.ts` is the one painter for the mindmap tab's graph container and its node dock. `createGraphArea(container, dock)` returns a `GraphArea`; the tab creates one per tab and hands it to `attachLiveRefresh`. For why it exists, see [rendering-explanation.md](rendering-explanation.md).

### Claim and paint

| Member                          | Behaviour                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim(owner)`                  | Takes the area for `"tab"` or `"live"` and supersedes every earlier claim. Returns a `Claim` (`owner`, `id`).                                                                                             |
| `isCurrent(claim)`              | True while no later claim exists.                                                                                                                                                                         |
| `paint(claim, kind, build, o?)` | Refused (returns `undefined`, DOM untouched) when `claim` is superseded. Otherwise disposes the current content, empties the container, hides and empties the dock, then runs `build` on a fresh element. |
| `clear(claim)`                  | Same refusal rule. Disposes the content and empties the container and the dock. Returns whether it ran.                                                                                                   |
| `current()`                     | `{ owner, kind }` of the latest claim and of what is on screen.                                                                                                                                           |
| `dockPort`                      | `write(fn)` runs `fn(dock)` only while `kind` is `"graph"`, and returns whether it ran.                                                                                                                   |

A writer claims at the moment it decides to write and paints with that claim. A claim taken while an earlier writer is still awaiting makes that writer's later paint a no-op, so the newest decision wins whatever order the awaits resume in. A paint runs synchronously from dispose to build, so nothing interleaves between removing the old content and recording the new.

`kind` is `"graph"`, `"failed"`, `"empty"`, `` `panel:${view}` `` (the live observer's panels), or `` `tab-state:${reason}` `` (the tab's empty-registry states). `build` may return an object with `dispose()`; the area calls it on the next paint or clear. `renderMindmapInto` returns such a handle.

`PaintOptions`:

- `keepDock` leaves the dock as it is. Only the live observer passes it, when it rebuilds a graph over a graph.
- `onError` names a `kind` and a `build` that run under the same claim when the main `build` throws. The area empties what the failed build left (dock included, whatever `keepDock` said), paints the fallback, then rethrows the original error for the caller to report. A paint never ends on a blank.

### Mounts

Only `kind` `"graph"` gets a per-render mount: a `div.mindmap-graph-mount` (`MOUNT_CLASS`) with `width: 100%; height: 100%; min-width: 0; position: relative`, attached before `build` runs so Cytoscape measures a live element. Every other kind gets a plain `div.mindmap-graph-state` (`STATE_CLASS`).

The mount exists because Cytoscape's `destroy()` calls the renderer's `destroyRenderer`, which empties the element the instance was built in (`node_modules/cytoscape/dist/cytoscape.cjs.js`, `destroyRenderer`, near line 15888). Built straight into the shared container, disposing one instance would erase whatever a neighbour had painted there. The toolbar, legend, context menu and group overlay are appended inside the mount, so `MindmapHandle.dispose()` (destroy the instance, then `mount.remove()`) takes them with it.

### Writers

Every write to the container or the dock goes through the area. Line numbers are in `src/modules/mindmap/`.

| Writer                                      | Owner  | Where                                              | Claim and paint                                                                                                                                                      |
| ------------------------------------------- | ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab load, graph                             | `tab`  | `mindmapTab.ts:194`, paint at `:205`               | `takeArea()` after the mindmap resolved, then paints `"graph"` with an `onError` fallback of kind `"failed"`.                                                        |
| Tab load, failed paragraph (resolve failed) | `tab`  | `mindmapTab.ts:186-190`                            | `takeArea()` then paints `"failed"` with `writeFailure`. Skipped when `graphOwnsArea()`, so a live graph survives a stale row.                                       |
| Tab load, build-failure fallback            | `tab`  | `mindmapTab.ts:214-217`                            | `onError` of the graph paint: `"failed"` paragraph under the same claim. `load` logs the rethrown error and returns false.                                           |
| `paintEmptyRegistry`                        | `tab`  | `mindmapTab.ts:267-277`                            | `takeArea()` then paints `"empty"` or `` `tab-state:${reason.kind}` ``. Not called while a live graph shows (`graphOwnsArea()`).                                     |
| Tab teardown                                | `tab`  | `mindmapTab.ts:759`                                | `area.clear(takeArea())`.                                                                                                                                            |
| Live observer, attach                       | `live` | `graphRenderer.ts:1530`                            | Takes the first claim when `attachLiveRefresh` runs. It paints nothing itself.                                                                                       |
| Live graph rebuild                          | `live` | `graphRenderer.ts:1682` (claim), `:1737` (paint)   | `applyView("graph")` claims before its note read, paints `"graph"` with `keepDock` when a graph is already up. The old graph stays until the swap.                   |
| Live panels                                 | `live` | `graphRenderer.ts:1682-1687`, `:1712`, `:1722`     | `applyView` for a panel claims and paints in one run. The same function paints a panel when the note went unparsable or trashed during a rebuild.                    |
| Live trash check                            | `live` | `graphRenderer.ts:1832-1834`                       | `scheduleTrashCheck` claims even when the same panel is already showing (so an in-flight rebuild cannot paint a graph over it), and paints only if the kind differs. |
| Live build-failure fallback                 | `live` | `graphRenderer.ts:1746-1749`                       | `onError` of the rebuild: the `unreadable` panel under the same claim (`kind` `"panel:unreadable"`).                                                                 |
| Live teardown                               | `live` | `graphRenderer.ts:1905-1909`                       | Marks the observer disposed, unregisters it, then `area.clear(lastClaim)`. Refused when the tab has claimed since.                                                   |
| Dock write, node click and context menu     | n/a    | `graphRenderer.ts:829` (`showNodeInDock`)          | `dockPort.write`. Refused unless `kind` is `"graph"`, so a handler of a replaced graph cannot paint over a panel.                                                    |
| Dock write, close button                    | n/a    | `graphRenderer.ts:845` (`hideDock` via `dockPort`) | The overview's close handler writes through the same port.                                                                                                           |

The live observer's `isDeleted()` check reads the area (`kind === "panel:deleted"`), not claim order: `deleted` is terminal, so every later request is refused before it claims.

`renderMindmap` called directly (tests, headless use) paints into a mount of its own and sits outside the area. The tab and the live observer pass `area.dockPort` as the dock argument; a bare `HTMLElement` dock is wrapped by `toDockPort` into a port that always writes.

### Test guard

`test/areaGuard.ts` holds `AreaGuardImpl`, installed on the plugin instance (`Zotero[config.addonInstance].areaGuard`) by root hooks in `test/areaGuard.test.ts`, so it wraps every spec file. `createGraphArea` registers its container and dock with the installed guard, and every area operation (`paint`, `clear`, a dock write) runs between `enter()` and `exit()`.

The guard observes both surfaces with a `MutationObserver` on direct children only (`subtree` off, so Cytoscape's own DOM inside the mount is not counted). A child mutation that is pending when an operation starts, or that appears with no operation running, is a violation: some writer painted without going through the area. An `afterEach` hook fails the test with the violation text. A test that mutates a guarded surface on purpose, to play a foreign writer, wraps the write in `withoutAreaGuard`. The guard is absent in production, where `installedGuard()` finds nothing and costs one property read at creation.

## Rendering and refresh

### `renderMindmapInto`

```ts
export function renderMindmapInto(
  mount: HTMLElement,
  doc: MindmapDocument,
  linkTypes: LinkType[],
  dock?: HTMLElement | DockPort,
  rendered: RenderedState = { document: null },
): MindmapHandle;
```

Builds the Cytoscape instance for one document inside a `mount` the caller has attached, and wires every handler above. Synchronous: the graph area runs it inside a paint. Returns a `MindmapHandle`: `{ cy, mount, dispose() }`.

Before constructing anything it shims a `<head>` onto the mount's document when there is none (Zotero's main chrome window is XUL, and Cytoscape's canvas renderer does `document.head.insertBefore(...)` on init), and calls [`ensureCytoscapeWindowGlobals`](polyfills-reference.md) with the mount's `defaultView`. If construction throws, it destroys any instance Cytoscape had already registered on the mount before rethrowing, because `cytoscape()` registers the instance before it validates the elements.

One Cytoscape node per document node, each carrying `id`, `label` from [`resolveNodeLabel`](node-labels-reference.md), an `unplaced` flag (true when the stored position is unplaced, or when the node is in [`piledNodeIds`](schema-reference.md)), a copied position (`{x: 0, y: 0}` when unplaced), and `EXTERNAL_NODE_CLASS` for external nodes. Groups contribute no element of their own; they are drawn by the overlay, from the members' positions. Edges follow: real links first, then parent-child ties, so an authored link between the same parent and child paints above the plain tie and keeps its label.

After construction it records `serializeDocument(doc)` into `rendered.document`, observes the mount with the host window's `ResizeObserver` (calling `cy.resize()` on every change, disconnecting on `cy`'s `destroy` event), and attaches the click, drag and grouping handlers. `attachGroupOverlay` (from `groupOverlay.ts`) runs between them, and the overlay it returns is handed to `attachGroupingHandlers` for hit-testing and torn down on `cy`'s `destroy` event. The context-menu handler is attached only when a dock was passed.

`dispose()` destroys the instance and removes the mount. The toolbar, legend, menu and overlay live inside the mount, so they go with it and nothing accumulates per render.

The caller is responsible for calling `layoutUnplacedNodes` afterwards; `renderMindmapInto` never lays out. The mount needs a positioning context (`position: relative`); the area sets it on every graph mount, and tests that render into their own element set it too. See [cytoscape-explanation.md](cytoscape-explanation.md).

### `renderMindmap`

```ts
export async function renderMindmap(
  container: HTMLElement,
  doc: MindmapDocument,
  linkTypes: LinkType[],
  dockContainer?: HTMLElement,
  rendered: RenderedState = { document: null },
): Promise<MindmapHandle>;
```

Appends a `MOUNT_CLASS` mount of its own to `container`, outside any graph area, and calls `renderMindmapInto` on it. For callers that render without a tab. The mount keeps `dispose()` of one instance from erasing what a neighbour painted into the same container.

### `attachLiveRefresh`

```ts
export function attachLiveRefresh(
  area: GraphArea,
  storageNoteItemID: number,
  linkTypes: LinkType[],
  rendered: RenderedState = { document: null },
): LiveRefreshHandle;
```

Keeps the drawn graph in step with the storage note without a plugin reload.

Registers a `Zotero.Notifier` observer over `["item"]` under the id `zoterolinkedmindmaps-mindmap-live-refresh`. The observer ignores everything but a `modify` on `item` whose id list contains `storageNoteItemID`, then schedules a rebuild.

A rebuild reads the note by item id (never by an id-less mindmap lookup, which would resolve to whichever mindmap sorts first), calls `refreshNote` before reading because the notification arrives while Zotero's cache may still lag, and compares `serializeDocument(doc)` against `rendered.document`. Equal means the graph already shows this, and nothing redraws. Otherwise it paints a new graph through the [graph area](#the-graph-area) (which disposes the current instance and builds the new one in a single synchronous step, keeping the dock open when a graph was already up), then calls `layoutUnplacedNodes`. It takes its claim before the note read, so a panel decided meanwhile supersedes the rebuild. Failures are caught and reported through `logFailure`.

Scheduling runs one rebuild at a time and runs another straight after when a notification arrived while the first was in flight, so a prune that lands mid-rebuild is not dropped.

The observer's `notify` returns `void` and must keep doing so. Zotero awaits each observer's return value inside the DB transaction commit that fired the notification, and the storage write runs inside a queued task; awaiting a rebuild there wedges the storage queue for the rest of the session. See [notifier-queue-explanation.md](notifier-queue-explanation.md).

Returns a teardown function that unregisters the observer and releases the area if it still holds it. The tab claims the area before it calls the teardown. The function also carries `view()`, which reads the area: `"graph"`, `"note-trashed"`, `"container-trashed"`, `"unreadable"` or `"deleted"`, plus `"superseded"` once another owner holds the area. A graph build that threw reads as `"unreadable"`. The tab defers to the observer only while `view()` is `"graph"`, because the observer sees one note: `deleted` is terminal, and a restored note that no longer parses repaints the panel as `unreadable` rather than leaving it saying the note is trashed.

After teardown, an observer that was mid-rebuild paints nothing (`disposed`), so whoever tore it down owns the container. On attach the observer asks once whether its note or container is already trashed, since a trash that landed before it registered fires no later notification.

## Related

- [rendering-explanation.md](rendering-explanation.md), the design reasoning behind these visuals and the refresh loop
- [layout-reference.md](layout-reference.md), how an unplaced node gets a position
- [node-labels-reference.md](node-labels-reference.md), how a node's text is derived
- [ui-elements-reference.md](ui-elements-reference.md), `appendL10nButton` and `appendMindmapOptions`
- [schema-reference.md](schema-reference.md) and [storage-reference.md](storage-reference.md), the document being drawn and where it lives
- [../user-guide/mindmap-tab-reference.md](../user-guide/mindmap-tab-reference.md), the tab this renders into

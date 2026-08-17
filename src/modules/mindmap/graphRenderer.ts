/**
 * Renders a MindmapDocument as a Cytoscape graph inside the mindmap tab.
 * Positions are read from the document and never recomputed by a
 * force-directed layout (PRODUCT.md decision: positions are computed once,
 * by the user, and persisted) - layout is always "preset".
 *
 * Link type is shown as a text label plus a line-style cue (dash pattern,
 * arrowhead), not color alone, so it stays distinguishable past ~8-10 types
 * and for colorblind users. A link whose typeId has no matching entry in
 * the current link-type vocabulary (soft-orphaned by a type deletion in
 * settings) still renders, with a "(unknown type)" fallback label rather
 * than throwing or being dropped.
 */
import cytoscape from "cytoscape";
import { ensureCytoscapeWindowGlobals } from "../../utils/cytoscapeGlobalsPolyfill";
import {
  readDocumentFromNote,
  refreshNote,
  serializeDocument,
  updateMindmapDocument,
} from "./storage";
import { layoutUnplacedNodes } from "./layout";
import { piledNodeIds, isUnplaced } from "./schema";
import { resolveNodeLabel, resolveZoteroItem } from "./nodeLabels";
import { renderMissingItem, renderNodeOverview } from "./nodeOverview";
import { renderConnectionsContent } from "./connectionsPanel";
import { createGroup, deleteGroup, renameGroup } from "./mutations";
import { appendL10nButton } from "./uiElements";
import type { LinkType } from "./linkTypes";
import type {
  MindmapDocument,
  MindmapLink,
  MindmapNode,
  Position,
  ZoteroObjectRef,
} from "./schema";

export const UNKNOWN_TYPE_LABEL = "(unknown type)";

// Zotero's main chrome window is a XUL document with no <head> element, but
// Cytoscape's canvas renderer unconditionally does
// document.head.insertBefore(...) on init to inject a stylesheet. Shim a
// <head> in so that doesn't throw.
function ensureDocumentHead(doc: Document) {
  if (doc.head) {
    return;
  }
  const head = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "head",
  ) as unknown as HTMLHeadElement;
  doc.documentElement?.appendChild(head as unknown as Node);
  Object.defineProperty(doc, "head", { value: head, configurable: true });
}

// Returns a copy: Cytoscape takes ownership of the position object it is
// handed and moves the node by writing to it, which would otherwise rewrite
// the document's own coordinates in place.
function toElementPosition(position: Position | null): Position {
  if (isUnplaced(position)) {
    return { x: 0, y: 0 };
  }
  return { x: position!.x, y: position!.y };
}

export const EXTERNAL_NODE_CLASS = "external-node";

function buildNodeElement(
  node: MindmapNode,
  piled: Set<string>,
): cytoscape.NodeDefinition {
  return {
    data: {
      id: node.id,
      label: resolveNodeLabel(node.ref),
      // A node from a document piled entirely on one point is handed back to
      // the layout even though it has a stored position, so a mindmap that
      // persisted a pile recovers on open instead of staying piled forever.
      unplaced: isUnplaced(node.position) || piled.has(node.id),
      ...(node.groupId ? { parent: node.groupId } : {}),
    },
    position: toElementPosition(node.position),
    ...(node.membership === "external" ? { classes: EXTERNAL_NODE_CLASS } : {}),
  };
}

export const GROUP_NODE_CLASS = "node-group";

/**
 * One Cytoscape compound node per group, with its members pointing at it as
 * their parent. Cytoscape sizes a compound node to fit its children, so the
 * region is derived from where the members already are and never moves them,
 * which is what keeps grouping from fighting the persisted positions.
 *
 * Deliberately given no position of its own: supplying one under a preset
 * layout would override that auto-fit.
 */
function buildGroupElements(doc: MindmapDocument): cytoscape.NodeDefinition[] {
  const grouped = new Set(
    doc.nodes.map((node) => node.groupId).filter(Boolean) as string[],
  );
  return (doc.groups ?? [])
    .filter((group) => grouped.has(group.id))
    .map((group) => ({
      data: { id: group.id, label: group.name ?? "", isGroup: true },
      classes: GROUP_NODE_CLASS,
      // A group container is not draggable: dragging it would carry every
      // member along and rewrite positions the user set deliberately.
      grabbable: false,
    }));
}

export interface LinkVisual {
  label: string;
  classes: "directional" | "undirectional" | "unknown-type";
}

/**
 * Resolves a link's display label and style class against the current
 * link-type vocabulary. Falls back to an "unknown type" visual (AC #4)
 * rather than throwing when typeId has no matching entry - a type can be
 * deleted from settings while links still reference it.
 */
export function resolveLinkVisual(
  link: MindmapLink,
  typeMap: Map<string, LinkType>,
): LinkVisual {
  const type = typeMap.get(link.typeId);
  if (!type) {
    return {
      label: link.name
        ? `${UNKNOWN_TYPE_LABEL}: ${link.name}`
        : UNKNOWN_TYPE_LABEL,
      classes: "unknown-type",
    };
  }
  return {
    label: link.name ? `${type.label}: ${link.name}` : type.label,
    classes: type.directional ? "directional" : "undirectional",
  };
}

const PARALLEL_EDGE_STEP = 40;

/**
 * Two or more links between the same node pair would otherwise render as
 * overlapping edges. Groups links by unordered node pair (source/target
 * order doesn't affect which links visually overlap) and assigns each a
 * symmetric offset around 0, sorted by link id for stability across
 * live-refresh rebuilds. A pair with a single link (the common case) gets
 * offset 0, i.e. renders unchanged. A self-link (source === target) lands
 * alone in its own group and also gets offset 0 - offsetting via
 * control-point-distances doesn't apply to a Cytoscape loop edge, so it's
 * left as-is rather than special-cased here.
 */
export function computeParallelOffsets(
  links: MindmapLink[],
): Map<string, number> {
  const pairGroups = new Map<string, MindmapLink[]>();
  for (const link of links) {
    const pairKey = [link.sourceNodeId, link.targetNodeId].sort().join("::");
    const group = pairGroups.get(pairKey);
    if (group) {
      group.push(link);
    } else {
      pairGroups.set(pairKey, [link]);
    }
  }

  const offsets = new Map<string, number>();
  for (const group of pairGroups.values()) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const n = sorted.length;
    sorted.forEach((link, i) => {
      offsets.set(link.id, PARALLEL_EDGE_STEP * (i - (n - 1) / 2));
    });
  }
  return offsets;
}

function buildEdgeElement(
  link: MindmapLink,
  typeMap: Map<string, LinkType>,
  parallelOffset: number,
): cytoscape.EdgeDefinition {
  const { label, classes } = resolveLinkVisual(link, typeMap);
  return {
    data: {
      id: link.id,
      source: link.sourceNodeId,
      target: link.targetNodeId,
      label,
      parallelOffset,
    },
    classes,
  };
}

export const PARENT_CHILD_TIE_CLASS = "parent-child-tie";

/**
 * Connectors between an item node and its own child-note nodes, drawn when
 * both are on the mindmap. They are not links: nothing authored them, they
 * carry no type and no name, and they never touch doc.links - they are
 * recomputed on every render from Zotero's own parent/child data, so a tie
 * appears and disappears as nodes are added, removed or reparented, with no
 * persisted state to go stale.
 *
 * A child note whose parent isn't on this mindmap gets no tie; there is
 * nothing to connect it to.
 */
export function buildParentChildTies(
  nodes: MindmapNode[],
): cytoscape.EdgeDefinition[] {
  const itemNodeIdByItemID = new Map<number, string>();
  const noteNodes: Array<{ nodeId: string; item: Zotero.Item }> = [];
  for (const node of nodes) {
    const item = resolveZoteroItem(node.ref);
    if (!item) {
      continue;
    }
    if (item.isNote()) {
      noteNodes.push({ nodeId: node.id, item });
    } else {
      itemNodeIdByItemID.set(item.id, node.id);
    }
  }

  const ties: cytoscape.EdgeDefinition[] = [];
  for (const { nodeId, item } of noteNodes) {
    const parentNodeId = item.parentItemID
      ? itemNodeIdByItemID.get(item.parentItemID)
      : undefined;
    if (!parentNodeId) {
      continue;
    }
    ties.push({
      // The prefix keeps these ids clear of real link ids, so nothing can
      // mistake a tie for a link when selecting or styling.
      data: {
        id: `tie:${parentNodeId}:${nodeId}`,
        source: parentNodeId,
        target: nodeId,
        parallelOffset: 0,
      },
      classes: PARENT_CHILD_TIE_CLASS,
    });
  }
  return ties;
}

const STYLESHEET: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      shape: "ellipse",
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": "80px",
      "background-color": "#cfe0f5",
      "border-color": "#4a90d9",
      "border-width": 1,
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 10,
      width: 50,
      height: 50,
    },
  },
  {
    // The region drawn around a group's members. Low-opacity fill and a label
    // above the cluster, so it reads as a backdrop rather than as another node
    // sitting among them.
    selector: `node.${GROUP_NODE_CLASS}`,
    style: {
      shape: "round-rectangle",
      label: "data(label)",
      "background-color": "#f2f4f7",
      "background-opacity": 0.6,
      "border-style": "dashed",
      "border-color": "#aab4c2",
      "border-width": 1,
      "text-valign": "top",
      "text-halign": "center",
      "font-size": 11,
      padding: "14px",
    },
  },
  {
    // A node borrowed from another mindmap: same shape and size, dashed
    // border and a paler fill. Shape was left alone because shape is how a
    // future node-kind distinction (item vs note) would read; a dashed
    // outline says "not really from here" without spending that channel, and
    // stays legible for anyone who can't rely on the colour difference.
    selector: `node.${EXTERNAL_NODE_CLASS}`,
    style: {
      "background-color": "#eef3fa",
      "border-style": "dashed",
      "border-color": "#7aa7d9",
      "border-width": 2,
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 8,
      "text-rotation": "autorotate",
      "text-background-color": "#fff",
      "text-background-opacity": 1,
      "text-background-padding": "2px",
      width: 2,
      "line-color": "#666",
      "target-arrow-color": "#666",
      "control-point-distances": "data(parallelOffset)",
      "control-point-weights": 0.5,
    },
  },
  {
    selector: "edge.directional",
    style: {
      "line-style": "dashed",
      "target-arrow-shape": "triangle",
    },
  },
  {
    selector: "edge.undirectional",
    style: {
      "line-style": "solid",
      "target-arrow-shape": "none",
    },
  },
  {
    selector: "edge.unknown-type",
    style: {
      "line-style": "dotted",
      "line-color": "#999",
      "target-arrow-color": "#999",
      "target-arrow-shape": "none",
    },
  },
  {
    // Lighter than the unknown-type dotted line so the two don't read alike,
    // and labelless on purpose: every real edge carries a label, even the
    // unknown-type fallback, so an unlabelled line cannot be mistaken for an
    // authored relationship.
    selector: `edge.${PARENT_CHILD_TIE_CLASS}`,
    style: {
      "line-style": "dotted",
      "line-color": "#ddd",
      width: 1,
      label: "",
      "target-arrow-shape": "none",
      "source-arrow-shape": "none",
    },
  },
];

/**
 * Selects the Zotero item a node represents in the library, which switches
 * Zotero away from the mindmap tab. Only ever reached from the dock's own
 * button, never from clicking a node: losing the graph has to be something
 * the user asks for.
 *
 * ZoteroPane.selectItem is async in Zotero's own source (chrome/content/
 * zotero/zoteroPane.js) despite the vendored zotero-types typing it as
 * synchronous - awaited here to match the real behavior.
 */
async function showItemInLibrary(item: Zotero.Item): Promise<void> {
  await Zotero.getActiveZoteroPane().selectItem(item.id);
}

/**
 * Fills the docked panel with one node's item: a read-only overview over the
 * Connections content, which stays the interface for links.
 *
 * Shared by the tap and right-click handlers so both put the same thing on
 * screen. A ref whose item was deleted gets the missing-item state rather
 * than leaving whatever the dock last showed, which would read as if the
 * click had simply not registered.
 */
export function showNodeInDock(
  dockContainer: HTMLElement,
  ref: ZoteroObjectRef,
  mindmapId?: string,
  openAddLink = false,
): void {
  dockContainer.style.display = "";
  const item = resolveZoteroItem(ref);
  if (!item) {
    dockContainer.textContent = "";
    renderMissingItem(dockContainer);
    return;
  }

  dockContainer.textContent = "";
  renderNodeOverview(
    dockContainer,
    item,
    () => {
      void showItemInLibrary(item);
    },
    () => hideDock(dockContainer),
  );
  const connections = dockContainer.ownerDocument!.createElement("div");
  dockContainer.appendChild(connections);
  void renderConnectionsContent(connections, item, mindmapId, openAddLink);
}

function hideDock(dockContainer: HTMLElement): void {
  dockContainer.style.display = "none";
  dockContainer.textContent = "";
}

/**
 * Wires node clicks to fill the docked panel beside the graph. Uses
 * Cytoscape's "tap" event (fires on pointer-up only when the gesture wasn't a
 * drag) so a click never fires alongside a node reposition.
 *
 * Without a dock to draw into - a headless render, or a test - a tap does
 * nothing at all, which is the honest behavior: there is nowhere to show the
 * item, and jumping to the library instead is exactly what this replaced.
 */
export function attachNodeClickHandler(
  cy: cytoscape.Core,
  nodeRefsById: Map<string, ZoteroObjectRef>,
  dockContainer?: HTMLElement,
  mindmapId?: string,
): void {
  cy.on("tap", "node", (evt) => {
    // A group container is a node to Cytoscape but has no item behind it.
    if (evt.target.data("isGroup")) {
      return;
    }
    const ref = nodeRefsById.get(evt.target.id());
    if (!ref || !dockContainer) {
      return;
    }
    showNodeInDock(dockContainer, ref, mindmapId);
  });
}

/**
 * What one rendered graph believes is stored, serialized.
 *
 * A drag write modifies the storage note, which fires the same "modify"
 * notification attachLiveRefresh answers with a full destroy-and-rebuild - so
 * without this the graph would tear itself down and rebuild after every drag,
 * flashing and discarding the Cytoscape instance the gesture was using.
 *
 * Identity rather than a "currently writing" flag, because Zotero fires two
 * modify notifications per save: one inside the transaction and a second one a
 * task later, after any such flag would have been cleared. Comparing what is
 * stored against what the graph already shows catches both, and needs no
 * assumption about when a notification arrives.
 *
 * One box per rendered graph, not one per module: two tabs render two graphs
 * over two different documents, and a shared box would let one graph's write
 * suppress the other's refresh.
 */
export interface RenderedState {
  document: string | null;
}

/**
 * Applies dropped coordinates to the stored document. Goes through
 * updateMindmapDocument rather than a read/write pair because deletionCleanup
 * and the layout write to the same document; a bare pair can drop whichever
 * change landed in between.
 */
async function persistNodePositions(
  mindmapId: string,
  moved: Map<string, Position>,
  rendered: RenderedState,
): Promise<void> {
  try {
    await updateMindmapDocument((doc) => {
      let changed = false;
      const nodes = doc.nodes.map((node): MindmapNode => {
        const position = moved.get(node.id);
        if (
          !position ||
          (node.position?.x === position.x && node.position?.y === position.y)
        ) {
          return node;
        }
        changed = true;
        return { ...node, position };
      });
      // A gesture that ended where it started, or on a node no longer in the
      // document, writes nothing at all.
      if (!changed) {
        return null;
      }
      // Recorded here rather than after the write: the first notification for
      // this save arrives before the write resolves.
      const next = { ...doc, nodes };
      rendered.document = serializeDocument(next);
      return next;
    }, mindmapId);
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] persisting dragged node positions failed: ${(err as Error).message}`,
    );
  }
}

/**
 * Persists where a dragged node lands. Cytoscape emits "dragfree" once per
 * node, so a gesture that moves a multi-node selection arrives as N events in
 * the same tick; they accumulate into `pending` and flush on a microtask, so
 * one gesture produces one write instead of one per node.
 */
export function attachNodeDragHandler(
  cy: cytoscape.Core,
  mindmapId: string,
  rendered: RenderedState = { document: null },
): void {
  let pending = new Map<string, Position>();
  let flushScheduled = false;

  function flush(): void {
    flushScheduled = false;
    const moved = pending;
    pending = new Map();
    void persistNodePositions(mindmapId, moved, rendered);
  }

  cy.on("dragfree", "node", (evt) => {
    const node = evt.target;
    const { x, y } = node.position();
    pending.set(node.id(), { x, y });
    if (flushScheduled) {
      return;
    }
    flushScheduled = true;
    void Promise.resolve().then(flush);
  });
}

export const NODE_MENU_ADD_LINK_CLASS = "mindmap-node-menu-add-link";

/**
 * Right-click on a node opens the link-creation menu: one "Add link" action,
 * per PRODUCT.md, which is what makes the mindmap tab a place links can be
 * authored rather than only read. The action docks the node and opens the
 * add-link form in one step, reusing the Connections component instead of a
 * second implementation of the same form.
 *
 * Left-click docks the node without opening the form, so inspecting a node
 * and linking it stay separate gestures. Closing the dock is the dock's own
 * button, not a second right-click, so this gesture means one thing.
 *
 * The dock is told which mindmap the graph is showing, so a node that also
 * appears in another mindmap gets the links this graph draws rather than some
 * other mindmap's.
 *
 * The native context menu needs no suppressing here: Cytoscape registers its
 * own preventDefault on the container's contextmenu event, and unregisters it
 * on destroy. A second listener added per render would outlive every rebuild,
 * since the container is reused and cy.destroy() only removes bindings
 * Cytoscape made itself.
 */
export function attachNodeContextMenuHandler(
  cy: cytoscape.Core,
  nodeRefsById: Map<string, ZoteroObjectRef>,
  dockContainer: HTMLElement,
  mindmapId?: string,
): void {
  cy.on("cxttap", "node", (evt) => {
    // A group container is a node to Cytoscape but has no item behind it;
    // right-clicking one is the grouping menu's business, not this one's.
    if (evt.target.data("isGroup")) {
      return;
    }
    const ref = nodeRefsById.get(evt.target.id());
    if (!ref) {
      return;
    }
    const menu = openMenu(cy, evt.renderedPosition);
    if (!menu) {
      return;
    }
    const addLink = appendL10nButton(menu, "add-link-button", () => {
      closeMenu(cy);
      showNodeInDock(dockContainer, ref, mindmapId, true);
    });
    addLink.classList.add(NODE_MENU_ADD_LINK_CLASS);
  });
}

export const GROUP_MENU_CLASS = "mindmap-group-menu";

/**
 * A small menu drawn into the graph container at the click point. A DOM popup
 * rather than a native context menu for the same reason the Connections dock
 * is one: it doesn't block, and it can hold an inline text field.
 */
function openMenu(
  cy: cytoscape.Core,
  at: { x: number; y: number },
): HTMLElement | null {
  closeMenu(cy);
  const container = cy.container();
  if (!container) {
    return null;
  }
  const menu = container.ownerDocument!.createElement("div");
  menu.classList.add(GROUP_MENU_CLASS);
  menu.style.cssText = `position: absolute; left: ${at.x}px; top: ${at.y}px; z-index: 10; background: Field; color: FieldText; border: 1px solid ThreeDShadow; padding: 4px; display: flex; flex-direction: column; gap: 2px;`;
  // The menu is a child of the graph container, so without this Cytoscape
  // treats a click on it as a click on the canvas: its container mousedown
  // handler calls preventDefault (the rename field can then never take focus)
  // and sets the capture flag its window-level mouseup handler needs to emit
  // "tap" - which closeMenu answers by removing the menu during mouseup,
  // before the button's own click event is dispatched. Stopping mousedown at
  // the menu leaves that flag unset, so the mouseup handler returns early and
  // no tap is emitted for clicks inside the menu.
  menu.addEventListener("mousedown", (evt) => evt.stopPropagation());
  container.appendChild(menu);
  return menu;
}

function closeMenu(cy: cytoscape.Core): void {
  cy.container()
    ?.querySelectorAll(`.${GROUP_MENU_CLASS}`)
    .forEach((menu: Element) => menu.remove());
}

/**
 * Grouping, driven from right-click: on empty canvas with two or more nodes
 * selected, offer to group them; on a group's own region, offer to rename or
 * dissolve it. Selection itself is Cytoscape's (shift-click, box-select), so
 * there is no selection model of our own to keep in step.
 */
export function attachGroupingHandlers(
  cy: cytoscape.Core,
  mindmapId: string,
): void {
  /**
   * Nothing redraws here on purpose: the write fires a modify notification and
   * the live-refresh observer rebuilds the graph from what was stored.
   */
  async function apply(mutate: (doc: MindmapDocument) => void): Promise<void> {
    closeMenu(cy);
    try {
      await updateMindmapDocument((doc) => {
        mutate(doc);
        return doc;
      }, mindmapId);
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] grouping change failed: ${(err as Error).message}`,
      );
    }
  }

  cy.on("cxttap", (evt) => {
    if (evt.target !== cy) {
      return;
    }
    const selected = cy
      .$("node:selected")
      .filter((node) => !node.data("isGroup"));
    // Nothing to offer for a single node: a group of one says nothing that
    // the node doesn't already.
    if (selected.length < 2) {
      closeMenu(cy);
      return;
    }
    const menu = openMenu(cy, evt.renderedPosition);
    if (!menu) {
      return;
    }
    const ids = selected.map((node) => node.id());
    appendL10nButton(menu, "mindmap-group-create", () => {
      void apply((doc) => createGroup(doc, ids));
    });
  });

  cy.on("cxttap", "node", (evt) => {
    if (!evt.target.data("isGroup")) {
      return;
    }
    const groupId = evt.target.id();
    const menu = openMenu(cy, evt.renderedPosition);
    if (!menu) {
      return;
    }

    const nameInput = menu.ownerDocument!.createElement("input");
    nameInput.type = "text";
    nameInput.value = String(evt.target.data("label") ?? "");
    menu.appendChild(nameInput);

    appendL10nButton(menu, "mindmap-group-rename", () => {
      void apply((doc) => renameGroup(doc, groupId, nameInput.value.trim()));
    });
    appendL10nButton(menu, "mindmap-group-delete", () => {
      void apply((doc) => deleteGroup(doc, groupId));
    });
  });

  // Any click that isn't opening a menu dismisses the one that's open.
  cy.on("tap", () => closeMenu(cy));
}

/**
 * Keeps the graph's idea of its own geometry in step with the tab's layout.
 *
 * Two caches go stale when the sidebar collapses or the dock opens: the size
 * cache (canvas dimensions) and containerBB, the container's on-screen offset
 * that pointer coordinates are measured against. A stale containerBB is why
 * clicks land on the wrong node, or on nothing, after a layout change - the
 * graph still draws correctly, so nothing looks broken until you click.
 *
 * cy.resize() clears both: it emits "resize", and the renderer answers that by
 * calling invalidateContainerClientCoordsCache and re-matching the canvas
 * size. Cytoscape wires its own ResizeObserver for this, but only if a
 * ResizeObserver global is visible from the bundle's scope and actually
 * delivers for elements in Zotero's main window, which it does not here. The
 * observer is therefore taken from the host window explicitly rather than left
 * to a bare global.
 */
function observeContainerSize(
  cy: cytoscape.Core,
  container: HTMLElement,
  win: Window,
): void {
  const Observer = (
    win as unknown as { ResizeObserver?: typeof ResizeObserver }
  ).ResizeObserver;
  if (!Observer) {
    return;
  }
  const observer = new Observer(() => {
    if (!cy.destroyed()) {
      cy.resize();
    }
  });
  observer.observe(container);
  cy.on("destroy", () => observer.disconnect());
}

export async function renderMindmap(
  container: HTMLElement,
  doc: MindmapDocument,
  linkTypes: LinkType[],
  dockContainer?: HTMLElement,
  rendered: RenderedState = { document: null },
): Promise<cytoscape.Core> {
  const win = container.ownerDocument!.defaultView!;
  ensureDocumentHead(container.ownerDocument!);
  ensureCytoscapeWindowGlobals(win);

  const typeMap = new Map(linkTypes.map((type) => [type.id, type]));
  const parallelOffsets = computeParallelOffsets(doc.links);
  const nodeRefsById = new Map(doc.nodes.map((node) => [node.id, node.ref]));
  const piled = piledNodeIds(doc.nodes);

  rendered.document = serializeDocument(doc);
  const cy = cytoscape({
    container,
    elements: {
      // Group containers first: Cytoscape needs a parent to exist before the
      // children naming it.
      nodes: [
        ...buildGroupElements(doc),
        ...doc.nodes.map((node) => buildNodeElement(node, piled)),
      ],
      // Ties come after the real links, so an authored link between the same
      // parent and child paints (and keeps its label) above the plain tie.
      edges: [
        ...doc.links.map((link) =>
          buildEdgeElement(link, typeMap, parallelOffsets.get(link.id) ?? 0),
        ),
        ...buildParentChildTies(doc.nodes),
      ],
    },
    style: STYLESHEET,
    layout: { name: "preset" },
  });
  observeContainerSize(cy, container, win);
  attachNodeClickHandler(cy, nodeRefsById, dockContainer, doc.id);
  attachNodeDragHandler(cy, doc.id, rendered);
  attachGroupingHandlers(cy, doc.id);
  if (dockContainer) {
    attachNodeContextMenuHandler(cy, nodeRefsById, dockContainer, doc.id);
  }
  return cy;
}

/**
 * Keeps the rendered graph in sync with the storage note without a full
 * plugin reload (AC #3). Rebuilds via a full destroy-and-rebuild rather
 * than an in-place diff - a deliberate simplicity choice for v1's expected
 * corpus size (dozens-to-low-hundreds of nodes), not a shortcut to revisit
 * unprompted.
 *
 * Returns a teardown function that unregisters the observer and destroys
 * the currently rendered graph.
 */
export function attachLiveRefresh(
  cy: cytoscape.Core,
  container: HTMLElement,
  storageNoteItemID: number,
  linkTypes: LinkType[],
  dockContainer?: HTMLElement,
  rendered: RenderedState = { document: null },
): () => void {
  let current = cy;
  let refreshing = false;
  let dirty = false;

  async function rebuild(): Promise<void> {
    try {
      // Reads the note this graph was opened from rather than looking a
      // mindmap up again: with several mindmaps in the library, an id-less
      // lookup would resolve to whichever one happens to sort first.
      const item = (await Zotero.Items.getAsync(
        storageNoteItemID,
      )) as Zotero.Item;
      // Refreshed first: this runs on a notification about a write that may
      // have landed a moment ago, which is exactly when the cache lags.
      const doc = readDocumentFromNote(await refreshNote(item));
      // Nothing to redraw when the stored document is already what the graph
      // shows - the drag write is the common case, since it moved the nodes
      // before it saved them, and rebuilding for it would only flash.
      if (serializeDocument(doc) === rendered.document) {
        return;
      }
      current.destroy();
      current = await renderMindmap(
        container,
        doc,
        linkTypes,
        dockContainer,
        rendered,
      );
      await layoutUnplacedNodes(current, doc);
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] mindmap live refresh failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Runs one rebuild at a time, and runs another straight after when a
   * notification arrived while the first was in flight. A rebuild awaits
   * several times over (the note read, the render, the layout), so simply
   * dropping notifications that land in that window loses them: a prune from
   * deletionCleanup that arrives during a user-triggered rebuild would leave
   * the graph showing a node that no longer exists until the tab is reopened.
   */
  function schedule(): void {
    if (refreshing) {
      dirty = true;
      return;
    }
    refreshing = true;
    void (async () => {
      try {
        do {
          dirty = false;
          await rebuild();
        } while (dirty);
      } finally {
        refreshing = false;
      }
    })();
  }

  /**
   * Returns nothing rather than a promise, and must keep doing so. Zotero
   * awaits each observer's return value inside the DB transaction commit
   * that fired the notification (Notifier.trigger, reached from the DB
   * commit callbacks), and the write that modifies the storage note runs
   * inside a storage-queue task. Awaiting the rebuild here would park it on
   * a queue whose head is the task waiting for this very notification to
   * return, wedging the queue for the rest of the session - every later save
   * then hangs silently. So the rebuild is started and deliberately not
   * awaited.
   */
  function notify(
    event: _ZoteroTypes.Notifier.Event,
    type: _ZoteroTypes.Notifier.Type,
    ids: string[] | number[],
  ): void {
    if (event !== "modify" || type !== "item") {
      return;
    }
    if (!ids.some((id) => Number(id) === storageNoteItemID)) {
      return;
    }
    schedule();
  }

  const observerID = Zotero.Notifier.registerObserver(
    { notify },
    ["item"],
    "zoterolinkedmindmaps-mindmap-live-refresh",
  );

  return () => {
    Zotero.Notifier.unregisterObserver(observerID);
    current.destroy();
  };
}

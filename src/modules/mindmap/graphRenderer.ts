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
import { readMindmapDocument } from "./storage";
import { layoutUnplacedNodes } from "./layout";
import { isUnplaced } from "./schema";
import type { LinkType } from "./linkTypes";
import type {
  MindmapDocument,
  MindmapLink,
  MindmapNode,
  Position,
  ZoteroObjectRef,
} from "./schema";

export const MISSING_ITEM_LABEL = "(missing item)";
export const UNKNOWN_TYPE_LABEL = "(unknown type)";

// Zotero's main chrome window is a XUL document with no <head> element, but
// Cytoscape's canvas renderer unconditionally does
// document.head.insertBefore(...) on init to inject a stylesheet. Shim a
// <head> in so that doesn't throw (same fix as src/spike/cytoscapeSpike.ts).
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

export function resolveNodeLabel(ref: ZoteroObjectRef): string {
  const target = Zotero.Items.getByLibraryAndKey(ref.libraryID, ref.key);
  return target ? target.getDisplayTitle() : MISSING_ITEM_LABEL;
}

function toElementPosition(position: Position | null): Position {
  if (
    position === null ||
    Number.isNaN(position.x) ||
    Number.isNaN(position.y)
  ) {
    return { x: 0, y: 0 };
  }
  return position;
}

function buildNodeElement(node: MindmapNode): cytoscape.NodeDefinition {
  return {
    data: {
      id: node.id,
      label: resolveNodeLabel(node.ref),
      unplaced: isUnplaced(node.position),
    },
    position: toElementPosition(node.position),
  };
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
];

/**
 * Opens/selects the Zotero item a clicked node represents. A no-op if the
 * underlying item was deleted since the node was created (mirrors
 * resolveNodeLabel's "(missing item)" fallback rather than throwing).
 *
 * ZoteroPane.selectItem is async in Zotero's own source (chrome/content/
 * zotero/zoteroPane.js) despite the vendored zotero-types typing it as
 * synchronous - awaited here to match the real behavior.
 */
async function openZoteroRef(ref: ZoteroObjectRef): Promise<void> {
  const item = Zotero.Items.getByLibraryAndKey(ref.libraryID, ref.key);
  if (!item) {
    return;
  }
  await Zotero.getActiveZoteroPane().selectItem(item.id);
}

/**
 * Wires node clicks to select the underlying Zotero item. Uses Cytoscape's
 * "tap" event (fires on pointer-up only when the gesture wasn't a drag) so
 * click-to-select never fires alongside a node reposition.
 */
export function attachNodeClickHandler(
  cy: cytoscape.Core,
  nodeRefsById: Map<string, ZoteroObjectRef>,
): void {
  cy.on("tap", "node", (evt) => {
    const ref = nodeRefsById.get(evt.target.id());
    if (!ref) {
      return;
    }
    return openZoteroRef(ref);
  });
}

export async function renderMindmap(
  container: HTMLElement,
  doc: MindmapDocument,
  linkTypes: LinkType[],
): Promise<cytoscape.Core> {
  const win = container.ownerDocument!.defaultView!;
  ensureDocumentHead(container.ownerDocument!);
  ensureCytoscapeWindowGlobals(win);

  const typeMap = new Map(linkTypes.map((type) => [type.id, type]));
  const parallelOffsets = computeParallelOffsets(doc.links);
  const nodeRefsById = new Map(doc.nodes.map((node) => [node.id, node.ref]));

  const cy = cytoscape({
    container,
    elements: {
      nodes: doc.nodes.map(buildNodeElement),
      edges: doc.links.map((link) =>
        buildEdgeElement(link, typeMap, parallelOffsets.get(link.id) ?? 0),
      ),
    },
    style: STYLESHEET,
    layout: { name: "preset" },
  });
  attachNodeClickHandler(cy, nodeRefsById);
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
): () => void {
  let current = cy;
  let refreshing = false;

  async function notify(
    event: _ZoteroTypes.Notifier.Event,
    type: _ZoteroTypes.Notifier.Type,
    ids: string[] | number[],
  ): Promise<void> {
    if (event !== "modify" || type !== "item") {
      return;
    }
    if (!ids.some((id) => Number(id) === storageNoteItemID)) {
      return;
    }
    if (refreshing) {
      return;
    }
    refreshing = true;
    try {
      const doc = await readMindmapDocument();
      current.destroy();
      current = await renderMindmap(container, doc, linkTypes);
      await layoutUnplacedNodes(current, doc);
    } catch (err) {
      Zotero.debug(
        `[zoteroLinkedMindmaps] mindmap live refresh failed: ${(err as Error).message}`,
      );
    } finally {
      refreshing = false;
    }
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

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
import { config } from "../../../package.json";
import { ensureCytoscapeWindowGlobals } from "../../utils/cytoscapeGlobalsPolyfill";
import {
  attachGroupOverlay,
  GROUP_PIP_CLASS,
  type GroupOverlay,
} from "./groupOverlay";
import { getLocaleID, getString } from "../../utils/locale";
import { logFailure } from "../../utils/logging";
import type { FluentMessageId } from "../../../typings/i10n";
import {
  readDocumentFromNote,
  refreshNote,
  StorageError,
  serializeDocument,
  updateMindmapDocument,
} from "./storage";
import { layoutUnplacedNodes, relayoutPositions } from "./layout";
import { piledNodeIds, isUnplaced } from "./schema";
import { resolveNodeLabel, resolveZoteroItem } from "./nodeLabels";
import { renderMissingItem, renderNodeOverview } from "./nodeOverview";
import { renderConnectionsContent } from "./connectionsPanel";
import {
  MOUNT_CLASS,
  type Claim,
  type DockPort,
  type GraphArea,
} from "./graphArea";
import { createGroup, deleteGroup, renameGroup } from "./mutations";
import { appendL10nButton } from "./uiElements";
import { UNKNOWN_TYPE_LABEL, type LinkType } from "./linkTypes";
import type {
  MindmapDocument,
  MindmapLink,
  MindmapNode,
  Position,
  ZoteroObjectRef,
} from "./schema";

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
    },
    position: toElementPosition(node.position),
    ...(node.membership === "external" ? { classes: EXTERNAL_NODE_CLASS } : {}),
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

const FALLBACK_SELECTION_COLOR = "#0a6cf5";

/**
 * Cytoscape draws to canvas, not through CSS, so a bare `var(--accent-blue)`
 * in STYLESHEET would never resolve - the token has to be read from
 * computed style once and baked into a literal color. Falls back to a fixed
 * blue if the token is missing (a headless render, or Zotero's own
 * stylesheet not yet loaded), rather than drawing selection invisibly again.
 */
function resolveSelectionColor(win: Window): string {
  const value = win
    .getComputedStyle(win.document.documentElement!)
    ?.getPropertyValue("--accent-blue")
    .trim();
  return value || FALLBACK_SELECTION_COLOR;
}

export function buildStylesheet(win: Window): cytoscape.StylesheetStyle[] {
  return [
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
    {
      // Listed last so it wins over every node/group/external rule above for
      // the properties it sets: a selected node is otherwise drawn identically
      // to an unselected one, which is what made shift-click and box-select
      // look like they weren't doing anything.
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": resolveSelectionColor(win),
      },
    },
  ];
}

const SVG_NS = "http://www.w3.org/2000/svg";

function appendIconSvg(
  parent: Element,
  doc: Document,
  build: (svg: SVGElement) => void,
): void {
  const svg = doc.createElementNS(SVG_NS, "svg") as unknown as SVGElement;
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  build(svg);
  parent.appendChild(svg as unknown as Node);
}

function svgPath(doc: Document, d: string): SVGPathElement {
  const path = doc.createElementNS(SVG_NS, "path") as unknown as SVGPathElement;
  path.setAttribute("d", d);
  return path;
}

function svgCircle(
  doc: Document,
  cx: number,
  cy: number,
  r: number,
): SVGCircleElement {
  const circle = doc.createElementNS(
    SVG_NS,
    "circle",
  ) as unknown as SVGCircleElement;
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(r));
  return circle;
}

function appendAddLinkIcon(parent: Element, doc: Document): void {
  appendIconSvg(parent, doc, (svg) =>
    svg.appendChild(svgPath(doc, "M8 3v10M3 8h10")),
  );
}

function appendZoomIcon(
  parent: Element,
  doc: Document,
  sign: "in" | "out",
): void {
  appendIconSvg(parent, doc, (svg) => {
    svg.appendChild(svgCircle(doc, 6.5, 6.5, 4.5));
    svg.appendChild(svgPath(doc, "M9.7 9.7l4 4"));
    svg.appendChild(
      svgPath(doc, sign === "in" ? "M6.5 4.3v4.4M4.3 6.5h4.4" : "M4.3 6.5h4.4"),
    );
  });
}

function appendFitIcon(parent: Element, doc: Document): void {
  appendIconSvg(parent, doc, (svg) =>
    svg.appendChild(svgPath(doc, "M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3")),
  );
}

function appendRelayoutIcon(parent: Element, doc: Document): void {
  appendIconSvg(parent, doc, (svg) => {
    svg.appendChild(svgPath(doc, "M3 8a5 5 0 0 1 8.5-3.5L13 6"));
    svg.appendChild(svgPath(doc, "M13 3v3h-3"));
    svg.appendChild(svgPath(doc, "M13 8a5 5 0 0 1-8.5 3.5L3 10"));
    svg.appendChild(svgPath(doc, "M3 13v-3h3"));
  });
}

function appendLegendToggleIcon(parent: Element, doc: Document): void {
  appendIconSvg(parent, doc, (svg) => {
    svg.appendChild(svgCircle(doc, 8, 8, 6));
    svg.appendChild(svgPath(doc, "M8 7.4v4.2"));
    const dot = svgCircle(doc, 8, 4.6, 0.7);
    dot.setAttribute("fill", "currentColor");
    dot.setAttribute("stroke", "none");
    svg.appendChild(dot);
  });
}

type LegendSampleStyle =
  "directional" | "undirectional" | "unknown-type" | "tie";

/**
 * A 20x8 sample of one edge style the STYLESHEET can draw, so the legend
 * stays a picture of the actual notation rather than a prose description of
 * it. "tie" mirrors the parent-child connector: thinner and lighter than the
 * unknown-type dotted line, matching how they must never read alike on the
 * graph itself.
 */
function appendLegendEdgeSample(
  parent: Element,
  doc: Document,
  style: LegendSampleStyle,
): void {
  const svg = doc.createElementNS(SVG_NS, "svg") as unknown as SVGElement;
  svg.setAttribute("viewBox", "0 0 20 8");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "8");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("mindmap-legend-sample-" + style);

  const line = svgPath(doc, "M1 4h13");
  line.setAttribute("fill", "none");
  line.setAttribute("stroke-width", style === "tie" ? "1" : "1.5");
  if (style === "directional") {
    line.setAttribute("stroke-dasharray", "3 2");
  } else if (style === "unknown-type" || style === "tie") {
    line.setAttribute("stroke-dasharray", "1 2");
  }
  svg.appendChild(line);

  if (style === "directional") {
    const head = svgPath(doc, "M14 1.3l5 2.7-5 2.7z");
    head.setAttribute("fill", "currentColor");
    head.setAttribute("stroke", "none");
    svg.appendChild(head);
  }
  parent.appendChild(svg as unknown as Node);
}

/** A dashed, paler ellipse: the same node style EXTERNAL_NODE_CLASS draws. */
function appendLegendNodeSample(parent: Element, doc: Document): void {
  const svg = doc.createElementNS(SVG_NS, "svg") as unknown as SVGElement;
  svg.setAttribute("viewBox", "0 0 20 16");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const ellipse = doc.createElementNS(
    SVG_NS,
    "ellipse",
  ) as unknown as SVGEllipseElement;
  ellipse.setAttribute("cx", "10");
  ellipse.setAttribute("cy", "8");
  ellipse.setAttribute("rx", "8");
  ellipse.setAttribute("ry", "6");
  ellipse.setAttribute("fill", "none");
  ellipse.setAttribute("stroke-width", "1.5");
  ellipse.setAttribute("stroke-dasharray", "3 2");
  svg.appendChild(ellipse as unknown as Node);
  parent.appendChild(svg as unknown as Node);
}

/**
 * A capsule: the shape a two-member region actually takes, drawn as one path
 * rather than as overlapping halos and a band. The real overlay flattens its
 * shapes through a mask for the same reason - two translucent shapes stacked
 * would show a join the renderer never draws.
 */
function appendLegendGroupSample(parent: Element, doc: Document): void {
  const svg = doc.createElementNS(SVG_NS, "svg") as unknown as SVGElement;
  svg.setAttribute("viewBox", "0 0 20 16");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const capsule = doc.createElementNS(SVG_NS, "rect");
  capsule.setAttribute("x", "1");
  capsule.setAttribute("y", "3");
  capsule.setAttribute("width", "18");
  capsule.setAttribute("height", "10");
  capsule.setAttribute("rx", "5");
  capsule.classList.add("mindmap-legend-group-sample");
  svg.appendChild(capsule as unknown as Node);
  parent.appendChild(svg as unknown as Node);
}

/**
 * Two pips in two hues: what a node in two groups carries, and the sample that
 * says the hue is the group rather than decoration. Drawn at full opacity like
 * the real ones, so the legend shows the colour the graph actually paints
 * rather than the muted version the region fill uses.
 */
function appendLegendGroupPipSample(parent: Element, doc: Document): void {
  const svg = doc.createElementNS(SVG_NS, "svg") as unknown as SVGElement;
  svg.setAttribute("viewBox", "0 0 20 16");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  [4, 14].forEach((cx, index) => {
    const pip = doc.createElementNS(SVG_NS, "circle");
    pip.setAttribute("cx", String(cx));
    pip.setAttribute("cy", "8");
    pip.setAttribute("r", "4");
    pip.classList.add(
      "mindmap-legend-group-pip-sample",
      `${GROUP_PIP_CLASS}-${index}`,
    );
    svg.appendChild(pip as unknown as Node);
  });
  parent.appendChild(svg as unknown as Node);
}

export const LEGEND_CLASS = "mindmap-legend";

/**
 * Every line and node style STYLESHEET can produce (AC #1), each drawn as a
 * sample rather than described in words. Kept as one list next to the
 * stylesheet it mirrors, so a new style added there is a visible gap here
 * instead of a silent one.
 */
const LEGEND_ROWS: Array<{
  localeId: FluentMessageId;
  sample: (parent: Element, doc: Document) => void;
}> = [
  {
    localeId: "mindmap-legend-directional",
    sample: (parent, doc) => appendLegendEdgeSample(parent, doc, "directional"),
  },
  {
    localeId: "mindmap-legend-undirectional",
    sample: (parent, doc) =>
      appendLegendEdgeSample(parent, doc, "undirectional"),
  },
  {
    localeId: "mindmap-legend-unknown-type",
    sample: (parent, doc) =>
      appendLegendEdgeSample(parent, doc, "unknown-type"),
  },
  {
    localeId: "mindmap-legend-parent-child-tie",
    sample: (parent, doc) => appendLegendEdgeSample(parent, doc, "tie"),
  },
  {
    localeId: "mindmap-legend-external-node",
    sample: appendLegendNodeSample,
  },
  {
    localeId: "mindmap-legend-group-region",
    sample: appendLegendGroupSample,
  },
  {
    localeId: "mindmap-legend-group-membership",
    sample: appendLegendGroupPipSample,
  },
];

function buildLegend(doc: Document): HTMLElement {
  const legend = doc.createElement("div");
  legend.classList.add(LEGEND_CLASS);
  legend.addEventListener("mousedown", (evt) => evt.stopPropagation());

  const heading = doc.createElement("div");
  heading.classList.add("mindmap-legend-heading");
  heading.setAttribute("data-l10n-id", getLocaleID("mindmap-legend-heading"));
  legend.appendChild(heading);

  const list = doc.createElement("ul");
  list.classList.add("mindmap-legend-list");
  for (const row of LEGEND_ROWS) {
    const item = doc.createElement("li");
    item.classList.add("mindmap-legend-row");
    row.sample(item, doc);
    const label = doc.createElement("span");
    label.setAttribute("data-l10n-id", getLocaleID(row.localeId));
    item.appendChild(label);
    list.appendChild(item);
  }
  legend.appendChild(list);
  return legend;
}

/** Class of the div each render mounts its Cytoscape instance in. */
export { MOUNT_CLASS };
export const TOOLBAR_CLASS = "mindmap-graph-toolbar";
export const ZOOM_OUT_BUTTON_CLASS = "mindmap-zoom-out-button";
export const ZOOM_IN_BUTTON_CLASS = "mindmap-zoom-in-button";
export const FIT_BUTTON_CLASS = "mindmap-fit-button";
export const RELAYOUT_BUTTON_CLASS = "mindmap-relayout-button";
export const LEGEND_TOGGLE_BUTTON_CLASS = "mindmap-legend-toggle-button";

const ZOOM_STEP = 1.2;

const LEGEND_COLLAPSED_PREF_KEY = config.prefsPrefix + ".legendCollapsed";

function readLegendCollapsed(): boolean {
  return Zotero.Prefs.get(LEGEND_COLLAPSED_PREF_KEY, true) === true;
}

function writeLegendCollapsed(collapsed: boolean): void {
  Zotero.Prefs.set(LEGEND_COLLAPSED_PREF_KEY, collapsed, true);
}

function appendToolbarButton(
  toolbar: HTMLElement,
  doc: Document,
  className: string,
  localeId: FluentMessageId,
  icon: (parent: Element, doc: Document) => void,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.classList.add("mindmap-icon-button", className);
  button.setAttribute("data-l10n-id", getLocaleID(localeId));
  icon(button, doc);
  button.addEventListener("click", onClick);
  toolbar.appendChild(button);
  return button;
}

/**
 * Recomputes node positions and persists them, discarding what was stored.
 *
 * Two scopes, decided by what is selected on the canvas rather than by a
 * second control: with nodes selected only those move, with nothing selected
 * the whole mindmap is laid out again. The confirm names which of the two is
 * about to happen, because the two are otherwise distinguishable only by what
 * the user remembers selecting.
 *
 * Group containers are excluded from the selection count: a group is a
 * compound node with no stored position, so selecting one is not a request to
 * move anything by itself.
 *
 * The write goes through the same path a drag uses, so a re-layout is one
 * write and updates the rendered-state guard the live-refresh observer reads.
 */
async function runRelayout(
  cy: cytoscape.Core,
  container: HTMLElement,
  mindmapId: string,
  rendered: RenderedState,
): Promise<void> {
  const win = container.ownerDocument?.defaultView as unknown as
    mozIDOMWindowProxy | undefined;
  if (!win) {
    return;
  }

  const selected = cy.nodes(":selected");
  const scoped = !selected.empty();
  const count = selected.length;

  const confirmed = Services.prompt.confirm(
    win,
    getString("mindmap-relayout-confirm-title"),
    scoped
      ? getString("mindmap-relayout-confirm-selection", { args: { count } })
      : getString("mindmap-relayout-confirm-all"),
  );
  if (!confirmed) {
    return;
  }

  try {
    const positions = await relayoutPositions(
      cy,
      scoped ? selected.map((node) => node.id()) : undefined,
    );
    if (positions.size === 0) {
      return;
    }
    await persistNodePositions(mindmapId, positions, rendered);
  } catch (err) {
    logFailure(
      `[zoteroLinkedMindmaps] re-layout failed: ${(err as Error).message}`,
      err as Error,
    );
  }
}

/**
 * Zoom and fit touch the viewport only - cy.zoom()/cy.fit() move the camera,
 * never a node's stored position, which is what keeps this control clear of
 * the drag-write path entirely (AC #4).
 */
function attachViewControls(
  cy: cytoscape.Core,
  container: HTMLElement,
  mindmapId: string,
  rendered: RenderedState,
): void {
  const doc = container.ownerDocument!;

  const toolbar = doc.createElement("div");
  toolbar.classList.add(TOOLBAR_CLASS);
  toolbar.addEventListener("mousedown", (evt) => evt.stopPropagation());

  appendToolbarButton(
    toolbar,
    doc,
    ZOOM_OUT_BUTTON_CLASS,
    "mindmap-zoom-out-button",
    (parent, d) => appendZoomIcon(parent, d, "out"),
    () => cy.zoom(cy.zoom() / ZOOM_STEP),
  );
  appendToolbarButton(
    toolbar,
    doc,
    ZOOM_IN_BUTTON_CLASS,
    "mindmap-zoom-in-button",
    (parent, d) => appendZoomIcon(parent, d, "in"),
    () => cy.zoom(cy.zoom() * ZOOM_STEP),
  );
  appendToolbarButton(
    toolbar,
    doc,
    FIT_BUTTON_CLASS,
    "mindmap-fit-button",
    appendFitIcon,
    () => cy.fit(undefined, 30),
  );

  appendToolbarButton(
    toolbar,
    doc,
    RELAYOUT_BUTTON_CLASS,
    "mindmap-relayout-button",
    appendRelayoutIcon,
    () => void runRelayout(cy, container, mindmapId, rendered),
  );

  let legend: HTMLElement | undefined;
  function setLegendVisible(visible: boolean): void {
    if (visible && !legend) {
      legend = buildLegend(doc);
      container.appendChild(legend);
    } else if (!visible && legend) {
      legend.remove();
      legend = undefined;
    }
  }
  setLegendVisible(!readLegendCollapsed());

  appendToolbarButton(
    toolbar,
    doc,
    LEGEND_TOGGLE_BUTTON_CLASS,
    "mindmap-legend-toggle-button",
    appendLegendToggleIcon,
    () => {
      const nowVisible = !legend;
      setLegendVisible(nowVisible);
      writeLegendCollapsed(!nowVisible);
    },
  );

  container.appendChild(toolbar);
}

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
  dockPort: DockPort,
  ref: ZoteroObjectRef,
  mindmapId?: string,
  openAddLink = false,
): void {
  dockPort.write((dockContainer) => {
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
      () => void dockPort.write(hideDock),
    );
    const connections = dockContainer.ownerDocument!.createElement("div");
    dockContainer.appendChild(connections);
    void renderConnectionsContent(connections, item, mindmapId, openAddLink);
  });
}

/**
 * A bare dock element (a test, or a render without an area) has no area to
 * ask, so every write goes straight through.
 */
function toDockPort(dock: HTMLElement | DockPort): DockPort {
  return "write" in dock
    ? dock
    : {
        write(fn) {
          fn(dock);
          return true;
        },
      };
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
  dock?: HTMLElement | DockPort,
  mindmapId?: string,
): void {
  const dockPort = dock && toDockPort(dock);
  cy.on("tap", "node", (evt) => {
    // A modifier held on the tap means the user is building a multi-select,
    // not asking to see a node's detail - docking here would change the
    // tab's layout mid-gesture instead of just growing the selection.
    const original = evt.originalEvent as MouseEvent | undefined;
    if (original?.shiftKey || original?.metaKey || original?.ctrlKey) {
      return;
    }
    const ref = nodeRefsById.get(evt.target.id());
    if (!ref || !dockPort) {
      return;
    }
    showNodeInDock(dockPort, ref, mindmapId);
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
    logFailure(
      `[zoteroLinkedMindmaps] persisting dragged node positions failed: ${(err as Error).message}`,
      err,
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
 * on destroy. A second listener added per render would pile up on the one
 * element, since cy.destroy() only removes bindings Cytoscape made itself.
 */
export function attachNodeContextMenuHandler(
  cy: cytoscape.Core,
  nodeRefsById: Map<string, ZoteroObjectRef>,
  dock: HTMLElement | DockPort,
  mindmapId?: string,
): void {
  const dockPort = toDockPort(dock);
  cy.on("cxttap", "node", (evt) => {
    const ref = nodeRefsById.get(evt.target.id());
    if (!ref) {
      return;
    }
    const menu = openMenu(cy);
    if (!menu) {
      return;
    }
    const addLink = appendMenuAction(
      menu,
      "add-link-button",
      appendAddLinkIcon,
      () => {
        closeMenu(cy);
        showNodeInDock(dockPort, ref, mindmapId, true);
      },
    );
    addLink.classList.add(NODE_MENU_ADD_LINK_CLASS);
    // Grouping rides this same proven cxttap path rather than the
    // empty-canvas one: only offered when the right-clicked node is itself
    // part of a selection of two or more nodes, so right-clicking an
    // unselected node while others are selected stays unambiguous (Add link
    // only).
    const selected = cy.$("node:selected");
    if (evt.target.selected() && selected.length >= 2) {
      const ids = selected.map((node) => node.id());
      appendL10nButton(menu, "mindmap-group-create", () => {
        void applyGroupingMutation(cy, mindmapId, (doc) =>
          createGroup(doc, ids),
        );
      });
    }
    positionMenuBesideNode(cy.container()!, menu, evt.target);
  });
}

export const GROUP_MENU_CLASS = "mindmap-group-menu";
export const MENU_ACTION_CLASS = "mindmap-menu-action";

const menuDismissCleanups = new WeakMap<HTMLElement, () => void>();

/**
 * A small menu drawn into the graph container, positioned once its content is
 * built (positionMenuAt/positionMenuBesideNode). A DOM popup rather than a
 * native context menu for the same reason the Connections dock is one: it
 * doesn't block, and it can hold an inline text field.
 */
function openMenu(cy: cytoscape.Core): HTMLElement | null {
  closeMenu(cy);
  const container = cy.container();
  if (!container) {
    return null;
  }
  const doc = container.ownerDocument!;
  const menu = doc.createElement("div");
  menu.classList.add(GROUP_MENU_CLASS);
  menu.style.cssText = "position: absolute; left: 0px; top: 0px; z-index: 10;";
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
  attachMenuDismissal(cy, menu);
  return menu;
}

/**
 * Escape and an outside click both close whatever menu is open (AC #7). The
 * outside-click listener runs on the capture phase, before any target's own
 * bubble-phase stopPropagation (including the menu's own, and the toolbar's)
 * can suppress it, so it needs no cooperation from anything else on the page
 * to see every mousedown.
 */
function attachMenuDismissal(cy: cytoscape.Core, menu: HTMLElement): void {
  const win = menu.ownerDocument!.defaultView!;
  function onKeyDown(evt: KeyboardEvent): void {
    if (evt.key === "Escape") {
      closeMenu(cy);
    }
  }
  function onOutsideMouseDown(evt: Event): void {
    if (!menu.contains(evt.target as Node)) {
      closeMenu(cy);
    }
  }
  win.addEventListener("keydown", onKeyDown);
  win.addEventListener("mousedown", onOutsideMouseDown, true);
  menuDismissCleanups.set(menu, () => {
    win.removeEventListener("keydown", onKeyDown);
    win.removeEventListener("mousedown", onOutsideMouseDown, true);
  });
}

function closeMenu(cy: cytoscape.Core): void {
  cy.container()
    ?.querySelectorAll(`.${GROUP_MENU_CLASS}`)
    .forEach((menu: Element) => {
      menuDismissCleanups.get(menu as HTMLElement)?.();
      menuDismissCleanups.delete(menu as HTMLElement);
      menu.remove();
    });
}

/** Clamps a menu's top-left corner so its whole box stays inside container. */
function positionMenuAt(
  container: HTMLElement,
  menu: HTMLElement,
  x: number,
  y: number,
): void {
  const maxLeft = Math.max(0, container.clientWidth - menu.offsetWidth);
  const maxTop = Math.max(0, container.clientHeight - menu.offsetHeight);
  menu.style.left = `${Math.min(Math.max(x, 0), maxLeft)}px`;
  menu.style.top = `${Math.min(Math.max(y, 0), maxTop)}px`;
}

/**
 * Places a menu to the right of the node it acts on, so it never opens on
 * top of the thing that was just clicked (AC #6). Falls back to the node's
 * left side when the right doesn't fit, and positionMenuAt clamps whichever
 * side is chosen to stay inside the viewport near every edge.
 */
function positionMenuBesideNode(
  container: HTMLElement,
  menu: HTMLElement,
  node: cytoscape.NodeSingular,
): void {
  const box = node.renderedBoundingBox();
  const gap = 8;
  let left = box.x2 + gap;
  if (left + menu.offsetWidth > container.clientWidth) {
    left = box.x1 - gap - menu.offsetWidth;
  }
  positionMenuAt(container, menu, left, box.y1);
}

/**
 * A menu row with its own 16px icon (AC #5). The label goes on a child span
 * rather than the button itself: a Fluent message with a value overwrites
 * whatever element it targets, which would wipe out the icon if applied to
 * the button directly.
 */
function appendMenuAction(
  menu: HTMLElement,
  localeId: FluentMessageId,
  icon: (parent: Element, doc: Document) => void,
  onClick: () => void,
): HTMLButtonElement {
  const doc = menu.ownerDocument!;
  const button = doc.createElement("button");
  button.classList.add(MENU_ACTION_CLASS);
  icon(button, doc);
  const label = doc.createElement("span");
  label.setAttribute("data-l10n-id", getLocaleID(localeId));
  button.appendChild(label);
  button.addEventListener("click", onClick);
  menu.appendChild(button);
  return button;
}

/**
 * Writes a grouping mutation (create/rename/delete) to the mindmap document
 * and closes whatever menu is open. Shared by the background and node
 * cxttap handlers so grouping has one write path regardless of which menu it
 * was reached from. Nothing redraws here on purpose: the write fires a
 * modify notification and the live-refresh observer rebuilds the graph from
 * what was stored.
 */
async function applyGroupingMutation(
  cy: cytoscape.Core,
  mindmapId: string | undefined,
  mutate: (doc: MindmapDocument) => void,
): Promise<void> {
  closeMenu(cy);
  try {
    await updateMindmapDocument((doc) => {
      mutate(doc);
      return doc;
    }, mindmapId);
  } catch (err) {
    logFailure(
      `[zoteroLinkedMindmaps] grouping change failed: ${(err as Error).message}`,
      err,
    );
  }
}

/**
 * Grouping, driven from right-click: on empty canvas with two or more nodes
 * selected, offer to group them; on a group's own region, offer to rename or
 * dissolve it. Selection itself is Cytoscape's (shift-click, box-select), so
 * there is no selection model of our own to keep in step.
 */
/**
 * The grouping menu, opened by right-clicking the canvas.
 *
 * Two actions can be offered by the same click and both are appended when they
 * apply: "group these" when two or more nodes are selected, and rename/delete
 * when the click landed inside a group's region. Neither claims the gesture, so
 * a right-click inside a region while nodes are selected offers all three
 * rather than picking a mode on the user's behalf.
 *
 * A group used to be a Cytoscape node, so rename and delete could hang off
 * right-clicking it. The region is drawn rather than laid out, so there is no
 * node to hit and the position is tested against the region geometry instead.
 */
export function attachGroupingHandlers(
  cy: cytoscape.Core,
  mindmapId: string,
  overlay?: GroupOverlay,
  groupNames: Map<string, string> = new Map(),
): void {
  cy.on("cxttap", (evt) => {
    if (evt.target !== cy) {
      return;
    }
    const selected = cy.$("node:selected");
    // A group of one says nothing the node doesn't already, so two is the
    // floor for offering to create one.
    const canGroup = selected.length >= 2;
    const groupId = overlay?.hitTest(evt.position) ?? null;
    if (!canGroup && !groupId) {
      closeMenu(cy);
      return;
    }
    const menu = openMenu(cy);
    if (!menu) {
      return;
    }

    if (canGroup) {
      const ids = selected.map((node) => node.id());
      appendL10nButton(menu, "mindmap-group-create", () => {
        void applyGroupingMutation(cy, mindmapId, (doc) =>
          createGroup(doc, ids),
        );
      });
    }

    if (groupId) {
      const nameInput = menu.ownerDocument!.createElement("input");
      nameInput.type = "text";
      nameInput.value = groupNames.get(groupId) ?? "";
      menu.appendChild(nameInput);

      appendL10nButton(menu, "mindmap-group-rename", () => {
        void applyGroupingMutation(cy, mindmapId, (doc) =>
          renameGroup(doc, groupId, nameInput.value.trim()),
        );
      });
      appendL10nButton(menu, "mindmap-group-delete", () => {
        void applyGroupingMutation(cy, mindmapId, (doc) =>
          deleteGroup(doc, groupId),
        );
      });
    }

    positionMenuAt(
      cy.container()!,
      menu,
      evt.renderedPosition.x,
      evt.renderedPosition.y,
    );
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

/**
 * One rendered graph: the Cytoscape instance and the mount div it owns.
 * Everything the render adds (toolbar, legend, menus, group overlay) lives
 * inside the mount, so disposing the handle removes exactly that and nothing
 * a neighbour painted into the same container.
 */
export interface MindmapHandle {
  readonly cy: cytoscape.Core;
  readonly mount: HTMLElement;
  /** Destroys the instance and removes the mount. Safe to call twice. */
  dispose(): void;
}

/**
 * Test-only seam. `beforeGraphRender` (awaited when set) runs inside a live-refresh rebuild
 * after its last await and just before the new graph is rendered, which is
 * the point a concurrent panel paint cannot otherwise be placed at. Unset in
 * production.
 */
export const liveRefreshTestHooks: {
  beforeGraphRender?: () => void | Promise<void>;
} = {};

/**
 * Renders into a `mount` the caller has already attached, so Cytoscape
 * measures a live element. Synchronous: the graph area runs it inside a paint
 * so nothing can interleave between disposing the old content and recording
 * this one.
 */
export function renderMindmapInto(
  mount: HTMLElement,
  doc: MindmapDocument,
  linkTypes: LinkType[],
  dock?: HTMLElement | DockPort,
  rendered: RenderedState = { document: null },
): MindmapHandle {
  const win = mount.ownerDocument!.defaultView!;
  ensureDocumentHead(mount.ownerDocument!);
  ensureCytoscapeWindowGlobals(win);
  const dockPort = dock && toDockPort(dock);

  const typeMap = new Map(linkTypes.map((type) => [type.id, type]));
  const parallelOffsets = computeParallelOffsets(doc.links);
  const nodeRefsById = new Map(doc.nodes.map((node) => [node.id, node.ref]));
  const piled = piledNodeIds(doc.nodes);

  rendered.document = serializeDocument(doc);
  try {
    return buildGraph();
  } catch (err) {
    // cytoscape() registers the instance on the mount before it validates the
    // elements, so a throw would otherwise strand a live instance.
    (
      mount as unknown as { _cyreg?: { cy?: cytoscape.Core } }
    )._cyreg?.cy?.destroy();
    throw err;
  }

  function buildGraph(): MindmapHandle {
    const cy = cytoscape({
      container: mount,
      elements: {
        nodes: doc.nodes.map((node) => buildNodeElement(node, piled)),
        // Ties come after the real links, so an authored link between the same
        // parent and child paints (and keeps its label) above the plain tie.
        edges: [
          ...doc.links.map((link) =>
            buildEdgeElement(link, typeMap, parallelOffsets.get(link.id) ?? 0),
          ),
          ...buildParentChildTies(doc.nodes),
        ],
      },
      style: buildStylesheet(win),
      layout: { name: "preset" },
    });
    observeContainerSize(cy, mount, win);
    attachViewControls(cy, mount, doc.id, rendered);
    attachNodeClickHandler(cy, nodeRefsById, dockPort, doc.id);
    attachNodeDragHandler(cy, doc.id, rendered);
    const overlay = attachGroupOverlay(cy, doc, mount);
    attachGroupingHandlers(
      cy,
      doc.id,
      overlay,
      new Map((doc.groups ?? []).map((group) => [group.id, group.name ?? ""])),
    );
    cy.on("destroy", () => overlay.destroy());
    if (dockPort) {
      attachNodeContextMenuHandler(cy, nodeRefsById, dockPort, doc.id);
    }
    return {
      cy,
      mount,
      dispose() {
        if (!cy.destroyed()) {
          cy.destroy();
        }
        mount.remove();
      },
    };
  }
}

/**
 * Renders into a mount of its own inside `container`, outside any graph
 * area. Cytoscape's destroy() empties whatever container it was given, so a
 * mount of its own keeps disposing one instance from erasing what a
 * neighbour painted into the same container. The mount takes the container's
 * sizing and is attached before construction.
 */
export async function renderMindmap(
  container: HTMLElement,
  doc: MindmapDocument,
  linkTypes: LinkType[],
  dockContainer?: HTMLElement,
  rendered: RenderedState = { document: null },
): Promise<MindmapHandle> {
  const mount = container.ownerDocument!.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  mount.className = MOUNT_CLASS;
  mount.style.cssText =
    "width: 100%; height: 100%; min-width: 0; position: relative;";
  container.appendChild(mount);
  return renderMindmapInto(mount, doc, linkTypes, dockContainer, rendered);
}

/** What a live-refresh observer currently has on screen. */
export type LiveRefreshView =
  | "graph"
  | "note-trashed"
  | "container-trashed"
  | "unreadable"
  | "deleted"
  | "superseded";

/**
 * The teardown function, carrying `view()` so the caller can tell a live
 * graph from one of the observer's own state panels without keeping a second
 * belief about it. `view()` reads the graph area: "superseded" once another
 * owner holds it (or after teardown), and "unreadable" when a graph build
 * threw and left nothing on screen, which a later notification retries.
 */
export type LiveRefreshHandle = (() => void) & { view(): LiveRefreshView };

/**
 * Keeps the rendered graph in sync with the storage note without a full
 * plugin reload (AC #3). Rebuilds via a full destroy-and-rebuild rather
 * than an in-place diff - a deliberate simplicity choice for v1's expected
 * corpus size (dozens-to-low-hundreds of nodes), not a shortcut to revisit
 * unprompted.
 *
 * The graph is not the only thing that can go stale: the note can be erased
 * (locally, or by a synced remote deletion), and either the note itself or
 * its container can be trashed, which hides it from Zotero.Search without
 * erasing it. Both replace the graph with a state panel rather than
 * redrawing stale content - deleted is terminal (the note is gone for
 * good), trashed clears itself once the note or its container is restored.
 *
 * Every write goes through the graph area with a claim taken when the
 * observer decides to write (see graphArea.ts). A graph rebuild claims before
 * its note read, so a panel decided from any fact discovered meanwhile
 * supersedes it and its paint is refused; the old graph stays on screen until
 * the swap. A superseded rebuild does not retry itself: whatever superseded it
 * owns the screen, and a later notification is what asks for a graph again.
 *
 * Returns a teardown function (with `view()`, see LiveRefreshHandle) that
 * unregisters the observer and releases the area it still holds.
 */
export function attachLiveRefresh(
  area: GraphArea,
  storageNoteItemID: number,
  linkTypes: LinkType[],
  rendered: RenderedState = { document: null },
): LiveRefreshHandle {
  type ViewKind = Exclude<LiveRefreshView, "superseded">;
  type PanelKind = Exclude<ViewKind, "graph">;
  // Set by the returned teardown. A disposed observer must never claim the
  // area again: whoever tore this down owns it, and a claim here would
  // supersede theirs. Painting needs no such check, since a superseded claim
  // is refused by the area itself.
  let disposed = false;
  // The latest claim this observer took, so teardown can release exactly what
  // it still holds. Every decision to write takes a fresh one.
  let lastClaim = area.claim("live");
  let refreshing = false;
  let dirty = false;

  function claimLive(): Claim | undefined {
    if (disposed) {
      return undefined;
    }
    lastClaim = area.claim("live");
    return lastClaim;
  }

  function currentView(): LiveRefreshView {
    const { owner, kind } = area.current();
    if (owner !== "live") {
      return "superseded";
    }
    if (kind === "graph") {
      return "graph";
    }
    if (kind === "failed") {
      return "unreadable";
    }
    return kind.startsWith("panel:")
      ? (kind.slice("panel:".length) as PanelKind)
      : "superseded";
  }

  // Deleted is terminal: the note is gone for good, so no later request may
  // paint over it. This is a rule, not a race, so it is read from the area
  // before every claim rather than inferred from claim order.
  function isDeleted(): boolean {
    return area.current().kind === "panel:deleted";
  }

  // The id of the container this note hangs off, read once up front so
  // notify() can recognise a notification about it with nothing more than an
  // id comparison. Left undefined if the read loses a race with the note
  // being gone already; a container notification then simply does nothing.
  let containerItemID: number | undefined;
  void (async () => {
    try {
      const note = (await Zotero.Items.getAsync(storageNoteItemID)) as
        Zotero.Item | false;
      if (note && typeof note.parentItemID === "number") {
        containerItemID = note.parentItemID;
      }
    } catch (err) {
      logFailure(
        `[zoteroLinkedMindmaps] mindmap live refresh could not read the note's container: ${(err as Error).message}`,
        err,
      );
    }
  })();

  const PANEL_MESSAGE: Record<PanelKind, FluentMessageId> = {
    "note-trashed": "mindmap-note-trashed-state",
    "container-trashed": "mindmap-trashed-state",
    unreadable: "mindmap-unreadable-state",
    deleted: "mindmap-deleted-state",
  };

  /**
   * Ground truth for whether a panel should be showing, re-read from the
   * note's and its container's own `.deleted` flags rather than trusted from
   * whatever a caller assumed when it decided to check. Also refreshes
   * `containerItemID` from the note's current parentItemID: a note
   * reparented while the tab is open would otherwise leave this watching a
   * container that is no longer its own, and the very reparent fires a
   * "modify" on the note's own id that reaches here and heals it. Cleared to
   * undefined rather than left stale when the note is now top-level, or
   * trashing the old container would blank a mindmap that is still fully
   * readable.
   *
   * A note trashed on its own takes priority over its container when both
   * are trashed at once, since the two mean different things: a trashed note
   * is this one mindmap gone missing, a trashed container is every mindmap
   * in the library gone missing.
   */
  async function readTrashState(): Promise<Exclude<ViewKind, "graph"> | null> {
    const note = (await Zotero.Items.getAsync(storageNoteItemID)) as
      Zotero.Item | false;
    if (note) {
      containerItemID =
        typeof note.parentItemID === "number" ? note.parentItemID : undefined;
    }
    if (note && note.deleted) {
      return "note-trashed";
    }
    if (containerItemID !== undefined) {
      const containerItem = (await Zotero.Items.getAsync(containerItemID)) as
        Zotero.Item | false;
      if (containerItem && containerItem.deleted) {
        return "container-trashed";
      }
    }
    return null;
  }

  /**
   * Swaps whatever is on screen for a one-line explanation of why the graph
   * isn't showing. The area destroys the graph rather than leaving it
   * underneath: a destroyed Cytoscape instance has no live event handlers,
   * which is what stops a drag or edit from landing on a note that's gone or
   * unreachable. Refused when `claim` has been superseded.
   */
  function paintPanel(claim: Claim, view: PanelKind): void {
    area.paint(claim, `panel:${view}`, panelBuilder(view));
  }

  function panelBuilder(view: PanelKind): (mount: HTMLElement) => void {
    return (mount) => {
      const message = mount.ownerDocument!.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "p",
      ) as unknown as HTMLParagraphElement;
      message.id = "zoterolinkedmindmaps-mindmap-live-state";
      if (view === "unreadable") {
        // Plural message, so Fluent formats it from the window's own context.
        message.setAttribute("data-l10n-id", getLocaleID(PANEL_MESSAGE[view]));
        message.setAttribute("data-l10n-args", JSON.stringify({ count: 1 }));
      } else {
        message.textContent = getString(PANEL_MESSAGE[view]);
      }
      mount.appendChild(message as unknown as Node);
    };
  }

  /**
   * Every write here goes through the area with a claim taken at the moment
   * of the decision, so a later decision always wins: whatever claimed after
   * this one started makes its paint a no-op. Deleted is terminal and
   * absorbing: once shown, every later request (including a second
   * "deleted") is refused outright.
   *
   * A panel request claims and paints in one synchronous run. A graph
   * request claims first, before its note read: a panel decided from any
   * fact discovered while that read is in flight then supersedes it. It
   * re-checks trashed state itself rather than trusting whoever queued it,
   * since the request can be a plain retry with no notification behind it.
   * readTrashState only speaks to trashed, not erased; deleted is read from
   * the area right before the paint.
   *
   * It also skips the redraw entirely when the stored document already
   * matches what a live graph is showing (the common case for a drag's own
   * write notification), but only while a graph is actually on screen:
   * coming back from a panel always redraws.
   */
  async function applyView(kind: ViewKind): Promise<void> {
    if (disposed || isDeleted()) {
      return;
    }
    const claim = claimLive();
    if (!claim) {
      return;
    }
    if (kind !== "graph") {
      paintPanel(claim, kind);
      return;
    }
    try {
      // Reads the note this graph was opened from rather than looking a
      // mindmap up again: with several mindmaps in the library, an id-less
      // lookup would resolve to whichever one happens to sort first.
      const item = (await Zotero.Items.getAsync(
        storageNoteItemID,
      )) as Zotero.Item;
      let doc: MindmapDocument;
      try {
        doc = readDocumentFromNote(await refreshNote(item));
      } catch (err) {
        // A graph already on screen is still correct and stays. A panel that
        // is up must not keep claiming the note is trashed once the note is
        // back but no longer parses.
        if (
          err instanceof StorageError &&
          !disposed &&
          area.current().kind !== "graph" &&
          !isDeleted()
        ) {
          const trashed = await readTrashState();
          if (!isDeleted()) {
            paintPanel(claim, trashed ?? "unreadable");
          }
        }
        throw err;
      }
      const trashState = await readTrashState();
      if (disposed || isDeleted()) {
        return;
      }
      if (trashState) {
        paintPanel(claim, trashState);
        return;
      }
      if (
        area.current().kind === "graph" &&
        serializeDocument(doc) === rendered.document
      ) {
        return;
      }
      if (liveRefreshTestHooks.beforeGraphRender) {
        await liveRefreshTestHooks.beforeGraphRender();
      }
      // The old graph stays on screen until this swap: the area disposes it
      // and builds the new one in one synchronous run, and refuses both when
      // another writer claimed in the meantime.
      const next = area.paint(
        claim,
        "graph",
        (mount) =>
          renderMindmapInto(mount, doc, linkTypes, area.dockPort, rendered),
        {
          keepDock: area.current().kind === "graph",
          // A stored document the renderer cannot draw (a link to a node that
          // is not there) must leave the reason on screen, not a blank area.
          onError: {
            kind: "panel:unreadable",
            build: panelBuilder("unreadable"),
          },
        },
      );
      if (!next) {
        return;
      }
      await layoutUnplacedNodes(next.cy, doc, () => area.isCurrent(claim));
    } catch (err) {
      logFailure(
        `[zoteroLinkedMindmaps] mindmap live refresh failed: ${(err as Error).message}`,
        err,
      );
    }
  }

  /**
   * Runs one graph rebuild at a time, and runs another straight after when a
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
          await applyView("graph");
        } while (dirty);
      } finally {
        refreshing = false;
      }
    })();
  }

  /**
   * Reacts to a note or container notification by re-reading trashed state
   * (readTrashState) rather than trusting which event name or which of the
   * two ids carried the notification: trashing either one fires a "modify"
   * immediately followed by a "trash", but restoring it (clearing `deleted`
   * and saving) fires only a "modify" - measured against a live Zotero, not
   * assumed.
   *
   * Always asks applyView for the derived view when it differs from
   * `currentView`, rather than gating on whether some coarser "am I showing
   * a panel at all" flag changed. That distinction matters because the note
   * and the container can each be trashed and restored independently, in
   * either order: a check that only asks "is anything trashed" cannot tell
   * "still trashed, but the cause flipped" from "nothing changed", so it
   * never re-renders when the note is restored while the container is still
   * trashed (or the reverse), and the panel goes on naming whichever was
   * trashed first for the rest of the session.
   *
   * A panel is requested directly and immediately, since readTrashState
   * already re-read the ground truth this decision needs; going back to
   * live only ever runs through `schedule()` below, since applyView still
   * has to re-read the note's own content before it knows whether there is
   * even anything to redraw.
   *
   * `contentMayHaveChanged` covers a plain edit on the note itself, which
   * only its own notification carries; a container's own fields never touch
   * the mindmap's document, so its notification only earns a rebuild when
   * it's the one that flips the tab back from "live".
   */
  function scheduleTrashCheck(contentMayHaveChanged: boolean): void {
    void (async () => {
      try {
        const trashState = await readTrashState();
        // A delete landing while this was already in flight is terminal; a
        // check that started before it must not undo that.
        if (disposed || isDeleted()) {
          return;
        }
        if (trashState) {
          // Claims even when this very panel is already up: a rebuild in
          // flight was decided before this fact and must not paint a graph
          // over it.
          const claim = claimLive();
          if (claim && area.current().kind !== `panel:${trashState}`) {
            paintPanel(claim, trashState);
          }
          return;
        }
        const wasShowingPanel = area.current().kind !== "graph";
        if (contentMayHaveChanged || wasShowingPanel) {
          schedule();
        }
      } catch (err) {
        logFailure(
          `[zoteroLinkedMindmaps] mindmap trash check failed: ${(err as Error).message}`,
          err,
        );
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
   * awaited, and nothing added here (the state panel swap, the container
   * re-check) awaits a queued write either.
   */
  function notify(
    event: _ZoteroTypes.Notifier.Event,
    type: _ZoteroTypes.Notifier.Type,
    ids: string[] | number[],
  ): void {
    // Deleted is terminal: the note is gone for good, so nothing past this
    // point is worth reacting to.
    if (type !== "item" || isDeleted()) {
      return;
    }
    const idNums = ids.map(Number);
    if (event === "delete" && idNums.includes(storageNoteItemID)) {
      void applyView("deleted");
      return;
    }
    if (
      (event === "modify" || event === "trash") &&
      idNums.includes(storageNoteItemID)
    ) {
      scheduleTrashCheck(true);
      return;
    }
    if (
      containerItemID !== undefined &&
      (event === "modify" || event === "trash") &&
      idNums.includes(containerItemID)
    ) {
      scheduleTrashCheck(false);
    }
  }

  const observerID = Zotero.Notifier.registerObserver(
    { notify },
    ["item"],
    "zoterolinkedmindmaps-mindmap-live-refresh",
  );

  // The note or its container can have been trashed between the caller
  // reading the note and this observer registering; no notification will
  // arrive for that, so ask once.
  scheduleTrashCheck(false);

  const teardown = () => {
    disposed = true;
    Zotero.Notifier.unregisterObserver(observerID);
    area.clear(lastClaim);
  };
  return Object.assign(teardown, { view: currentView });
}

import type cytoscape from "cytoscape";

import {
  regionArea,
  regionBounds,
  regionContains,
  regionLabelAnchor,
  regionShapes,
  type RegionShape,
} from "./groupRegions";
import type { MindmapDocument, Position } from "./schema";

const SVG_NS = "http://www.w3.org/2000/svg";

export const GROUP_OVERLAY_CLASS = "mindmap-group-overlay";
export const GROUP_REGION_CLASS = "mindmap-group-region";
export const GROUP_REGION_LABEL_CLASS = "mindmap-group-region-label";

/** Model units, matching the 11px group label the compound node used to draw. */
const LABEL_FONT_SIZE = 11;
/**
 * Rough half-width per character at that font size, used to give the label a
 * hit box without measuring it. getBBox needs the element laid out, which is
 * not true in a headless render and not worth waiting for here.
 */
const LABEL_CHAR_HALF_WIDTH = 3;

export interface GroupOverlay {
  /** The group whose region covers `point`, smallest first, or null. */
  hitTest(point: Position): string | null;
  /** Recompute geometry from the graph's current node positions. */
  refresh(): void;
  destroy(): void;
}

interface GroupMembers {
  id: string;
  name: string;
  nodeIds: string[];
}

function readGroups(doc: MindmapDocument): GroupMembers[] {
  return (doc.groups ?? [])
    .map((group) => ({
      id: group.id,
      name: group.name ?? "",
      nodeIds: doc.nodes
        .filter((node) => node.groupId === group.id)
        .map((node) => node.id),
    }))
    .filter((group) => group.nodeIds.length > 0);
}

function labelHitBox(
  name: string,
  anchor: Position,
): { x1: number; y1: number; x2: number; y2: number } {
  const halfWidth = Math.max(1, name.length * LABEL_CHAR_HALF_WIDTH);
  return {
    x1: anchor.x - halfWidth,
    y1: anchor.y - LABEL_FONT_SIZE,
    x2: anchor.x + halfWidth,
    y2: anchor.y + 2,
  };
}

/**
 * Shapes go into a mask, not straight onto the canvas, and the region's colour
 * is then painted once through that mask.
 *
 * Stacking translucent shapes does not work here. A Zotero `--fill-*` token
 * carries its own alpha (`--fill-quarternary` resolves to
 * `rgba(255,255,255,0.12)`), so a halo drawn over the band meeting it composites
 * to roughly double the alpha and draws a visible ring at every join. Putting
 * one opacity on the parent `<g>` does not help: children composite among
 * themselves first, and the group opacity only scales the result. A mask
 * flattens the union to a single coverage value before any colour is applied,
 * which is the only arrangement that holds for a colour the plugin does not
 * control the alpha of.
 */
function appendShape(
  parent: Element,
  ownerDoc: Document,
  shape: RegionShape,
): void {
  // White is a mask coverage value, not a colour choice, so it is set here as a
  // presentation attribute rather than in the stylesheet the no-literals rule
  // governs.
  if (shape.kind === "halo") {
    const circle = ownerDoc.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(shape.x));
    circle.setAttribute("cy", String(shape.y));
    circle.setAttribute("r", String(shape.radius));
    circle.setAttribute("fill", "white");
    parent.appendChild(circle);
    return;
  }
  const line = ownerDoc.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(shape.x1));
  line.setAttribute("y1", String(shape.y1));
  line.setAttribute("x2", String(shape.x2));
  line.setAttribute("y2", String(shape.y2));
  line.setAttribute("stroke-width", String(shape.halfWidth * 2));
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke", "white");
  parent.appendChild(line);
}

/**
 * Draws each group as a region beneath the graph, and keeps it on the nodes.
 *
 * The overlay is inserted before Cytoscape's own canvas container rather than
 * given a negative z-index: that container is `position: relative; z-index: 0`
 * (cytoscape.cjs.js:35030), so with both at the same stacking level document
 * order decides, and the region paints under the edges and nodes.
 *
 * Geometry is held in the graph's model coordinates and the whole overlay is
 * transformed by the current pan and zoom, so panning and zooming rewrite one
 * attribute instead of recomputing every shape.
 */
export function attachGroupOverlay(
  cy: cytoscape.Core,
  doc: MindmapDocument,
  container: HTMLElement,
): GroupOverlay {
  const ownerDoc = container.ownerDocument!;
  const groups = readGroups(doc);

  const svg = ownerDoc.createElementNS(SVG_NS, "svg");
  svg.classList.add(GROUP_OVERLAY_CLASS);
  const root = ownerDoc.createElementNS(SVG_NS, "g");
  svg.appendChild(root);
  container.insertBefore(svg, container.firstChild);

  // groupId -> the shapes last drawn for it, so hit-testing answers from the
  // same geometry the user is looking at rather than recomputing it.
  let shapesByGroup = new Map<string, RegionShape[]>();

  function applyTransform(): void {
    const pan = cy.pan();
    const zoom = cy.zoom();
    root.setAttribute(
      "transform",
      `translate(${pan.x},${pan.y}) scale(${zoom})`,
    );
  }

  function positionsFor(nodeIds: string[]): {
    members: Position[];
    others: Position[];
  } {
    const wanted = new Set(nodeIds);
    const members: Position[] = [];
    const others: Position[] = [];
    cy.nodes().forEach((node) => {
      const { x, y } = node.position();
      (wanted.has(node.id()) ? members : others).push({ x, y });
    });
    return { members, others };
  }

  function draw(): void {
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
    const next = new Map<string, RegionShape[]>();
    for (const group of groups) {
      const { members, others } = positionsFor(group.nodeIds);
      const shapes = regionShapes(members, others);
      next.set(group.id, shapes);
      if (shapes.length === 0) {
        continue;
      }

      const bounds = regionBounds(shapes)!;
      const maskId = `mindmap-group-region-${group.id}`;

      const region = ownerDoc.createElementNS(SVG_NS, "g");
      region.classList.add(GROUP_REGION_CLASS);
      region.setAttribute("data-group-id", group.id);

      const mask = ownerDoc.createElementNS(SVG_NS, "mask");
      mask.setAttribute("id", maskId);
      // maskUnits is left at its default. It governs the mask's own extent,
      // which defaults to -10%/120% of the referencing element's bounding box
      // - here the rect covering the region, so the whole region is inside it.
      // Setting it to userSpaceOnUse makes those percentages resolve against
      // the viewport instead, which clips every band that runs outside.
      // maskContentUnits already defaults to user space, so the shapes stay in
      // the graph's model coordinates either way.
      for (const shape of shapes) {
        appendShape(mask, ownerDoc, shape);
      }
      region.appendChild(mask);

      // One rect over the region's extent, painted through the mask, so the
      // colour lands exactly once however much the shapes overlap.
      const fill = ownerDoc.createElementNS(SVG_NS, "rect");
      fill.setAttribute("x", String(bounds.x1));
      fill.setAttribute("y", String(bounds.y1));
      fill.setAttribute("width", String(bounds.x2 - bounds.x1));
      fill.setAttribute("height", String(bounds.y2 - bounds.y1));
      fill.setAttribute("mask", `url(#${maskId})`);
      region.appendChild(fill);

      root.appendChild(region);

      // The name is a sibling of the region, not a child of it: group opacity
      // multiplies down, so a label inside would be drawn at the region's
      // opacity however opaque its own rule made it.
      const anchor = regionLabelAnchor(shapes);
      if (anchor && group.name) {
        const text = ownerDoc.createElementNS(SVG_NS, "text");
        text.classList.add(GROUP_REGION_LABEL_CLASS);
        text.setAttribute("data-group-id", group.id);
        text.setAttribute("x", String(anchor.x));
        text.setAttribute("y", String(anchor.y));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", String(LABEL_FONT_SIZE));
        text.textContent = group.name;
        root.appendChild(text);
      }
    }
    shapesByGroup = next;
    applyTransform();
  }

  // Batched on a microtask rather than an animation frame, matching
  // attachNodeDragHandler. A frame is the intuitive unit here, but a window
  // that is not being painted throttles requestAnimationFrame hard - measured
  // at ten seconds for a single frame in a test window - and a redraw that
  // waits on paint is a redraw that can be arbitrarily late. Cytoscape emits
  // its drag events one task per pointer event, so a microtask coalesces a
  // multi-node drag into one redraw per event either way.
  let drawScheduled = false;
  function scheduleDraw(): void {
    if (drawScheduled) {
      return;
    }
    drawScheduled = true;
    void Promise.resolve().then(() => {
      drawScheduled = false;
      if (cy.destroyed()) {
        return;
      }
      draw();
    });
  }

  // Both fire on every tick of a drag, mouse and touch alike
  // (cytoscape.cjs.js:26338, :27177), which is what makes the region follow
  // the drag rather than catch up when it is released.
  cy.on("position drag", "node", scheduleDraw);
  cy.on("pan zoom resize", applyTransform);

  draw();

  return {
    hitTest(point: Position): string | null {
      let best: { id: string; area: number } | null = null;
      for (const group of groups) {
        const shapes = shapesByGroup.get(group.id) ?? [];
        const anchor = group.name ? regionLabelAnchor(shapes) : null;
        const inLabel =
          anchor !== null &&
          (() => {
            const box = labelHitBox(group.name, anchor);
            return (
              point.x >= box.x1 &&
              point.x <= box.x2 &&
              point.y >= box.y1 &&
              point.y <= box.y2
            );
          })();
        if (!inLabel && !regionContains(shapes, point)) {
          continue;
        }
        const area = regionArea(shapes);
        if (!best || area < best.area) {
          best = { id: group.id, area };
        }
      }
      return best?.id ?? null;
    },
    refresh: draw,
    destroy(): void {
      cy.off("position drag", "node", scheduleDraw);
      cy.off("pan zoom resize", applyTransform);
      svg.remove();
    },
  };
}

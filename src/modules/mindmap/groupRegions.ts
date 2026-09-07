import type { Position } from "./schema";

/**
 * The shape of a group's region, in the graph's own model coordinates.
 *
 * A region is drawn rather than derived from a container, because a container
 * is a box fitted to its members and grouping never repositions anything: the
 * members sit wherever the layout or the user left them, and a box around
 * scattered members covers most of the canvas and swallows everything between
 * them. A halo per member joined by bands follows the members instead.
 */
export type RegionShape =
  | { kind: "halo"; x: number; y: number; radius: number }
  | {
      kind: "band";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      halfWidth: number;
    };

/** Half the 50px node width `buildStylesheet` sets. */
export const NODE_RADIUS = 25;
/** How far a halo reaches past the node it hugs, when nothing is in the way. */
export const HALO_REACH = 15;
export const MAX_HALO_RADIUS = NODE_RADIUS + HALO_REACH;
export const BAND_HALF_WIDTH = 22;

function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from `p` to the segment `a`-`b`, not to the infinite line. */
function distanceToSegment(p: Position, a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
        );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Minimum spanning tree over the member centres (Prim, O(n^2)). Dozens of
 * nodes is the expected corpus, so the quadratic form is cheaper than the
 * bookkeeping a heap would add.
 */
function spanningTree(points: Position[]): Array<[Position, Position]> {
  if (points.length < 2) {
    return [];
  }
  const joined = [0];
  const remaining = points.map((_, index) => index).slice(1);
  const edges: Array<[Position, Position]> = [];
  while (remaining.length > 0) {
    let best: { from: number; to: number; d: number } | null = null;
    for (const from of joined) {
      for (const to of remaining) {
        const d = distance(points[from], points[to]);
        if (!best || d < best.d) {
          best = { from, to, d };
        }
      }
    }
    edges.push([points[best!.from], points[best!.to]]);
    joined.push(best!.to);
    remaining.splice(remaining.indexOf(best!.to), 1);
  }
  return edges;
}

/**
 * The shapes making up one group's region: a halo around each member, plus a
 * band along each edge of the members' spanning tree.
 *
 * `others` are the node positions that are not in this group, and they shape
 * the result rather than just being ignored. A band that would run over one is
 * dropped, and a halo is pulled in to stop short of the nearest one. That is
 * what keeps the region from making a claim about a node that is not a member.
 * The one case it cannot cover is a non-member closer to a member than
 * `NODE_RADIUS`, where the two nodes already overlap on screen: the halo never
 * shrinks below the node it hugs, or it would disappear behind it.
 */
export function regionShapes(
  members: Position[],
  others: Position[] = [],
): RegionShape[] {
  if (members.length === 0) {
    return [];
  }

  const halos = members.map((member) => {
    const nearest = others.reduce(
      (min, other) => Math.min(min, distance(member, other)),
      Number.POSITIVE_INFINITY,
    );
    const radius = Math.max(
      NODE_RADIUS,
      Math.min(MAX_HALO_RADIUS, nearest - 1),
    );
    return { kind: "halo" as const, x: member.x, y: member.y, radius };
  });

  const bands = spanningTree(members)
    .filter(([a, b]) =>
      others.every((other) => distanceToSegment(other, a, b) > BAND_HALF_WIDTH),
    )
    .map(([a, b]) => ({
      kind: "band" as const,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      halfWidth: BAND_HALF_WIDTH,
    }));

  return [...bands, ...halos];
}

/** Whether `point` falls inside the region, matching what is drawn exactly. */
export function regionContains(
  shapes: RegionShape[],
  point: Position,
): boolean {
  return shapes.some((shape) =>
    shape.kind === "halo"
      ? distance(point, shape) <= shape.radius
      : distanceToSegment(
          point,
          { x: shape.x1, y: shape.y1 },
          { x: shape.x2, y: shape.y2 },
        ) <= shape.halfWidth,
  );
}

/** The region's bounding box, or null for a group with nothing to draw. */
export function regionBounds(shapes: RegionShape[]): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null {
  if (shapes.length === 0) {
    return null;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const shape of shapes) {
    if (shape.kind === "halo") {
      xs.push(shape.x - shape.radius, shape.x + shape.radius);
      ys.push(shape.y - shape.radius, shape.y + shape.radius);
    } else {
      xs.push(
        Math.min(shape.x1, shape.x2) - shape.halfWidth,
        Math.max(shape.x1, shape.x2) + shape.halfWidth,
      );
      ys.push(
        Math.min(shape.y1, shape.y2) - shape.halfWidth,
        Math.max(shape.y1, shape.y2) + shape.halfWidth,
      );
    }
  }
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

/**
 * Bounding-box area, used only to pick the smaller of two regions a click
 * landed in. A deliberate proxy for the union area, which is expensive to
 * compute and no better at ordering two regions by how specific they are.
 */
export function regionArea(shapes: RegionShape[]): number {
  const bounds = regionBounds(shapes);
  return bounds ? (bounds.x2 - bounds.x1) * (bounds.y2 - bounds.y1) : 0;
}

/**
 * Where the group's name goes: centred over the topmost halo, clear of it.
 * Anchored to a halo rather than to the bounding box so the name sits over a
 * member instead of floating above empty canvas when the region is L-shaped.
 */
export function regionLabelAnchor(shapes: RegionShape[]): Position | null {
  const halos = shapes.filter((shape) => shape.kind === "halo");
  if (halos.length === 0) {
    return null;
  }
  const top = halos.reduce((highest, halo) =>
    halo.y - halo.radius < highest.y - highest.radius ? halo : highest,
  );
  return { x: top.x, y: top.y - top.radius - 6 };
}

/** Model units, matching the 11px group label the compound node used to draw. */
export const LABEL_FONT_SIZE = 11;
/**
 * Rough half-width per character at that font size, used to give the label a
 * box without measuring it. getBBox needs the element laid out, which is not
 * true in a headless render and not worth waiting for here.
 */
const LABEL_CHAR_HALF_WIDTH = 3;
/** How far a label moves when it has to get out of another one's way. */
export const LABEL_LINE_HEIGHT = 13;

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The box a label occupies, used both for hit-testing and for separating two. */
export function labelBox(name: string, anchor: Position): Box {
  const halfWidth = Math.max(1, name.length * LABEL_CHAR_HALF_WIDTH);
  return {
    x1: anchor.x - halfWidth,
    y1: anchor.y - LABEL_FONT_SIZE,
    x2: anchor.x + halfWidth,
    y2: anchor.y + 2,
  };
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

/**
 * Moves labels down until none covers another, and returns the anchors in the
 * order they came in.
 *
 * Regions may overlap, so two names anchored over the topmost member of each
 * can land on top of one another and neither is then readable. Working top
 * down and pushing each label clear of the ones already placed keeps whichever
 * name is highest where it was, which is the one whose own region the reader
 * is most likely tracing. Two names far apart horizontally never collide, so
 * this collapses to the untouched placement whenever regions do not overlap.
 */
export function deconflictLabelAnchors(
  labels: Array<{ name: string; anchor: Position }>,
): Position[] {
  const order = labels
    .map((label, index) => ({ ...label, index }))
    .sort((a, b) => a.anchor.y - b.anchor.y || a.index - b.index);

  const placed: Box[] = [];
  const anchors: Position[] = new Array(labels.length);
  for (const label of order) {
    let anchor = label.anchor;
    let box = labelBox(label.name, anchor);
    // Each push clears at least the one box it collided with, so at most one
    // push per already-placed label is ever needed.
    for (let attempt = 0; attempt < placed.length; attempt += 1) {
      const hit = placed.find((other) => boxesOverlap(box, other));
      if (!hit) {
        break;
      }
      anchor = { x: anchor.x, y: hit.y2 + LABEL_LINE_HEIGHT };
      box = labelBox(label.name, anchor);
    }
    placed.push(box);
    anchors[label.index] = anchor;
  }
  return anchors;
}

/** How far a membership pip sits from its node's centre. */
export const PIP_RADIUS = 4;
const PIP_GAP = 3;

/**
 * Where a node's membership pips go: a row centred under it, one per group.
 *
 * Below the node rather than over it, because a pip on the node would cover
 * the label Cytoscape draws there. The row still falls inside a full-reach
 * halo, so a pip normally reads against its own group's fill.
 */
export function pipPositions(centre: Position, count: number): Position[] {
  const step = PIP_RADIUS * 2 + PIP_GAP;
  const first = centre.x - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_unused, index) => ({
    x: first + index * step,
    y: centre.y + NODE_RADIUS + PIP_RADIUS + 2,
  }));
}

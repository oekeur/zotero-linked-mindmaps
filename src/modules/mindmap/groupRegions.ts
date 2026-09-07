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

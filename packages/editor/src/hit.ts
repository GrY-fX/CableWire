import { angleOnArc, arcPoint, distanceToSegment, primitiveBounds } from '@cablewire/core';
import type { Bounds, Point, Primitive } from '@cablewire/core';

function inside(p: Point, b: Bounds): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function polylineDistance(p: Point, points: readonly Point[], closed: boolean): number {
  let best = Infinity;
  const n = points.length;
  for (let i = 0; i < n - 1 + (closed && n > 2 ? 1 : 0); i++) {
    best = Math.min(best, distanceToSegment(p, points[i]!, points[(i + 1) % n]!));
  }
  return n === 1 ? Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y) : best;
}

/** Point-in-polygon (even-odd rule). */
function insidePolygon(p: Point, points: readonly Point[]): boolean {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      result = !result;
    }
  }
  return result;
}

/** Distance from `p` to the visible outline of a primitive (0 inside filled shapes and texts). */
export function distanceToPrimitive(p: Point, prim: Primitive): number {
  switch (prim.type) {
    case 'line':
      return distanceToSegment(p, { x: prim.x1, y: prim.y1 }, { x: prim.x2, y: prim.y2 });
    case 'polyline':
      if (prim.filled && prim.closed && insidePolygon(p, prim.points)) return 0;
      return polylineDistance(p, prim.points, prim.closed);
    case 'rect': {
      const corners = [
        { x: prim.x, y: prim.y },
        { x: prim.x + prim.width, y: prim.y },
        { x: prim.x + prim.width, y: prim.y + prim.height },
        { x: prim.x, y: prim.y + prim.height },
      ];
      if (prim.filled && inside(p, primitiveBounds(prim))) return 0;
      return polylineDistance(p, corners, true);
    }
    case 'circle': {
      const d = Math.hypot(p.x - prim.cx, p.y - prim.cy);
      return prim.filled && d <= prim.r ? 0 : Math.abs(d - prim.r);
    }
    case 'arc': {
      const deg = (Math.atan2(p.y - prim.cy, p.x - prim.cx) * 180) / Math.PI;
      if (angleOnArc(deg, prim.start, prim.sweep)) {
        return Math.abs(Math.hypot(p.x - prim.cx, p.y - prim.cy) - prim.r);
      }
      const ends = [prim.start, prim.start + prim.sweep].map((a) =>
        arcPoint(prim.cx, prim.cy, prim.r, a),
      );
      return Math.min(...ends.map((e) => Math.hypot(p.x - e.x, p.y - e.y)));
    }
    case 'text':
      return inside(p, primitiveBounds(prim)) ? 0 : Infinity;
  }
}

export function boundsInside(inner: Bounds, outer: Bounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

export function rectFromPoints(a: Point, b: Point): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

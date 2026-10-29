import { arcPoint } from '@cablewire/core';
import type { Point, Primitive } from '@cablewire/core';
import { clean } from '../snap.ts';

/** Editable points of a shape; the index identifies the handle for applyHandle. */
export function handlesOf(p: Primitive): Point[] {
  switch (p.type) {
    case 'line':
      return [
        { x: p.x1, y: p.y1 },
        { x: p.x2, y: p.y2 },
      ];
    case 'polyline':
      return p.points;
    case 'rect':
      return [
        { x: p.x, y: p.y },
        { x: p.x + p.width, y: p.y },
        { x: p.x + p.width, y: p.y + p.height },
        { x: p.x, y: p.y + p.height },
      ];
    case 'circle':
      return [{ x: p.cx + p.r, y: p.cy }];
    case 'arc':
      return [
        arcPoint(p.cx, p.cy, p.r, p.start),
        arcPoint(p.cx, p.cy, p.r, p.start + p.sweep),
        arcPoint(p.cx, p.cy, p.r, p.start + p.sweep / 2),
      ];
    case 'text':
      return [];
  }
}

const angle = (c: Point, p: Point) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
const round = (deg: number) => clean(Math.round(deg * 10) / 10);

/** Moves handle `index` of a shape to `to`. */
export function applyHandle(p: Primitive, index: number, to: Point): Primitive {
  switch (p.type) {
    case 'line':
      return index === 0 ? { ...p, x1: to.x, y1: to.y } : { ...p, x2: to.x, y2: to.y };
    case 'polyline':
      return { ...p, points: p.points.map((q, i) => (i === index ? to : q)) };
    case 'rect': {
      // Keep the opposite corner fixed.
      const corners = handlesOf(p);
      const fixed = corners[(index + 2) % 4]!;
      return {
        ...p,
        x: Math.min(fixed.x, to.x),
        y: Math.min(fixed.y, to.y),
        width: clean(Math.abs(to.x - fixed.x)),
        height: clean(Math.abs(to.y - fixed.y)),
      };
    }
    case 'circle':
      return { ...p, r: clean(Math.max(Math.hypot(to.x - p.cx, to.y - p.cy), 0.1)) };
    case 'arc': {
      const c = { x: p.cx, y: p.cy };
      if (index === 2) return { ...p, r: clean(Math.max(Math.hypot(to.x - c.x, to.y - c.y), 0.1)) };
      const a = angle(c, to);
      if (index === 0) {
        const end = p.start + p.sweep;
        return { ...p, start: round(a), sweep: round(clockwiseSweep(a, end)) };
      }
      return { ...p, sweep: round(clockwiseSweep(p.start, a)) };
    }
    case 'text':
      return p;
  }
}

/** Clockwise sweep from angle `from` to angle `to`, in (0, 360]. */
export function clockwiseSweep(from: number, to: number): number {
  const d = (((to - from) % 360) + 360) % 360;
  return d === 0 ? 360 : d;
}

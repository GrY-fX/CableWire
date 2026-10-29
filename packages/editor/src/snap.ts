import { snap } from '@cablewire/core';
import type { Point } from '@cablewire/core';

export function snapPoint(p: Point, step: number): Point {
  return { x: clean(snap(p.x, step)), y: clean(snap(p.y, step)) };
}

/** Removes float noise such as 2.5000000000000004 and -0. */
export function clean(v: number): number {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

import type {
  Direction,
  Point,
  Primitive,
  ProjectDoc,
  Rotation,
  SymbolDef,
  WireEnd,
} from './model.ts';
import { isJunctionEnd } from './model.ts';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Approximate advance width of one character, as a fraction of the text height. */
export const TEXT_WIDTH_RATIO = 0.6;

export function boundsOfPoints(points: readonly Point[]): Bounds | undefined {
  if (points.length === 0) return undefined;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function unionBounds(a: Bounds | undefined, b: Bounds | undefined): Bounds | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Points of an arc: centre-relative angles in degrees, clockwise on screen. */
export function arcPoint(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** True if `deg` lies on the arc that starts at `start` and sweeps clockwise by `sweep`. */
export function angleOnArc(deg: number, start: number, sweep: number): boolean {
  if (Math.abs(sweep) >= 360) return true;
  const s = sweep >= 0 ? start : start + sweep;
  const delta = (((deg - s) % 360) + 360) % 360;
  return delta <= Math.abs(sweep);
}

/** Bounding box of a primitive; texts use an estimated width. */
export function primitiveBounds(p: Primitive): Bounds {
  switch (p.type) {
    case 'line':
      return boundsOfPoints([
        { x: p.x1, y: p.y1 },
        { x: p.x2, y: p.y2 },
      ])!;
    case 'polyline':
      return boundsOfPoints(p.points) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'rect':
      return boundsOfPoints([
        { x: p.x, y: p.y },
        { x: p.x + p.width, y: p.y + p.height },
      ])!;
    case 'circle':
      return { minX: p.cx - p.r, minY: p.cy - p.r, maxX: p.cx + p.r, maxY: p.cy + p.r };
    case 'arc': {
      const points = [
        arcPoint(p.cx, p.cy, p.r, p.start),
        arcPoint(p.cx, p.cy, p.r, p.start + p.sweep),
      ];
      for (const deg of [0, 90, 180, 270]) {
        if (angleOnArc(deg, p.start, p.sweep)) points.push(arcPoint(p.cx, p.cy, p.r, deg));
      }
      return boundsOfPoints(points)!;
    }
    case 'text': {
      const width = p.text.length * p.size * TEXT_WIDTH_RATIO;
      const anchor = p.anchor ?? 'start';
      const minX = anchor === 'start' ? p.x : anchor === 'middle' ? p.x - width / 2 : p.x - width;
      return { minX, minY: p.y - p.size / 2, maxX: minX + width, maxY: p.y + p.size / 2 };
    }
  }
}

/** Bounds of a symbol's graphics and terminals, relative to its insertion point. */
export function symbolBounds(symbol: SymbolDef): Bounds | undefined {
  let bounds = boundsOfPoints(symbol.terminals);
  for (const p of symbol.graphics) bounds = unionBounds(bounds, primitiveBounds(p));
  return bounds;
}

/** Mirror horizontally (if requested), then rotate clockwise on screen (Y down). */
export function transformPoint(p: Point, rotation: Rotation, mirrored: boolean): Point {
  const x = mirrored ? -p.x : p.x;
  const y = p.y;
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: -y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: y, y: -x };
  }
}

const CLOCKWISE: Direction[] = ['n', 'e', 's', 'w'];

export function transformDirection(
  dir: Direction,
  rotation: Rotation,
  mirrored: boolean,
): Direction {
  const d = mirrored && (dir === 'e' || dir === 'w') ? (dir === 'e' ? 'w' : 'e') : dir;
  return CLOCKWISE[(CLOCKWISE.indexOf(d) + rotation / 90) % 4]!;
}

export function addRotation(a: Rotation, b: Rotation): Rotation {
  return ((a + b) % 360) as Rotation;
}

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Absolute position of a wire end on its sheet, or undefined if it does not resolve. */
export function endPosition(doc: ProjectDoc, end: WireEnd): Point | undefined {
  if (isJunctionEnd(end)) {
    const j = doc.junctions[end.junction];
    return j && { x: j.x, y: j.y };
  }
  const element = doc.elements[end.element];
  if (!element) return undefined;
  const terminal = doc.symbols[element.symbolId]?.terminals.find((t) => t.id === end.terminal);
  if (!terminal) return undefined;
  const p = transformPoint(terminal, element.rotation, element.mirrored);
  return { x: element.x + p.x, y: element.y + p.y };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

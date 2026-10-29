import type { Direction, Point, ProjectDoc, Rotation, WireEnd } from './model.ts';
import { isJunctionEnd } from './model.ts';

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

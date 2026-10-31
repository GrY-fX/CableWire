import {
  boundsOfPoints,
  distanceToSegment,
  elementBounds,
  endPosition,
  xrefLayout,
} from '@cablewire/core';
import type { Bounds, ElementId, Point, ProjectDoc, SheetId, Wire } from '@cablewire/core';

// Kept here too for existing users; it lives in core (the PDF and the scene need it).
export { elementBounds } from '@cablewire/core';

/** Item keys, the same used by the sheet scene. */
export const elementKey = (id: string) => `element:${id}`;
export const wireKey = (id: string) => `wire:${id}`;
export const junctionKey = (id: string) => `junction:${id}`;

export type ParsedKey =
  { kind: 'element'; id: string } | { kind: 'wire'; id: string } | { kind: 'junction'; id: string };

export function parseItemKey(key: string): ParsedKey | undefined {
  const i = key.indexOf(':');
  const kind = key.slice(0, i);
  if (kind === 'element' || kind === 'wire' || kind === 'junction')
    return { kind, id: key.slice(i + 1) };
  return undefined;
}

/** Points of a wire from start to end, or undefined if an end does not resolve. */
export function wirePath(doc: ProjectDoc, wire: Wire): Point[] | undefined {
  const a = endPosition(doc, wire.from);
  const b = endPosition(doc, wire.to);
  return a && b ? [a, ...wire.bends, b] : undefined;
}

export function distanceToPath(p: Point, path: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++)
    best = Math.min(best, distanceToSegment(p, path[i]!, path[i + 1]!));
  return best;
}

const inside = (p: Point, b: Bounds, margin: number) =>
  p.x >= b.minX - margin &&
  p.x <= b.maxX + margin &&
  p.y >= b.minY - margin &&
  p.y <= b.maxY + margin;

/**
 * Topmost item under `p` on a sheet: junctions, then wires, then elements (texts
 * of elements are not part of their box yet).
 */
export function hitSheet(
  doc: ProjectDoc,
  sheetId: SheetId,
  p: Point,
  tolerance: number,
): string | undefined {
  for (const j of Object.values(doc.junctions)) {
    if (j.sheetId === sheetId && Math.hypot(p.x - j.x, p.y - j.y) <= tolerance)
      return junctionKey(j.id);
  }
  for (const w of Object.values(doc.wires)) {
    if (w.sheetId !== sheetId) continue;
    const path = wirePath(doc, w);
    if (path && distanceToPath(p, path) <= tolerance) return wireKey(w.id);
  }
  const elements = Object.values(doc.elements).filter((e) => e.sheetId === sheetId);
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i]!;
    const symbol = doc.symbols[e.symbolId];
    if (symbol && inside(p, elementBounds(e, symbol), tolerance)) return elementKey(e.id);
  }
  return undefined;
}

/** The coil whose contact table is under `p`, if any (tables lie over the drawing). */
export function hitXref(
  doc: ProjectDoc,
  sheetId: SheetId,
  p: Point,
  tolerance: number,
): ElementId | undefined {
  for (const e of Object.values(doc.elements)) {
    if (e.sheetId !== sheetId) continue;
    const layout = xrefLayout(doc, e);
    if (layout && inside(p, layout.box, tolerance)) return e.id;
  }
  return undefined;
}

/** Items of a sheet entirely inside a rectangle. */
export function itemsInside(doc: ProjectDoc, sheetId: SheetId, rect: Bounds): string[] {
  const contained = (b: Bounds) =>
    b.minX >= rect.minX && b.maxX <= rect.maxX && b.minY >= rect.minY && b.maxY <= rect.maxY;
  const keys: string[] = [];
  for (const e of Object.values(doc.elements)) {
    const symbol = doc.symbols[e.symbolId];
    if (e.sheetId === sheetId && symbol && contained(elementBounds(e, symbol)))
      keys.push(elementKey(e.id));
  }
  for (const j of Object.values(doc.junctions)) {
    if (j.sheetId === sheetId && contained({ minX: j.x, maxX: j.x, minY: j.y, maxY: j.y })) {
      keys.push(junctionKey(j.id));
    }
  }
  for (const w of Object.values(doc.wires)) {
    const path = w.sheetId === sheetId ? wirePath(doc, w) : undefined;
    const b = path && boundsOfPoints(path);
    if (b && contained(b)) keys.push(wireKey(w.id));
  }
  return keys;
}

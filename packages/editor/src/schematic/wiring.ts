import {
  distanceToSegment,
  endPosition,
  newId,
  sameEnd,
  snap,
  splitWire,
  transformDirection,
} from '@cablewire/core';
import type {
  Direction,
  JunctionId,
  Point,
  ProjectDoc,
  SheetId,
  Store,
  WireEnd,
  WireId,
} from '@cablewire/core';
import { clean } from '../snap.ts';
import { distanceToPath, wirePath } from './hit.ts';

/** Where a wire can start or end: a terminal/junction, or a point on an existing wire. */
export type Anchor =
  | { kind: 'end'; end: WireEnd; point: Point; dir?: Direction | undefined }
  | { kind: 'wire'; wire: WireId; point: Point };

/** Terminals attract the cursor from a bit further than other items. */
const MAGNET = 1.5;

/** Nearest point of an orthogonal path, snapped to the grid along the segment. */
export function projectOnPath(p: Point, path: readonly Point[], grid: number): Point {
  let best = { d: Infinity, point: path[0]! };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const d = distanceToSegment(p, a, b);
    if (d >= best.d) continue;
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));
    const point =
      a.x === b.x
        ? { x: a.x, y: clamp(snap(p.y, grid), a.y, b.y) }
        : a.y === b.y
          ? { x: clamp(snap(p.x, grid), a.x, b.x), y: a.y }
          : a;
    best = { d, point: { x: clean(point.x), y: clean(point.y) } };
  }
  return best.point;
}

/** Terminal, junction or wire under the cursor, preferring terminals. */
export function anchorAt(
  doc: ProjectDoc,
  sheetId: SheetId,
  p: Point,
  tolerance: number,
): Anchor | undefined {
  const best: { d: number; anchor?: Anchor } = { d: Infinity };
  const consider = (d: number, anchor: Anchor) => {
    if (d < best.d) Object.assign(best, { d, anchor });
  };
  const reach = tolerance * MAGNET;
  for (const element of Object.values(doc.elements)) {
    if (element.sheetId !== sheetId) continue;
    const symbol = doc.symbols[element.symbolId];
    for (const t of symbol?.terminals ?? []) {
      const end: WireEnd = { element: element.id, terminal: t.id };
      const point = endPosition(doc, end)!;
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      const dir = transformDirection(t.dir, element.rotation, element.mirrored);
      if (d <= reach) consider(d, { kind: 'end', end, point, dir });
    }
  }
  for (const j of Object.values(doc.junctions)) {
    if (j.sheetId !== sheetId) continue;
    const d = Math.hypot(p.x - j.x, p.y - j.y);
    if (d <= reach)
      consider(d, { kind: 'end', end: { junction: j.id }, point: { x: j.x, y: j.y } });
  }
  if (best.anchor) return best.anchor;
  for (const w of Object.values(doc.wires)) {
    if (w.sheetId !== sheetId) continue;
    const path = wirePath(doc, w);
    if (!path) continue;
    const d = distanceToPath(p, path);
    if (d <= tolerance)
      consider(d, {
        kind: 'wire',
        wire: w.id,
        point: projectOnPath(p, path, doc.settings.gridStep),
      });
  }
  return best.anchor;
}

/** Number of wires attached to a terminal or junction. */
export function wiresAt(doc: ProjectDoc, end: WireEnd): number {
  return Object.values(doc.wires).filter((w) => sameEnd(w.from, end) || sameEnd(w.to, end)).length;
}

export function sameAnchor(a: Anchor, b: Anchor): boolean {
  if (a.kind === 'end' && b.kind === 'end') return sameEnd(a.end, b.end);
  return a.point.x === b.point.x && a.point.y === b.point.y;
}

/**
 * Turns an anchor into a wire end, splitting the wire under a point anchor with a
 * new junction (inside the store's open transaction). Returns undefined on failure.
 */
export function resolveAnchor(store: Store, sheetId: SheetId, anchor: Anchor): WireEnd | undefined {
  if (anchor.kind === 'end') return anchor.end;
  // Find the wire that now runs through the point: an earlier split may have changed ids.
  const doc = store.doc;
  const wire = Object.values(doc.wires).find((w) => {
    if (w.sheetId !== sheetId) return false;
    const path = wirePath(doc, w);
    return path && distanceToPath(anchor.point, path) < 1e-6;
  });
  if (!wire) return undefined;
  const junctionId = newId<'junction'>() as JunctionId;
  const result = store.run(splitWire, { id: wire.id, at: anchor.point, junctionId });
  return result.ok ? { junction: junctionId } : undefined;
}

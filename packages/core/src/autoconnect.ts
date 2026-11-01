import type { ElementId, SheetId, TerminalId } from './ids.ts';
import type { Bounds } from './geometry.ts';
import { elementBounds, endPosition, transformDirection, transformPoint } from './geometry.ts';
import type {
  Direction,
  Element,
  Point,
  ProjectDoc,
  Rotation,
  SymbolDef,
  WireEnd,
} from './model.ts';
import { isJunctionEnd } from './model.ts';

// Automatic connections: a free terminal of a symbol connects to the nearest free
// terminal lying straight ahead of it (same X for terminals pointing up or down, same
// Y for left or right) and pointing back at it, when nothing (symbol, wire, junction)
// is in between. Used when placing or moving symbols.

/** A symbol at a place: an element of the document, or one about to be placed. */
export interface PlacedSymbol {
  /** Id of the element when it is already in the document. */
  id?: ElementId;
  symbol: SymbolDef;
  x: number;
  y: number;
  rotation: Rotation;
  mirrored: boolean;
}

export interface AutoConnection {
  /** Terminal of the placed or moved symbol (its element id when it has one). */
  from: { element: ElementId | undefined; terminal: TerminalId };
  to: { element: ElementId; terminal: TerminalId };
  /** Straight segment from the first terminal to the second. */
  points: [Point, Point];
}

const STEP: Record<Direction, Point> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
};
const OPPOSITE: Record<Direction, Direction> = { n: 's', s: 'n', e: 'w', w: 'e' };
/** Tolerance for "on the same line", in mm (positions are on a 2.5 mm grid). */
const EPSILON = 1e-6;

const isWired = (doc: ProjectDoc, element: ElementId, terminal: TerminalId) =>
  Object.values(doc.wires).some((w) =>
    [w.from, w.to].some(
      (end) => !isJunctionEnd(end) && end.element === element && end.terminal === terminal,
    ),
  );

/** Whether the open segment a–b (axis aligned) passes through the inside of `box`. */
function crossesBox(a: Point, b: Point, box: Bounds): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return (
    maxX > box.minX + EPSILON &&
    minX < box.maxX - EPSILON &&
    maxY > box.minY + EPSILON &&
    minY < box.maxY - EPSILON
  );
}

/** Whether segments p1–p2 and q1–q2 touch anywhere except at the ends of p1–p2. */
function crossesSegment(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const onSegment = (o: Point, a: Point, b: Point) =>
    Math.min(a.x, b.x) - EPSILON <= o.x &&
    o.x <= Math.max(a.x, b.x) + EPSILON &&
    Math.min(a.y, b.y) - EPSILON <= o.y &&
    o.y <= Math.max(a.y, b.y) + EPSILON;
  const isEnd = (o: Point) =>
    (Math.abs(o.x - p1.x) < EPSILON && Math.abs(o.y - p1.y) < EPSILON) ||
    (Math.abs(o.x - p2.x) < EPSILON && Math.abs(o.y - p2.y) < EPSILON);
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  if (
    ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
    ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
  ) {
    return true;
  }
  // Touching or overlapping: any end of one lying on the other, other than our ends.
  for (const o of [q1, q2])
    if (Math.abs(cross(p1, p2, o)) < EPSILON && onSegment(o, p1, p2) && !isEnd(o)) return true;
  for (const o of [p1, p2])
    if (Math.abs(cross(q1, q2, o)) < EPSILON && onSegment(o, q1, q2)) return true;
  return false;
}

/**
 * Connections a symbol would get at its place on a sheet. `exclude` lists elements
 * that are not candidates (e.g. the others moved together with it); they still count
 * as obstacles. Each terminal is used at most once.
 */
export function autoConnections(
  doc: ProjectDoc,
  sheetId: SheetId,
  placed: PlacedSymbol,
  exclude: ReadonlySet<ElementId> = new Set(),
): AutoConnection[] {
  const others = Object.values(doc.elements).filter(
    (e) => e.sheetId === sheetId && e.id !== placed.id,
  );
  const wires = Object.values(doc.wires).flatMap((w) => {
    if (w.sheetId !== sheetId) return [];
    const a = endPosition(doc, w.from);
    const b = endPosition(doc, w.to);
    return a && b ? [[a, ...w.bends, b]] : [];
  });
  const junctions = Object.values(doc.junctions).filter((j) => j.sheetId === sheetId);
  const boxes = new Map<ElementId, Bounds>();
  const boxOf = (e: Element) => {
    let b = boxes.get(e.id);
    if (!b) {
      const symbol = doc.symbols[e.symbolId];
      b = symbol ? elementBounds(e, symbol) : { minX: e.x, minY: e.y, maxX: e.x, maxY: e.y };
      boxes.set(e.id, b);
    }
    return b;
  };
  const used = new Set<string>();
  const result: AutoConnection[] = [];

  for (const terminal of placed.symbol.terminals) {
    if (placed.id && isWired(doc, placed.id, terminal.id)) continue;
    const t = transformPoint(terminal, placed.rotation, placed.mirrored);
    const from = { x: placed.x + t.x, y: placed.y + t.y };
    const dir = transformDirection(terminal.dir, placed.rotation, placed.mirrored);
    const step = STEP[dir];

    // Nearest free terminal straight ahead, pointing back.
    let best: { element: Element; terminal: TerminalId; at: Point; distance: number } | undefined;
    for (const e of others) {
      if (exclude.has(e.id)) continue;
      const symbol = doc.symbols[e.symbolId];
      if (!symbol) continue;
      for (const other of symbol.terminals) {
        if (transformDirection(other.dir, e.rotation, e.mirrored) !== OPPOSITE[dir]) continue;
        const at = endPosition(doc, { element: e.id, terminal: other.id } as WireEnd);
        if (!at) continue;
        const along = (at.x - from.x) * step.x + (at.y - from.y) * step.y;
        const across = (at.x - from.x) * step.y - (at.y - from.y) * step.x;
        if (along <= EPSILON || Math.abs(across) > EPSILON) continue;
        if (best && along >= best.distance) continue;
        if (used.has(`${e.id}:${other.id}`) || isWired(doc, e.id, other.id)) continue;
        best = { element: e, terminal: other.id, at, distance: along };
      }
    }
    if (!best) continue;
    const target = best;

    // Nothing in between: no symbol (the two ends' own symbols aside), wire or junction.
    // (The placed symbol's own terminal points away from it, so it is no obstacle.)
    const blocked =
      others.some((e) => e.id !== target.element.id && crossesBox(from, target.at, boxOf(e))) ||
      crossesBox(from, target.at, shrinkTowards(boxOf(target.element), target.at, dir)) ||
      wires.some((path) =>
        path.slice(1).some((p, i) => crossesSegment(from, target.at, path[i]!, p)),
      ) ||
      junctions.some((j) => crossesSegment(from, target.at, j, j));
    if (blocked) continue;

    used.add(`${target.element.id}:${target.terminal}`);
    result.push({
      from: { element: placed.id, terminal: terminal.id },
      to: { element: target.element.id, terminal: target.terminal },
      points: [from, target.at],
    });
  }
  return result;
}

/**
 * The target symbol's box from its terminal on: the wire may run over the target's
 * texts or graphics before its terminal, but not through the rest of it.
 */
function shrinkTowards(box: Bounds, at: Point, dir: Direction): Bounds {
  switch (dir) {
    case 's':
      return { ...box, minY: Math.max(box.minY, at.y) };
    case 'n':
      return { ...box, maxY: Math.min(box.maxY, at.y) };
    case 'e':
      return { ...box, minX: Math.max(box.minX, at.x) };
    case 'w':
      return { ...box, maxX: Math.min(box.maxX, at.x) };
  }
}

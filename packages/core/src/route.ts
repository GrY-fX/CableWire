import { endPosition, snap, transformDirection } from './geometry.ts';
import type { Direction, Point, ProjectDoc, WireEnd } from './model.ts';
import { isJunctionEnd } from './model.ts';

/** How far a wire goes straight out of a terminal before turning back (mm). */
export const ROUTE_STUB = 5;

const STEP: Record<Direction, Point> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

const vertical = (d: Direction | undefined) => d === 'n' || d === 's';
const horizontal = (d: Direction | undefined) => d === 'e' || d === 'w';
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Direction a wire leaves a wire end on the sheet (terminals only; junctions have none). */
export function endDirection(doc: ProjectDoc, end: WireEnd): Direction | undefined {
  if (isJunctionEnd(end)) return undefined;
  const element = doc.elements[end.element];
  const terminal =
    element && doc.symbols[element.symbolId]?.terminals.find((t) => t.id === end.terminal);
  return (
    terminal && element && transformDirection(terminal.dir, element.rotation, element.mirrored)
  );
}

/** True if going from `p` towards `target` would go back through the side `dir` faces away from. */
function behind(p: Point, dir: Direction | undefined, target: Point): boolean {
  if (!dir) return false;
  const s = STEP[dir];
  return (target.x - p.x) * s.x + (target.y - p.y) * s.y < 0;
}

function out(p: Point, dir: Direction, length: number): Point {
  return { x: p.x + STEP[dir].x * length, y: p.y + STEP[dir].y * length };
}

/** Bends between two points, each optionally with the direction the wire must leave/enter. */
function core(
  from: Point,
  fromDir: Direction | undefined,
  to: Point,
  toDir: Direction | undefined,
  grid: number,
): Point[] {
  if (from.x === to.x || from.y === to.y) return [];
  if (vertical(fromDir) && vertical(toDir)) {
    const mid = snap((from.y + to.y) / 2, grid);
    return [
      { x: from.x, y: mid },
      { x: to.x, y: mid },
    ];
  }
  if (horizontal(fromDir) && horizontal(toDir)) {
    const mid = snap((from.x + to.x) / 2, grid);
    return [
      { x: mid, y: from.y },
      { x: mid, y: to.y },
    ];
  }
  // One L-shaped bend; leave along fromDir if given, else arrive along toDir.
  if (vertical(fromDir) || (!fromDir && horizontal(toDir))) return [{ x: from.x, y: to.y }];
  return [{ x: to.x, y: from.y }];
}

/** Fresh orthogonal bends for a wire between its current ends. */
export function autoRoute(doc: ProjectDoc, from: WireEnd, to: WireEnd): Point[] | undefined {
  const a = endPosition(doc, from);
  const b = endPosition(doc, to);
  if (!a || !b) return undefined;
  return routeOrthogonal(
    a,
    endDirection(doc, from),
    b,
    endDirection(doc, to),
    doc.settings.gridStep,
  );
}

/** Removes repeated points and middle points of straight runs. */
export function simplifyPath(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    if (result.length && same(result.at(-1)!, p)) continue;
    const a = result.at(-2);
    const b = result.at(-1);
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) result.pop();
    result.push(p);
  }
  return result;
}

/**
 * Orthogonal path from `from` to `to`: returns only the bend points in between.
 * Directions are the sides the wire leaves `from` and enters `to`; when the other
 * point lies behind a terminal, the wire first goes out by ROUTE_STUB and turns.
 */
export function routeOrthogonal(
  from: Point,
  fromDir: Direction | undefined,
  to: Point,
  toDir: Direction | undefined,
  grid = 2.5,
): Point[] {
  let start = from;
  let end = to;
  const head: Point[] = [];
  const tail: Point[] = [];
  let a = fromDir;
  let b = toDir;
  if (behind(from, a, to)) {
    start = out(from, a!, ROUTE_STUB);
    head.push(start);
    a = undefined;
  }
  if (behind(to, b, from)) {
    end = out(to, b!, ROUTE_STUB);
    tail.push(end);
    b = undefined;
  }
  const path = simplifyPath([from, ...head, ...core(start, a, end, b, grid), ...tail, to]);
  return path.slice(1, -1);
}

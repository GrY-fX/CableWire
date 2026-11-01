import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId, JunctionId, SheetId, SymbolId } from '../ids.ts';
import { newId } from '../ids.ts';
import { addRotation, endPosition } from '../geometry.ts';
import type { Element, Point, ProjectDoc, Rotation, Wire, WireEnd } from '../model.ts';
import { endDirection, routeOrthogonal } from '../route.ts';
import { isJunctionEnd } from '../model.ts';
import type { Op } from '../ops.ts';
import { patch, put } from '../ops.ts';
import { resolveDefaultInfo } from '../labels.ts';
import { nextReferenceId } from '../references.ts';

export interface PlaceElementArgs {
  id?: ElementId;
  sheetId: SheetId;
  symbolId: SymbolId;
  x: number;
  y: number;
  rotation?: Rotation;
  mirrored?: boolean;
  info?: Record<string, string>;
}

export const placeElement = defineCommand<PlaceElementArgs>('Inserisci elemento', (doc, args) => {
  const { id = newId(), sheetId, symbolId, x, y, rotation = 0, mirrored = false } = args;
  if (!doc.sheets[sheetId]) return fail('not-found', 'Sheet not found');
  const symbol = doc.symbols[symbolId];
  if (!symbol) return fail('not-found', 'Symbol not found');
  if (doc.elements[id]) return fail('exists', 'An element with this id already exists');
  const element: Element = {
    id,
    sheetId,
    symbolId,
    x,
    y,
    rotation,
    mirrored,
    info: { ...resolveDefaultInfo(doc, sheetId, symbol, { x, y }), ...args.info },
  };
  if (symbol.kind === 'report' && !element.info['ref_id']) {
    element.info['ref_id'] = nextReferenceId(doc);
  }
  return ok([put('elements', element)]);
});

/**
 * Bends of a wire after one of its ends moved by (dx, dy), keeping it orthogonal and
 * keeping its shape: only the bend next to the moved end shifts, along the axis that
 * keeps the first segment straight ("rubber band"). A straight wire that would become
 * diagonal gets a fresh orthogonal route.
 */
export function stretchWire(
  doc: ProjectDoc,
  wire: Wire,
  movedEnd: 'from' | 'to',
  dx: number,
  dy: number,
): Point[] | undefined {
  const a = endPosition(doc, wire.from);
  const b = endPosition(doc, wire.to);
  if (!a || !b) return undefined;
  const from = movedEnd === 'from' ? { x: a.x + dx, y: a.y + dy } : a;
  const to = movedEnd === 'to' ? { x: b.x + dx, y: b.y + dy } : b;
  if (wire.bends.length === 0) {
    if (from.x === to.x || from.y === to.y) return undefined;
    return routeOrthogonal(
      from,
      endDirection(doc, wire.from),
      to,
      endDirection(doc, wire.to),
      doc.settings.gridStep,
    );
  }
  const bends = wire.bends.map((p) => ({ ...p }));
  // Work from the moved end: its old position, the adjacent bend, and the one after.
  const order = movedEnd === 'from' ? bends : [...bends].reverse();
  const end = movedEnd === 'from' ? a : b;
  const near = order[0]!;
  const next = order[1] ?? (movedEnd === 'from' ? b : a);
  const verticalFirst =
    end.x === near.x && end.y !== near.y
      ? true
      : end.y === near.y && end.x !== near.x
        ? false
        : near.y === next.y; // degenerate first segment: use the next one
  if (verticalFirst) near.x += dx;
  else near.y += dy;
  return bends;
}

/**
 * Moves elements and junctions. Wires with both ends moved keep their shape;
 * wires with one moved end stretch (see stretchWire).
 */
export const moveItems = defineCommand<{
  elements?: readonly ElementId[];
  junctions?: readonly JunctionId[];
  dx: number;
  dy: number;
}>('Sposta', (doc, { elements = [], junctions = [], dx, dy }) => {
  if (dx === 0 && dy === 0) return ok([]);
  const movedElements = new Set<string>();
  const movedJunctions = new Set<string>();
  const ops: Op[] = [];
  for (const id of elements) {
    const e = doc.elements[id];
    if (!e) return fail('not-found', `Element ${id} not found`);
    movedElements.add(id);
    ops.push(patch('elements', id, { x: e.x + dx, y: e.y + dy }));
  }
  for (const id of junctions) {
    const j = doc.junctions[id];
    if (!j) return fail('not-found', `Junction ${id} not found`);
    movedJunctions.add(id);
    ops.push(patch('junctions', id, { x: j.x + dx, y: j.y + dy }));
  }
  const moved = (end: WireEnd) =>
    isJunctionEnd(end) ? movedJunctions.has(end.junction) : movedElements.has(end.element);
  for (const wire of Object.values(doc.wires)) {
    const fromMoved = moved(wire.from);
    const toMoved = moved(wire.to);
    if (fromMoved && toMoved) {
      if (wire.bends.length > 0) {
        const bends = wire.bends.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        ops.push(patch('wires', wire.id, { bends }));
      }
    } else if (fromMoved || toMoved) {
      const bends = stretchWire(doc, wire, fromMoved ? 'from' : 'to', dx, dy);
      if (bends) ops.push(patch('wires', wire.id, { bends }));
    }
  }
  return ok(ops);
});

/** Rotates each element clockwise around its own insertion point. */
export const rotateElements = defineCommand<{ ids: readonly ElementId[]; by: Rotation }>(
  'Ruota',
  (doc, { ids, by }) => {
    const ops: Op[] = [];
    for (const id of ids) {
      const e = doc.elements[id];
      if (!e) return fail('not-found', `Element ${id} not found`);
      ops.push(patch('elements', id, { rotation: addRotation(e.rotation, by) }));
    }
    return ok(ops);
  },
);

export const mirrorElements = defineCommand<{ ids: readonly ElementId[] }>(
  'Specchia',
  (doc, { ids }) => {
    const ops: Op[] = [];
    for (const id of ids) {
      const e = doc.elements[id];
      if (!e) return fail('not-found', `Element ${id} not found`);
      ops.push(patch('elements', id, { mirrored: !e.mirrored }));
    }
    return ok(ops);
  },
);

/** Sets info fields; a field set to `undefined` is removed. */
export const setElementInfo = defineCommand<{
  id: ElementId;
  set: Record<string, string | undefined>;
}>('Modifica proprietà', (doc, { id, set }) => {
  const e = doc.elements[id];
  if (!e) return fail('not-found', 'Element not found');
  const info = { ...e.info };
  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) delete info[key];
    else info[key] = value;
  }
  return ok([patch('elements', id, { info })]);
});

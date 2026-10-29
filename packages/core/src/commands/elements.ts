import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId, JunctionId, SheetId, SymbolId } from '../ids.ts';
import { newId } from '../ids.ts';
import { addRotation } from '../geometry.ts';
import type { Element, Rotation } from '../model.ts';
import { isJunctionEnd } from '../model.ts';
import type { Op } from '../ops.ts';
import { patch, put } from '../ops.ts';

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
    info: { ...symbol.defaultInfo, ...args.info },
  };
  return ok([put('elements', element)]);
});

/**
 * Moves elements and junctions. Wires with both ends moved keep their shape;
 * wires with one moved end keep their bends (re-routing is the editor's job).
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
  for (const wire of Object.values(doc.wires)) {
    const moved = [wire.from, wire.to].every((end) =>
      isJunctionEnd(end) ? movedJunctions.has(end.junction) : movedElements.has(end.element),
    );
    if (moved && wire.bends.length > 0) {
      ops.push(
        patch('wires', wire.id, { bends: wire.bends.map((p) => ({ x: p.x + dx, y: p.y + dy })) }),
      );
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

import { defineCommand, fail, ok } from '../command.ts';
import type { CommandError } from '../command.ts';
import type { JunctionId, SheetId, WireId } from '../ids.ts';
import { newId } from '../ids.ts';
import { distanceToSegment, endPosition } from '../geometry.ts';
import type { Point, ProjectDoc, Wire, WireEnd, WireProps } from '../model.ts';
import { isJunctionEnd } from '../model.ts';
import { inheritNumberOps, potentialNumberOps } from '../numbering.ts';
import type { Patch } from '../ops.ts';
import { applyOps, patch, put } from '../ops.ts';
import { sameEnd } from '../validate.ts';

function sheetOfEnd(doc: ProjectDoc, end: WireEnd): SheetId | CommandError {
  if (isJunctionEnd(end)) {
    const j = doc.junctions[end.junction];
    return j ? j.sheetId : { code: 'not-found', message: 'Junction not found' };
  }
  const e = doc.elements[end.element];
  if (!e) return { code: 'not-found', message: 'Element not found' };
  const symbol = doc.symbols[e.symbolId];
  if (!symbol?.terminals.some((t) => t.id === end.terminal)) {
    return { code: 'not-found', message: 'Terminal not found' };
  }
  return e.sheetId;
}

export const addWire = defineCommand<{
  id?: WireId;
  from: WireEnd;
  to: WireEnd;
  bends?: Point[];
  props?: WireProps;
}>('Aggiungi filo', (doc, { id = newId(), from, to, bends = [], props = {} }) => {
  if (doc.wires[id]) return fail('exists', 'A wire with this id already exists');
  if (sameEnd(from, to)) return fail('loop', 'A wire needs two different ends');
  const a = sheetOfEnd(doc, from);
  if (typeof a !== 'string') return { ok: false, error: a };
  const b = sheetOfEnd(doc, to);
  if (typeof b !== 'string') return { ok: false, error: b };
  if (a !== b) return fail('cross-sheet', 'Both ends must be on the same sheet');
  const wire: Wire = { id, sheetId: a, from, to, bends, props };
  const ops = [put('wires', wire)];
  // The new wire joins potentials: unnumbered wires take the potential's number.
  return ok([...ops, ...inheritNumberOps(applyOps(doc, ops).doc, id)]);
});

/** Moves one end of a wire to another terminal or junction, optionally with new bends. */
export const reconnectWire = defineCommand<{
  id: WireId;
  end: 'from' | 'to';
  target: WireEnd;
  bends?: Point[];
}>('Ricollega filo', (doc, { id, end, target, bends }) => {
  const wire = doc.wires[id];
  if (!wire) return fail('not-found', 'Wire not found');
  const other = end === 'from' ? wire.to : wire.from;
  if (sameEnd(target, other)) return fail('loop', 'A wire needs two different ends');
  const sheet = sheetOfEnd(doc, target);
  if (typeof sheet !== 'string') return { ok: false, error: sheet };
  if (sheet !== wire.sheetId) return fail('cross-sheet', 'Both ends must be on the same sheet');
  const ops = [patch('wires', id, { [end]: target, ...(bends && { bends }) })];
  return ok([...ops, ...inheritNumberOps(applyOps(doc, ops).doc, id)]);
});

/** Sets the number of a wire and of every wire in its potential (empty clears it). */
export const setPotentialNumber = defineCommand<{ id: WireId; number: string }>(
  'Numero filo',
  (doc, { id, number }) => {
    if (!doc.wires[id]) return fail('not-found', 'Wire not found');
    return ok(potentialNumberOps(doc, id, number));
  },
);

export const setWireBends = defineCommand<{ id: WireId; bends: Point[] }>(
  'Modifica percorso',
  (doc, { id, bends }) => {
    if (!doc.wires[id]) return fail('not-found', 'Wire not found');
    return ok([patch('wires', id, { bends })]);
  },
);

/** Sets wire properties; a property set to `undefined` is removed. */
export const setWireProps = defineCommand<{ id: WireId; set: Patch<WireProps> }>(
  'Modifica filo',
  (doc, { id, set }) => {
    const wire = doc.wires[id];
    if (!wire) return fail('not-found', 'Wire not found');
    const props: Record<string, unknown> = { ...wire.props };
    for (const [key, value] of Object.entries(set)) {
      if (value === undefined) delete props[key];
      else props[key] = value;
    }
    return ok([patch('wires', id, { props: props as WireProps })]);
  },
);

/**
 * Inserts a junction at `at` (on the segment nearest to it) and splits the wire in two:
 * the original keeps from → junction, a new wire takes junction → to. Used for T branches.
 */
export const splitWire = defineCommand<{
  id: WireId;
  at: Point;
  junctionId?: JunctionId;
  newWireId?: WireId;
}>('Deriva', (doc, { id, at, junctionId = newId(), newWireId = newId() }) => {
  const wire = doc.wires[id];
  if (!wire) return fail('not-found', 'Wire not found');
  if (doc.junctions[junctionId] || doc.wires[newWireId]) return fail('exists', 'Id already in use');
  const start = endPosition(doc, wire.from);
  const end = endPosition(doc, wire.to);
  if (!start || !end) return fail('invalid', 'Wire ends do not resolve');

  const path = [start, ...wire.bends, end];
  let segment = 0;
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distanceToSegment(at, path[i]!, path[i + 1]!);
    if (d < best) {
      best = d;
      segment = i;
    }
  }

  const junction = { id: junctionId, sheetId: wire.sheetId, x: at.x, y: at.y };
  const second: Wire = {
    id: newWireId,
    sheetId: wire.sheetId,
    from: { junction: junctionId },
    to: wire.to,
    bends: wire.bends.slice(segment),
    props: { ...wire.props },
  };
  return ok([
    put('junctions', junction),
    patch('wires', id, { to: { junction: junctionId }, bends: wire.bends.slice(0, segment) }),
    put('wires', second),
  ]);
});

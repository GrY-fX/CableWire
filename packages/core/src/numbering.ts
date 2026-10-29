import type { WireId } from './ids.ts';
import type { ProjectDoc, Wire, WireProps } from './model.ts';
import type { Op } from './ops.ts';
import { patch } from './ops.ts';
import { getPotentials } from './potentials.ts';

// A wire number belongs to its potential: every wire of a potential shows the same
// number. Conflicts between two numbered potentials joined together are left as they
// are here; resolving them is the job of automatic numbering (phase 1, step 6).

/** Wires in the same potential as `wireId`, including it. */
export function potentialWires(doc: ProjectDoc, wireId: WireId): Wire[] {
  const potentials = getPotentials(doc);
  const p = potentials.potentialOfWire(wireId);
  return p === undefined ? [] : potentials.wires(p).map((id) => doc.wires[id]!);
}

const withNumber = (props: WireProps, number: string | undefined): WireProps => {
  const next = { ...props };
  if (number) next.number = number;
  else delete next.number;
  return next;
};

/**
 * Ops giving unnumbered wires of `wireId`'s potential the potential's number
 * (the wire's own number first, else the first numbered wire). `doc` must already
 * contain the change that connected the wire.
 */
export function inheritNumberOps(doc: ProjectDoc, wireId: WireId): Op[] {
  const wires = potentialWires(doc, wireId);
  const number = doc.wires[wireId]?.props.number || wires.find((w) => w.props.number)?.props.number;
  if (!number) return [];
  return wires
    .filter((w) => !w.props.number)
    .map((w) => patch('wires', w.id, { props: withNumber(w.props, number) }));
}

/** Ops setting (or clearing, when empty) the number of every wire in a potential. */
export function potentialNumberOps(doc: ProjectDoc, wireId: WireId, number: string): Op[] {
  const value = number.trim() || undefined;
  return potentialWires(doc, wireId)
    .filter((w) => w.props.number !== value)
    .map((w) => patch('wires', w.id, { props: withNumber(w.props, value) }));
}

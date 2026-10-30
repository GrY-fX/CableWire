import type { WireId } from './ids.ts';
import type { ProjectDoc, Wire, WireProps } from './model.ts';
import type { Op } from './ops.ts';
import { patch } from './ops.ts';
import { getPotentials } from './potentials.ts';

// A wire number belongs to its potential: every wire of a potential shows the same
// number and lock state. Conflicts between two numbered potentials joined together are
// left as they are here; they are listed and resolved by automatic numbering.

/** Wires in the same potential as `wireId`, including it. */
export function potentialWires(doc: ProjectDoc, wireId: WireId): Wire[] {
  const potentials = getPotentials(doc);
  const p = potentials.potentialOfWire(wireId);
  return p === undefined ? [] : potentials.wires(p).map((id) => doc.wires[id]!);
}

/** Props with the given number and lock (both removed when there is no number). */
export function withNumber(
  props: WireProps,
  number: string | undefined,
  locked: boolean,
): WireProps {
  const next = { ...props };
  delete next.number;
  delete next.numberLocked;
  if (number) {
    next.number = number;
    if (locked) next.numberLocked = true;
  }
  return next;
}

const sameNumbering = (props: WireProps, number: string | undefined, locked: boolean) =>
  props.number === number && !!props.numberLocked === (!!number && locked);

/**
 * Ops giving unnumbered wires of `wireId`'s potential the potential's number and lock
 * (the wire's own number first, else the first numbered wire). `doc` must already
 * contain the change that connected the wire.
 */
export function inheritNumberOps(doc: ProjectDoc, wireId: WireId): Op[] {
  const wires = potentialWires(doc, wireId);
  const self = doc.wires[wireId];
  const source = self?.props.number ? self : wires.find((w) => w.props.number);
  if (!source) return [];
  const { number, numberLocked } = source.props;
  return wires
    .filter((w) => !w.props.number)
    .map((w) => patch('wires', w.id, { props: withNumber(w.props, number, !!numberLocked) }));
}

/** Ops setting (or clearing, when empty) the number and lock of every wire in a potential. */
export function potentialNumberOps(
  doc: ProjectDoc,
  wireId: WireId,
  number: string,
  locked: boolean,
): Op[] {
  const value = number.trim() || undefined;
  return potentialWires(doc, wireId)
    .filter((w) => !sameNumbering(w.props, value, locked))
    .map((w) => patch('wires', w.id, { props: withNumber(w.props, value, locked) }));
}

/** True if any wire of the potential has a locked number. */
export function isPotentialLocked(doc: ProjectDoc, wireId: WireId): boolean {
  return potentialWires(doc, wireId).some((w) => w.props.numberLocked && w.props.number);
}

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
 * Ops giving the wires of `wireId`'s potential what the potential has and they lack:
 * number and lock, colour and width (the wire's own first, else the first wire that
 * has one). `doc` must already contain the change that connected the wire.
 */
export function inheritNumberOps(doc: ProjectDoc, wireId: WireId): Op[] {
  const wires = potentialWires(doc, wireId);
  const self = doc.wires[wireId];
  const from = <K extends keyof WireProps>(key: K) =>
    self?.props[key] !== undefined ? self : wires.find((w) => w.props[key] !== undefined);
  const numbered = self?.props.number ? self : wires.find((w) => w.props.number);
  const coloured = from('color');
  const wide = from('width');
  const ops: Op[] = [];
  for (const w of wires) {
    let props = w.props;
    if (numbered && !props.number) {
      props = withNumber(props, numbered.props.number, !!numbered.props.numberLocked);
    }
    if (coloured && props.color === undefined) props = { ...props, color: coloured.props.color! };
    if (wide && props.width === undefined) props = { ...props, width: wide.props.width! };
    if (props !== w.props) ops.push(patch('wires', w.id, { props }));
  }
  return ops;
}

/** Ops setting (or removing, when undefined) colour and width on every wire of a potential. */
export function potentialStyleOps(
  doc: ProjectDoc,
  wireId: WireId,
  set: { color?: string | undefined; width?: number | undefined },
): Op[] {
  return potentialWires(doc, wireId).flatMap((w) => {
    const props: WireProps = { ...w.props };
    if ('color' in set) {
      if (set.color?.trim()) props.color = set.color.trim();
      else delete props.color;
    }
    if ('width' in set) {
      if (set.width) props.width = set.width;
      else delete props.width;
    }
    return props.color === w.props.color && props.width === w.props.width
      ? []
      : [patch('wires', w.id, { props })];
  });
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

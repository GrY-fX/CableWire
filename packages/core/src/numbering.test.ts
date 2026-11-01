import { describe, expect, it } from 'vitest';
import type { JunctionId, WireId } from './ids.ts';
import { placeElement } from './commands/elements.ts';
import {
  addWire,
  reconnectWire,
  setPotentialNumber,
  setPotentialStyle,
  setWireProps,
  splitWire,
} from './commands/wires.ts';
import { updateSettings } from './commands/project.ts';
import { numberModeOf, wiresShowingNumber } from './numbering.ts';
import { CONTACT, T1, T2, TERMINAL, must, setup } from './test-utils.ts';

const id = (s: string) => s as never;

/** A, X (feed-through terminal), B, C in a row; wire a-x numbered "5". */
function circuit() {
  const ctx = setup();
  const place = (name: string, symbolId: string, x: number) =>
    must(ctx.store, placeElement, {
      id: id(name),
      sheetId: ctx.sheet,
      symbolId: id(symbolId),
      x,
      y: 0,
    });
  place('a', CONTACT.id, 0);
  place('x', TERMINAL.id, 20);
  place('b', CONTACT.id, 40);
  place('c', CONTACT.id, 60);
  must(ctx.store, addWire, {
    id: id('ax'),
    from: { element: id('a'), terminal: T2 },
    to: { element: id('x'), terminal: T1 },
    props: { number: '5', section: '1.5' },
  });
  return ctx;
}
const wire = (ctx: ReturnType<typeof circuit>, w: string) => ctx.store.doc.wires[w as WireId]!;

describe('wire numbers follow the potential', () => {
  it('gives a new unnumbered wire the number of what it connects to', () => {
    const ctx = circuit();
    must(ctx.store, addWire, {
      id: id('xb'),
      from: { element: id('x'), terminal: T2 },
      to: { element: id('b'), terminal: T1 },
    });
    // Through the feed-through terminal: same potential, same number.
    expect(wire(ctx, 'xb').props).toEqual({ number: '5' });
    // An explicit number on the new wire is kept.
    must(ctx.store, addWire, {
      id: id('bc'),
      from: { element: id('b'), terminal: T2 },
      to: { element: id('c'), terminal: T1 },
      props: { number: '7' },
    });
    expect(wire(ctx, 'bc').props.number).toBe('7');
  });

  it('numbers a branch from a numbered wire, and unnumbered wires it joins', () => {
    const ctx = circuit();
    // Unnumbered wire b→c, then a branch joining it to the numbered potential.
    must(ctx.store, addWire, {
      id: id('bc'),
      from: { element: id('b'), terminal: T1 },
      to: { element: id('c'), terminal: T1 },
    });
    must(ctx.store, splitWire, {
      id: id('ax'),
      at: { x: 10, y: 5 },
      junctionId: 'j' as JunctionId,
    });
    must(ctx.store, addWire, {
      id: id('jb'),
      from: { junction: 'j' as JunctionId },
      to: { element: id('b'), terminal: T1 },
    });
    expect(wire(ctx, 'jb').props.number).toBe('5');
    expect(wire(ctx, 'bc').props.number).toBe('5');
    // Undo removes the inherited numbers together with the wire.
    ctx.store.undo();
    expect(wire(ctx, 'bc').props.number).toBeUndefined();
  });

  it('inherits when a wire is reconnected to a numbered potential', () => {
    const ctx = circuit();
    must(ctx.store, addWire, {
      id: id('bc'),
      from: { element: id('b'), terminal: T2 },
      to: { element: id('c'), terminal: T1 },
    });
    must(ctx.store, reconnectWire, {
      id: id('bc'),
      end: 'from',
      target: { element: id('x'), terminal: T2 },
    });
    expect(wire(ctx, 'bc').props.number).toBe('5');
  });

  it('renumbers every wire of the potential from any of them, as one undo entry', () => {
    const ctx = circuit();
    must(ctx.store, addWire, {
      id: id('xb'),
      from: { element: id('x'), terminal: T2 },
      to: { element: id('b'), terminal: T1 },
    });
    must(ctx.store, addWire, {
      id: id('other'),
      from: { element: id('b'), terminal: T2 },
      to: { element: id('c'), terminal: T1 },
      props: { number: '9' },
    });
    must(ctx.store, setPotentialNumber, { id: id('xb'), number: ' 12 ' });
    // Typed by hand: locked on every wire of the potential.
    expect(wire(ctx, 'ax').props).toEqual({ number: '12', section: '1.5', numberLocked: true });
    expect(wire(ctx, 'xb').props.numberLocked).toBe(true);
    expect(wire(ctx, 'xb').props.number).toBe('12');
    expect(wire(ctx, 'other').props.number).toBe('9'); // another potential
    expect(ctx.store.undoLabel).toBe('Numero filo');

    must(ctx.store, setPotentialNumber, { id: id('ax'), number: '' });
    expect(wire(ctx, 'ax').props).toEqual({ section: '1.5' });
    expect(wire(ctx, 'xb').props).toEqual({});
    ctx.store.undo();
    expect(wire(ctx, 'xb').props.number).toBe('12');
  });

  it('leaves other properties per wire', () => {
    const ctx = circuit();
    must(ctx.store, setWireProps, { id: id('ax'), set: { color: 'BU' } });
    expect(wire(ctx, 'ax').props).toEqual({ number: '5', section: '1.5', color: 'BU' });
  });
});

describe('wire colour and width follow the potential', () => {
  it('apply to every wire of the potential and pass to wires joining it', () => {
    const ctx = circuit();
    must(ctx.store, addWire, {
      id: id('xb'),
      from: { element: id('x'), terminal: T2 },
      to: { element: id('b'), terminal: T1 },
    });
    must(ctx.store, setPotentialStyle, { id: id('ax'), set: { color: 'bu', width: 0.5 } });
    expect(wire(ctx, 'xb').props).toMatchObject({ color: 'bu', width: 0.5 });
    // A branch drawn later takes them too, with the number.
    must(ctx.store, addWire, {
      id: id('bc'),
      from: { element: id('b'), terminal: T1 },
      to: { element: id('c'), terminal: T1 },
    });
    expect(wire(ctx, 'bc').props).toMatchObject({ number: '5', color: 'bu', width: 0.5 });
    // Undefined removes them everywhere, keeping the other properties.
    must(ctx.store, setPotentialStyle, { id: id('bc'), set: { width: undefined } });
    expect(wire(ctx, 'ax').props).toEqual({ number: '5', section: '1.5', color: 'bu' });
  });
});

describe('where a potential shows its number', () => {
  /** Potential "5" on a-x and x-b (the longer, with a detour), "7" on b-c. */
  function wired() {
    const ctx = circuit();
    must(ctx.store, addWire, {
      id: id('xb'),
      from: { element: id('x'), terminal: T2 },
      to: { element: id('b'), terminal: T1 },
      bends: [
        { x: 30, y: 0 },
        { x: 30, y: 60 },
      ],
    });
    must(ctx.store, addWire, {
      id: id('bc'),
      from: { element: id('b'), terminal: T2 },
      to: { element: id('c'), terminal: T1 },
      props: { number: '7' },
    });
    return ctx;
  }
  const shown = (ctx: ReturnType<typeof wired>) =>
    [...wiresShowingNumber(ctx.store.doc, ctx.sheet)].sort();

  it('on every wire by default, once per sheet on the longest wire when chosen', () => {
    const ctx = wired();
    expect(shown(ctx)).toEqual(['ax', 'bc', 'xb']);
    must(ctx.store, updateSettings, { set: { wireNumberMode: 'once' } });
    expect(shown(ctx)).toEqual(['bc', 'xb']);
  });

  it('can be chosen per potential, and passes to wires joining it', () => {
    const ctx = wired();
    must(ctx.store, setPotentialStyle, { id: id('ax'), set: { numberMode: 'once' } });
    expect(wire(ctx, 'xb').props.numberMode).toBe('once');
    expect(shown(ctx)).toEqual(['bc', 'xb']);
    // The project shows numbers once, this potential on every wire.
    must(ctx.store, updateSettings, { set: { wireNumberMode: 'once' } });
    must(ctx.store, setPotentialStyle, { id: id('ax'), set: { numberMode: 'each' } });
    expect(shown(ctx)).toEqual(['ax', 'bc', 'xb']);
    must(ctx.store, setPotentialStyle, { id: id('ax'), set: { numberMode: undefined } });
    expect(numberModeOf(ctx.store.doc, wire(ctx, 'ax'))).toBe('once');
  });
});

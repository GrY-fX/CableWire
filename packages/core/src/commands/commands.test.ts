import { describe, expect, it } from 'vitest';
import type { ElementId, JunctionId, SheetId, WireId } from '../ids.ts';
import { CONTACT, T1, T2, TERMINAL, must, setup, twoTerminalSymbol } from '../test-utils.ts';
import {
  mirrorElements,
  moveItems,
  placeElement,
  rotateElements,
  setElementInfo,
} from './elements.ts';
import { removeItems } from './remove.ts';
import { addSheet, moveSheet, removeSheet, updateSheet } from './sheets.ts';
import { importSymbol, removeSymbol } from './symbols.ts';
import { addWire, setWireBends, setWireProps, splitWire } from './wires.ts';

const A = 'a' as ElementId;
const B = 'b' as ElementId;
const W = 'w' as WireId;
const S2 = 's2' as SheetId;

/** Two contacts on the first sheet: A at (0,0), B at (0,20), wire A.T2 → B.T1. */
function twoContacts() {
  const ctx = setup();
  must(ctx.store, placeElement, { id: A, sheetId: ctx.sheet, symbolId: CONTACT.id, x: 0, y: 0 });
  must(ctx.store, placeElement, { id: B, sheetId: ctx.sheet, symbolId: CONTACT.id, x: 0, y: 20 });
  must(ctx.store, addWire, {
    id: W,
    from: { element: A, terminal: T2 },
    to: { element: B, terminal: T1 },
  });
  return ctx;
}

describe('sheets', () => {
  it('adds, renames and reorders sheets', () => {
    const { store, sheet } = setup();
    must(store, addSheet, { id: S2, index: 0 });
    expect(store.doc.sheetOrder).toEqual([S2, sheet]);
    expect(store.doc.sheets[S2]!.title).toBe('2');

    must(store, updateSheet, { id: S2, set: { title: 'Potenza', size: 'A4' } });
    expect(store.doc.sheets[S2]).toMatchObject({ title: 'Potenza', size: 'A4' });

    must(store, moveSheet, { id: S2, index: 5 });
    expect(store.doc.sheetOrder).toEqual([sheet, S2]);
  });

  it('removes a sheet with its content but never the last one', () => {
    const { store, sheet } = twoContacts();
    expect(store.run(removeSheet, { id: sheet }).ok).toBe(false);

    must(store, addSheet, { id: S2 });
    must(store, removeSheet, { id: sheet });
    expect(store.doc.sheetOrder).toEqual([S2]);
    expect(Object.keys(store.doc.elements)).toHaveLength(0);
    expect(Object.keys(store.doc.wires)).toHaveLength(0);

    store.undo();
    expect(store.doc.elements[A]).toBeDefined();
    expect(store.doc.wires[W]).toBeDefined();
  });
});

describe('symbols', () => {
  it('rejects invalid symbols', () => {
    const { store } = setup();
    const dup = twoTerminalSymbol('dup', {
      terminals: [...CONTACT.terminals, { id: T1, name: 'x', x: 0, y: 0, dir: 'n' }],
    });
    expect(store.run(importSymbol, { symbol: dup }).ok).toBe(false);
    const badBridge = twoTerminalSymbol('bb', { bridges: [[T1, 'zz' as never]] });
    expect(store.run(importSymbol, { symbol: badBridge }).ok).toBe(false);
  });

  it('refuses a new version that drops a wired terminal, and removing a used symbol', () => {
    const { store } = twoContacts();
    const shrunk = { ...CONTACT, terminals: [CONTACT.terminals[0]!], version: 2 };
    const result = store.run(importSymbol, { symbol: shrunk });
    expect(result.ok || result.error.code).toBe('terminal-in-use');
    expect(store.run(removeSymbol, { id: CONTACT.id }).ok).toBe(false);
    must(store, removeSymbol, { id: TERMINAL.id });
  });
});

describe('elements', () => {
  it('places an element with the symbol default info', () => {
    const { store, sheet } = setup();
    must(store, placeElement, {
      id: A,
      sheetId: sheet,
      symbolId: CONTACT.id,
      x: 5,
      y: 5,
      info: { function: 'Marcia' },
    });
    expect(store.doc.elements[A]).toMatchObject({
      x: 5,
      rotation: 0,
      mirrored: false,
      info: { label: 'K', function: 'Marcia' },
    });
    expect(
      store.run(placeElement, { id: A, sheetId: sheet, symbolId: CONTACT.id, x: 0, y: 0 }).ok,
    ).toBe(false);
  });

  it('moves wire bends only when both ends move', () => {
    const { store } = twoContacts();
    must(store, setWireBends, { id: W, bends: [{ x: 10, y: 10 }] });
    must(store, moveItems, { elements: [A], dx: 5, dy: 0 });
    expect(store.doc.wires[W]!.bends).toEqual([{ x: 10, y: 10 }]);
    must(store, moveItems, { elements: [A, B], dx: 0, dy: 5 });
    expect(store.doc.wires[W]!.bends).toEqual([{ x: 10, y: 15 }]);
    expect(store.doc.elements[A]).toMatchObject({ x: 5, y: 5 });
  });

  it('rotates, mirrors and edits info', () => {
    const { store } = twoContacts();
    must(store, rotateElements, { ids: [A], by: 270 });
    must(store, rotateElements, { ids: [A], by: 180 });
    expect(store.doc.elements[A]!.rotation).toBe(90);
    must(store, mirrorElements, { ids: [A, B] });
    expect(store.doc.elements[B]!.mirrored).toBe(true);
    must(store, setElementInfo, { id: A, set: { label: 'KM1', plc_address: 'I0.0' } });
    must(store, setElementInfo, { id: A, set: { plc_address: undefined } });
    expect(store.doc.elements[A]!.info).toEqual({ label: 'KM1' });
  });
});

describe('wires', () => {
  it('validates wire ends', () => {
    const { store } = twoContacts();
    const loop = store.run(addWire, {
      from: { element: A, terminal: T1 },
      to: { element: A, terminal: T1 },
    });
    expect(loop.ok || loop.error.code).toBe('loop');
    const missing = store.run(addWire, {
      from: { element: A, terminal: 'zz' as never },
      to: { element: B, terminal: T2 },
    });
    expect(missing.ok || missing.error.code).toBe('not-found');

    must(store, addSheet, { id: S2 });
    must(store, placeElement, {
      id: 'c' as ElementId,
      sheetId: S2,
      symbolId: CONTACT.id,
      x: 0,
      y: 0,
    });
    const cross = store.run(addWire, {
      from: { element: A, terminal: T1 },
      to: { element: 'c' as ElementId, terminal: T1 },
    });
    expect(cross.ok || cross.error.code).toBe('cross-sheet');
  });

  it('sets and removes wire properties', () => {
    const { store } = twoContacts();
    must(store, setWireProps, { id: W, set: { number: '12', color: 'BU' } });
    must(store, setWireProps, { id: W, set: { color: undefined } });
    expect(store.doc.wires[W]!.props).toEqual({ number: '12' });
  });

  it('splits a wire at a junction on the nearest segment', () => {
    const { store } = twoContacts();
    // A.T2 is at (0,5), B.T1 at (0,15): path (0,5) → (10,5) → (10,15) → (0,15)
    must(store, setWireBends, {
      id: W,
      bends: [
        { x: 10, y: 5 },
        { x: 10, y: 15 },
      ],
    });
    must(store, setWireProps, { id: W, set: { number: '3' } });
    const J = 'j' as JunctionId;
    const W2 = 'w2' as WireId;
    must(store, splitWire, { id: W, at: { x: 10, y: 10 }, junctionId: J, newWireId: W2 });

    expect(store.doc.junctions[J]).toMatchObject({ x: 10, y: 10 });
    expect(store.doc.wires[W]).toMatchObject({ to: { junction: J }, bends: [{ x: 10, y: 5 }] });
    expect(store.doc.wires[W2]).toMatchObject({
      from: { junction: J },
      to: { element: B, terminal: T1 },
      bends: [{ x: 10, y: 15 }],
      props: { number: '3' },
    });
  });
});

describe('removeItems', () => {
  it('removes attached wires, orphan junctions and dangling links', () => {
    const { store, sheet } = twoContacts();
    const J = 'j' as JunctionId;
    must(store, splitWire, {
      id: W,
      at: { x: 0, y: 10 },
      junctionId: J,
      newWireId: 'w2' as WireId,
    });
    must(store, placeElement, {
      id: 'r' as ElementId,
      sheetId: sheet,
      symbolId: CONTACT.id,
      x: 50,
      y: 0,
    });
    // No command sets links yet (they come with cross references): inject one directly.
    store.reset({
      ...store.doc,
      elements: {
        ...store.doc.elements,
        ['r' as ElementId]: { ...store.doc.elements['r' as ElementId]!, link: A },
      },
    });

    must(store, removeItems, { elements: [A] });
    expect(store.doc.wires[W]).toBeUndefined();
    expect(store.doc.wires['w2' as WireId]).toBeDefined(); // still connects J to B
    expect(store.doc.junctions[J]).toBeDefined();
    expect(store.doc.elements['r' as ElementId]!.link).toBeUndefined();

    must(store, removeItems, { wires: ['w2' as WireId] });
    expect(store.doc.junctions[J]).toBeUndefined();

    store.undo();
    store.undo();
    expect(store.doc.elements[A]).toBeDefined();
    expect(store.doc.elements['r' as ElementId]!.link).toBe(A);
  });
});

import { describe, expect, it } from 'vitest';
import type { SymbolDef, WireId } from '../index.ts';
import {
  addWire,
  autoNumberPotential,
  countLocked,
  importSymbol,
  placeElement,
  removeItems,
  renumber,
  setPotentialLock,
  setPotentialNumber,
} from '../index.ts';
import { CONTACT, T2, must, setup } from '../test-utils.ts';

const id = (s: string) => s as never;
const CARD: SymbolDef = {
  id: id('card'),
  name: 'Scheda',
  category: 'PLC',
  kind: 'plc',
  graphics: [],
  terminals: ['0', '1', '2', '3'].map((name, i) => ({
    id: id(`b${name}`),
    name,
    x: -7.5 + i * 5,
    y: -5,
    dir: 'n' as const,
  })),
  bridges: [],
  defaultInfo: { label: 'A1', plc_address: 'I0' },
  version: 1,
};

function card() {
  const ctx = setup();
  must(ctx.store, importSymbol, { symbol: CARD });
  must(ctx.store, placeElement, {
    id: id('a1'),
    sheetId: ctx.sheet,
    symbolId: id('card'),
    x: 60,
    y: 120,
  });
  for (const i of [0, 1]) {
    must(ctx.store, placeElement, {
      id: id(`k${i}`),
      sheetId: ctx.sheet,
      symbolId: CONTACT.id,
      x: 40 + i * 20,
      y: 50,
    });
  }
  const wire = (w: string, k: string, t: string) => {
    must(ctx.store, addWire, {
      id: id(w),
      from: { element: id(k), terminal: T2 },
      to: { element: id('a1'), terminal: id(t) },
    });
    must(ctx.store, autoNumberPotential, { id: id(w) });
  };
  const number = (w: string) => ctx.store.doc.wires[w as WireId]?.props.number;
  return { ...ctx, wire, number };
}

describe('renumbering PLC card wires after manual edits', () => {
  it('manual number cleared, then renumber', () => {
    const c = card();
    c.wire('w1', 'k0', 'b1');
    must(c.store, setPotentialNumber, { id: id('w1'), number: 'XX' });
    must(c.store, setPotentialNumber, { id: id('w1'), number: '' });
    must(c.store, renumber, {});
    expect(c.number('w1')).toBe('I0.1');
  });

  it('manual number unlocked, then renumber', () => {
    const c = card();
    c.wire('w1', 'k0', 'b1');
    must(c.store, setPotentialNumber, { id: id('w1'), number: 'XX' });
    must(c.store, setPotentialLock, { id: id('w1'), locked: false });
    must(c.store, renumber, {});
    expect(c.number('w1')).toBe('I0.1');
  });

  it('renamed wire deleted, new wire drawn, renumber', () => {
    const c = card();
    c.wire('w1', 'k0', 'b1');
    must(c.store, setPotentialNumber, { id: id('w1'), number: 'XX' });
    must(c.store, removeItems, { wires: [id('w1')] });
    c.wire('w2', 'k1', 'b1');
    expect(c.number('w2')).toBe('I0.1');
    must(c.store, renumber, {});
    expect(c.number('w2')).toBe('I0.1');
  });

  it('keeps numbers typed by hand until they are unlocked', () => {
    const c = card();
    c.wire('w1', 'k0', 'b1');
    c.wire('w2', 'k1', 'b2');
    must(c.store, setPotentialNumber, { id: id('w1'), number: 'XX' });
    must(c.store, setPotentialNumber, { id: id('w2'), number: 'YY' });
    must(c.store, removeItems, { wires: [id('w1')] });
    must(c.store, renumber, {});
    expect(c.number('w2')).toBe('YY'); // locked: left alone by design (N3)
    expect(countLocked(c.store.doc)).toBe(1);
    must(c.store, setPotentialLock, { id: id('w2'), locked: false });
    must(c.store, renumber, {});
    expect(c.number('w2')).toBe('I0.2');
    expect(countLocked(c.store.doc)).toBe(0);
  });
});

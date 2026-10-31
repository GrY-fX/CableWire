import { describe, expect, it } from 'vitest';
import type { ElementId, SheetId, WireId } from '../ids.ts';
import { getNumbering } from '../model.ts';
import { placeElement } from '../commands/elements.ts';
import { autoNumberPotential, renumber, updateNumbering } from '../commands/numbering.ts';
import { addSheet } from '../commands/sheets.ts';
import { addWire, setPotentialLock, setPotentialNumber } from '../commands/wires.ts';
import { removeItems } from '../commands/remove.ts';
import { copyFragment, freshIds, pasteFragment } from '../commands/clipboard.ts';
import { columnAt } from '../sheet.ts';
import { A3, CONTACT, T1, T2, must, setup } from '../test-utils.ts';
import { potentialsInReadingOrder } from './allocate.ts';
import { formatPattern, parsePattern } from './rule.ts';

const id = (s: string) => s as never;

describe('patterns', () => {
  it('parses and formats placeholders', () => {
    const parsed = parsePattern('W{foglio}.{colonna}-{n:3}');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(formatPattern(parsed.tokens, { n: 7, sheet: 2, column: 4 })).toBe('W2.4-007');
  });

  it('reports invalid patterns', () => {
    const error = (p: string) => {
      const r = parsePattern(p);
      return r.ok ? '' : r.error;
    };
    expect(error('{foglio}')).toContain('{n}');
    expect(error('{n}{pagina}')).toContain('{pagina}');
    expect(error('{n')).toContain('chiusura');
    expect(error('n}')).toContain('apertura');
    expect(error('{n:2}')).toBe('');
  });
});

/**
 * Contacts in pairs, one pair per column of an A3 sheet (columns are ~39.5 mm wide,
 * starting at x = 15): a wire joins the bottom of the top contact to the top of the
 * bottom one.
 */
function sheetWithPairs(xs: number[]) {
  const ctx = setup();
  xs.forEach((x, i) => {
    for (const [suffix, y] of [
      ['t', 50],
      ['b', 80],
    ] as const) {
      must(ctx.store, placeElement, {
        id: id(`${suffix}${i}`),
        sheetId: ctx.sheet,
        symbolId: CONTACT.id,
        x,
        y,
      });
    }
  });
  const wire = (i: number) =>
    must(ctx.store, addWire, {
      id: id(`w${i}`),
      from: { element: id(`t${i}`), terminal: T2 },
      to: { element: id(`b${i}`), terminal: T1 },
    });
  const number = (i: number) => ctx.store.doc.wires[`w${i}` as WireId]?.props.number;
  return { ...ctx, wire, number };
}

describe('automatic numbering', () => {
  it('uses {foglio}.{n:2} by default and numbers new potentials once', () => {
    const ctx = sheetWithPairs([20, 60, 100]);
    expect(getNumbering(ctx.store.doc).pattern).toBe('{foglio}.{n:2}');
    for (const i of [0, 1, 2]) {
      ctx.wire(i);
      must(ctx.store, autoNumberPotential, { id: id(`w${i}`) });
    }
    expect([0, 1, 2].map(ctx.number)).toEqual(['1.01', '1.02', '1.03']);
    // Already numbered: no change.
    must(ctx.store, autoNumberPotential, { id: id('w1') });
    expect(ctx.number(1)).toBe('1.02');
  });

  it('respects the automatic switch and the start value', () => {
    const ctx = sheetWithPairs([20]);
    must(ctx.store, updateNumbering, { set: { auto: false } });
    ctx.wire(0);
    must(ctx.store, autoNumberPotential, { id: id('w0') });
    expect(ctx.number(0)).toBeUndefined();
    must(ctx.store, updateNumbering, { set: { auto: true, pattern: 'W{n:3}', start: 10 } });
    must(ctx.store, autoNumberPotential, { id: id('w0') });
    expect(ctx.number(0)).toBe('W010');
  });

  it('refuses invalid patterns', () => {
    const ctx = sheetWithPairs([20]);
    const result = ctx.store.run(updateNumbering, { set: { pattern: '{foglio}' } });
    expect(result.ok || result.error.code).toBe('invalid-pattern');
  });

  it('orders potentials by sheet, column, then top to bottom', () => {
    const ctx = sheetWithPairs([100, 20]);
    ctx.wire(0);
    ctx.wire(1);
    const order = potentialsInReadingOrder(ctx.store.doc).map((p) => p.wire);
    expect(order).toEqual(['w1', 'w0']);
    const sheet = ctx.store.doc.sheets[ctx.sheet]!;
    expect(columnAt(sheet, { x: 20, y: 0 })).toBe(1);
    expect(columnAt(sheet, { x: 100, y: 0 })).toBe(3);
  });
});

describe('renumbering', () => {
  it('packs numbers after deletions and keeps locked ones', () => {
    const ctx = sheetWithPairs([20, 60, 100, 140]);
    for (const i of [0, 1, 2, 3]) {
      ctx.wire(i);
      must(ctx.store, autoNumberPotential, { id: id(`w${i}`) });
    }
    must(ctx.store, removeItems, { wires: [id('w1')] });
    must(ctx.store, setPotentialNumber, { id: id('w3'), number: '1.02' }); // typed: locked
    must(ctx.store, renumber, { sheetId: ctx.sheet });
    // Nothing to change: no empty undo entry.
    expect([0, 2, 3].map(ctx.number)).toEqual(['1.01', '1.03', '1.02']);
    expect(ctx.store.undoLabel).toBe('Numero filo');

    must(ctx.store, setPotentialLock, { id: id('w3'), locked: false });
    must(ctx.store, renumber, {});
    expect([0, 2, 3].map(ctx.number)).toEqual(['1.01', '1.02', '1.03']);
    expect(ctx.store.undoLabel).toBe('Ricalcola numerazione');
  });

  it('renumbers one sheet without touching the others', () => {
    const ctx = sheetWithPairs([20, 60]);
    ctx.wire(0);
    ctx.wire(1);
    must(ctx.store, setPotentialNumber, { id: id('w0'), number: '9', locked: false });
    must(ctx.store, setPotentialNumber, { id: id('w1'), number: '8', locked: false });
    must(ctx.store, addSheet, { id: 's2' as SheetId, format: A3 });
    must(ctx.store, renumber, { sheetId: 's2' as SheetId });
    expect([0, 1].map(ctx.number)).toEqual(['9', '8']);
    must(ctx.store, renumber, {});
    expect([0, 1].map(ctx.number)).toEqual(['1.01', '1.02']);
  });

  it('strips numbers from pasted wires', () => {
    const ctx = sheetWithPairs([20]);
    ctx.wire(0);
    must(ctx.store, setPotentialNumber, { id: id('w0'), number: '5' });
    const fragment = copyFragment(ctx.store.doc, { elements: [id('t0'), id('b0')] });
    const ids = freshIds(fragment);
    must(ctx.store, pasteFragment, { fragment, sheetId: ctx.sheet, dx: 0, dy: 40, ids });
    expect(ctx.store.doc.wires[ids.w0 as WireId]!.props).toEqual({});
    expect(ctx.store.doc.elements[ids.t0 as ElementId]).toBeDefined();
  });
});

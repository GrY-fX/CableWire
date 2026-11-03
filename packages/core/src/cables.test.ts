import { describe, expect, it } from 'vitest';
import { cableFormation, cableMarkLayout, cableOfWire, defaultConductorCodes } from './cables.ts';
import {
  addConductor,
  addWiresToCable,
  createCable,
  moveCableMark,
  releaseWire,
  removeCables,
  renumberCables,
  setConductor,
  updateCable,
} from './commands/cables.ts';
import { copyFragment, freshIds, pasteFragment } from './commands/clipboard.ts';
import { placeElement } from './commands/elements.ts';
import { removeItems } from './commands/remove.ts';
import { addSheet } from './commands/sheets.ts';
import { addWire, setPotentialStyle } from './commands/wires.ts';
import type { CableId, WireId } from './ids.ts';
import { CONTACT, T1, T2, must, setup } from './test-utils.ts';
import { validate } from './validate.ts';

const id = (s: string) => s as never;

/** n vertical wires side by side: top contacts at y=0, bottom ones at y=40, x = 10·i. */
function wires(n: number) {
  const ctx = setup();
  for (let i = 0; i < n; i++) {
    for (const [name, y] of [
      [`a${i}`, 0],
      [`b${i}`, 40],
    ] as const) {
      must(ctx.store, placeElement, {
        id: id(name),
        sheetId: ctx.sheet,
        symbolId: CONTACT.id,
        x: 10 * i,
        y,
      });
    }
    must(ctx.store, addWire, {
      id: id(`w${i}`),
      from: { element: id(`a${i}`), terminal: T2 },
      to: { element: id(`b${i}`), terminal: T1 },
    });
  }
  return ctx;
}
const cable = (ctx: ReturnType<typeof setup>, c = 'c') => ctx.store.doc.cables[c as CableId]!;
const codes = (ctx: ReturnType<typeof setup>, c = 'c') =>
  cable(ctx, c).conductors.map((k) => [k.code, k.wire]);

describe('cables', () => {
  it('gather wires in conductors of the standard colours, the protective one in GNYE', () => {
    const ctx = wires(4);
    must(ctx.store, setPotentialStyle, { id: id('w1'), set: { color: 'GNYE' } });
    must(ctx.store, createCable, { id: id('c'), wires: [id('w3'), id('w1'), id('w0'), id('w2')] });
    expect(cable(ctx).label).toBe('1W1');
    expect(codes(ctx)).toEqual([
      ['BN', 'w0'],
      ['BK', 'w2'],
      ['GY', 'w3'],
      ['GNYE', 'w1'],
    ]);
    must(ctx.store, updateCable, {
      id: id('c'),
      set: { section: '2,5', type: 'FG16OR16', length: 12 },
    });
    expect(cableFormation(cable(ctx))).toBe('4G2,5');
    expect(cableOfWire(ctx.store.doc, id('w2'))?.conductor.code).toBe('BK');
    expect(validate(ctx.store.doc)).toEqual([]);
  });

  it('number the conductors above five, and spares follow the sequence', () => {
    expect(defaultConductorCodes(7, true)).toEqual({
      codes: ['1', '2', '3', '4', '5', '6', 'GNYE'],
      numbered: true,
    });
    expect(defaultConductorCodes(2, false).codes).toEqual(['BU', 'BN']);
    const ctx = wires(2);
    must(ctx.store, createCable, { id: id('c'), wires: [id('w0'), id('w1')] });
    must(ctx.store, addConductor, { cable: id('c') });
    expect(codes(ctx).map(([c]) => c)).toEqual(['BU', 'BN', 'BK']);
    must(ctx.store, updateCable, { id: id('c'), set: { section: '1,5' } });
    expect(cableFormation(cable(ctx))).toBe('3x1,5');
  });

  it('move wires between conductors and cables; removed wires leave spares', () => {
    const ctx = wires(3);
    must(ctx.store, createCable, { id: id('c'), wires: [id('w0'), id('w1')] });
    must(ctx.store, createCable, { id: id('d'), wires: [id('w2')] });
    // Adding a wire of another cable takes it out of that one.
    must(ctx.store, addWiresToCable, { cable: id('c'), wires: [id('w2')] });
    expect(codes(ctx, 'd')).toEqual([['BN', undefined]]);
    expect(codes(ctx).map(([, w]) => w)).toEqual(['w0', 'w1', 'w2']);
    const spare = cable(ctx).conductors[1]!.id;
    must(ctx.store, releaseWire, { wire: id('w1') });
    must(ctx.store, setConductor, { cable: id('c'), conductor: spare, code: 'GY', wire: id('w2') });
    expect(codes(ctx).map(([c, w]) => `${c}:${w ?? '-'}`)).toEqual(['BU:w0', 'GY:w2', 'BK:-']);
    must(ctx.store, removeItems, { wires: [id('w0')] });
    expect(cable(ctx).conductors[0]!.wire).toBeUndefined();
    expect(validate(ctx.store.doc)).toEqual([]);
    must(ctx.store, removeCables, { ids: [id('c')] });
    expect(ctx.store.doc.cables[id('c') as CableId]).toBeUndefined();
    expect(ctx.store.doc.wires[id('w2') as WireId]).toBeDefined();
  });

  it('show a mark across their wires, a quarter along them, movable', () => {
    const ctx = wires(3);
    must(ctx.store, createCable, { id: id('c'), wires: [id('w0'), id('w1'), id('w2')] });
    const layout = cableMarkLayout(ctx.store.doc, cable(ctx), ctx.sheet)!;
    // Wires run from y=5 to y=35: the mark is at y=12.5, crossing x=0, 10, 20.
    expect(layout.axis).toBe('y');
    expect(layout.at).toBe(12.5);
    expect(layout.crossings.map((c) => c.x)).toEqual([0, 10, 20]);
    expect(layout.label.text).toBe('1W1 3');
    must(ctx.store, moveCableMark, { id: id('c'), sheetId: ctx.sheet, at: 30 });
    expect(cableMarkLayout(ctx.store.doc, cable(ctx), ctx.sheet)!.at).toBe(30);
    // Outside the wires: nothing to cross, no mark.
    must(ctx.store, moveCableMark, { id: id('c'), sheetId: ctx.sheet, at: 60 });
    expect(cableMarkLayout(ctx.store.doc, cable(ctx), ctx.sheet)).toBeUndefined();
  });

  it('are pasted with their wires as new cables, and renumbered in reading order', () => {
    const ctx = wires(2);
    must(ctx.store, addSheet, { id: id('s2') });
    must(ctx.store, createCable, { id: id('c'), wires: [id('w0'), id('w1')] });
    const fragment = copyFragment(ctx.store.doc, { elements: ['a0', 'b0', 'a1', 'b1'].map(id) });
    expect(fragment.cables).toHaveLength(1);
    const ids = freshIds(fragment);
    must(ctx.store, pasteFragment, { fragment, sheetId: id('s2'), dx: 0, dy: 0, ids });
    const copy = cable(ctx, ids['c']);
    expect(copy.label).toBe('2W1');
    expect(copy.conductors.map((k) => k.wire)).toEqual([ids['w0'], ids['w1']]);
    must(ctx.store, updateCable, { id: id('c'), set: { label: '1W7' } });
    must(ctx.store, renumberCables, {});
    expect(cable(ctx).label).toBe('1W1');
    expect(validate(ctx.store.doc)).toEqual([]);
  });
});

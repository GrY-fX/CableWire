import { describe, expect, it } from 'vitest';
import type { WireId } from '../ids.ts';
import type { SymbolDef } from '../model.ts';
import { placeElement, setElementInfo } from '../commands/elements.ts';
import { importSymbol } from '../commands/symbols.ts';
import { autoNumberPotential, renumber, updateNumbering } from '../commands/numbering.ts';
import { addWire, setPotentialNumber } from '../commands/wires.ts';
import { CONTACT, T1, T2, TERMINAL, must, setup } from '../test-utils.ts';
import { numberingConflicts } from './conflicts.ts';
import { numberOrigin, sourceValues } from './sources.ts';

const id = (s: string) => s as never;

/** k (contact) —w1— x (feed-through terminal) —w2— q (contact). */
function chain(
  info: { k?: Record<string, string>; x?: Record<string, string>; q?: Record<string, string> } = {},
) {
  const ctx = setup();
  const place = (name: 'k' | 'x' | 'q', symbolId: string, x: number) =>
    must(ctx.store, placeElement, {
      id: id(name),
      sheetId: ctx.sheet,
      symbolId: id(symbolId),
      x,
      y: 50,
      ...(info[name] && { info: info[name] }),
    });
  place('k', CONTACT.id, 20);
  place('x', TERMINAL.id, 60);
  place('q', CONTACT.id, 100);
  const wire = (w: string, from: string, to: string) =>
    must(ctx.store, addWire, {
      id: id(w),
      from: { element: id(from), terminal: T2 },
      to: { element: id(to), terminal: T1 },
    });
  const number = (w: string) => ctx.store.doc.wires[w as WireId]?.props.number;
  return { ...ctx, wire, number };
}

describe('number sources', () => {
  it('takes the PLC address reached by the potential (default source)', () => {
    const ctx = chain({ q: { label: 'KA3', plc_address: 'I0.3' } });
    ctx.wire('w1', 'k', 'x');
    ctx.wire('w2', 'x', 'q');
    must(ctx.store, autoNumberPotential, { id: id('w1') });
    expect(ctx.number('w1')).toBe('I0.3');
    expect(ctx.number('w2')).toBe('I0.3');
    expect(numberOrigin(ctx.store.doc, id('w2'))).toEqual({ source: 'plc', from: 'KA3' });
  });

  it('takes the terminal block number, short or full', () => {
    const ctx = chain({ x: { label: 'X1:5' } });
    must(ctx.store, updateNumbering, { set: { sources: ['terminal'] } });
    ctx.wire('w1', 'k', 'x');
    expect(sourceValues(ctx.store.doc, id('w1'))?.values.map((v) => v.value)).toEqual(['5']);
    must(ctx.store, updateNumbering, { set: { terminalStyle: 'full' } });
    expect(sourceValues(ctx.store.doc, id('w1'))?.values.map((v) => v.value)).toEqual(['X1:5']);
  });

  it('follows the priority order of the enabled sources', () => {
    const ctx = chain({ x: { label: 'X1:5' }, q: { plc_address: 'Q1.0' } });
    ctx.wire('w1', 'k', 'x');
    ctx.wire('w2', 'x', 'q');
    must(ctx.store, updateNumbering, { set: { sources: ['terminal', 'plc'] } });
    expect(sourceValues(ctx.store.doc, id('w1'))?.source).toBe('terminal');
    must(ctx.store, updateNumbering, { set: { sources: ['plc', 'terminal'] } });
    expect(sourceValues(ctx.store.doc, id('w1'))?.source).toBe('plc');
    must(ctx.store, updateNumbering, { set: { sources: [] } });
    expect(sourceValues(ctx.store.doc, id('w1'))).toBeUndefined();
  });

  it('uses labels when enabled, skipping terminal blocks', () => {
    const ctx = chain({ k: { label: 'M1' }, x: { label: 'X1:5' } });
    must(ctx.store, updateNumbering, { set: { sources: ['label'] } });
    ctx.wire('w1', 'k', 'x');
    expect(sourceValues(ctx.store.doc, id('w1'))?.values.map((v) => v.value)).toEqual(['M1']);
  });

  it('keeps counter numbers away from source values when renumbering', () => {
    const ctx = chain({ x: { label: 'X1:1' } });
    must(ctx.store, updateNumbering, { set: { sources: ['terminal'], pattern: '{n}' } });
    ctx.wire('w1', 'k', 'x'); // potential with the terminal: "1"
    must(ctx.store, placeElement, {
      id: id('z'),
      sheetId: ctx.sheet,
      symbolId: CONTACT.id,
      x: 20,
      y: 100,
    });
    must(ctx.store, addWire, {
      id: id('w3'),
      from: { element: id('z'), terminal: T1 },
      to: { element: id('z'), terminal: T2 },
    });
    must(ctx.store, renumber, {});
    expect(ctx.number('w1')).toBe('1');
    expect(ctx.number('w3')).toBe('2');
  });
});

describe('numbering conflicts', () => {
  it('lists different values from the deciding source until one is chosen', () => {
    const ctx = chain({
      k: { label: 'KA1', plc_address: 'I0.1' },
      q: { label: 'KA2', plc_address: 'I0.2' },
    });
    ctx.wire('w1', 'k', 'x');
    ctx.wire('w2', 'x', 'q');
    must(ctx.store, autoNumberPotential, { id: id('w1') });
    expect(ctx.number('w1')).toBe('I0.1');
    expect(numberingConflicts(ctx.store.doc)).toEqual([
      expect.objectContaining({
        kind: 'sources',
        source: 'plc',
        current: 'I0.1',
        candidates: [
          { value: 'I0.1', from: 'KA1' },
          { value: 'I0.2', from: 'KA2' },
        ],
      }),
    ]);
    must(ctx.store, setPotentialNumber, { id: id('w2'), number: 'I0.2' }); // locked choice
    expect(numberingConflicts(ctx.store.doc)).toEqual([]);
    expect(ctx.number('w1')).toBe('I0.2');
  });

  it('lists potentials joined with different numbers', () => {
    const ctx = chain();
    ctx.wire('w1', 'k', 'x');
    must(ctx.store, setPotentialNumber, { id: id('w1'), number: '7' });
    must(ctx.store, addWire, {
      id: id('w9'),
      from: { element: id('q'), terminal: T1 },
      to: { element: id('q'), terminal: T2 },
      props: { number: '8' },
    });
    // Join the two numbered potentials.
    must(ctx.store, addWire, {
      id: id('w2'),
      from: { element: id('x'), terminal: T2 },
      to: { element: id('q'), terminal: T1 },
    });
    const conflicts = numberingConflicts(ctx.store.doc);
    expect(conflicts).toEqual([
      expect.objectContaining({ kind: 'join', candidates: [expect.anything(), expect.anything()] }),
    ]);
    expect(conflicts[0]!.candidates.map((c) => c.value).sort()).toEqual(['7', '8']);
    must(ctx.store, setPotentialNumber, { id: id('w2'), number: '8' });
    expect(numberingConflicts(ctx.store.doc)).toEqual([]);
  });

  it('updates sources when element fields change, after a renumber', () => {
    const ctx = chain();
    ctx.wire('w1', 'k', 'x');
    must(ctx.store, autoNumberPotential, { id: id('w1') });
    expect(ctx.number('w1')).toBe('1.01');
    must(ctx.store, setElementInfo, { id: id('k'), set: { plc_address: 'I1.0' } });
    must(ctx.store, renumber, {});
    expect(ctx.number('w1')).toBe('I1.0');
  });
});

describe('PLC cards', () => {
  const CARD: SymbolDef = {
    id: 'card' as never,
    name: 'Scheda 4 ingressi',
    category: 'PLC',
    kind: 'plc' as const,
    graphics: [],
    terminals: ['0', '1', '2', '3'].map((name, i) => ({
      id: `b${name}` as never,
      name,
      x: -7.5 + i * 5,
      y: -5,
      dir: 'n' as const,
    })),
    bridges: [],
    defaultInfo: { label: 'A1', plc_address: 'I0' },
    version: 1,
  };
  CARD.terminals.push({ id: 'm' as never, name: 'M', x: 0, y: 5, dir: 's' as const });

  function withCard() {
    const ctx = chain();
    must(ctx.store, importSymbol, { symbol: CARD });
    must(ctx.store, placeElement, {
      id: id('a1'),
      sheetId: ctx.sheet,
      symbolId: id('card'),
      x: 60,
      y: 120,
    });
    const toCard = (w: string, from: string, terminal: string) =>
      must(ctx.store, addWire, {
        id: id(w),
        from: { element: id(from), terminal: T2 },
        to: { element: id('a1'), terminal: id(terminal) },
      });
    return { ...ctx, toCard };
  }

  it('combines the card byte with the number of the terminal reached', () => {
    const ctx = withCard();
    ctx.toCard('w1', 'k', 'b3');
    must(ctx.store, autoNumberPotential, { id: id('w1') });
    expect(ctx.number('w1')).toBe('I0.3');
    expect(numberOrigin(ctx.store.doc, id('w1'))).toEqual({ source: 'plc', from: 'A1 morsetto 3' });
  });

  it('gives no address on power terminals', () => {
    const ctx = withCard();
    ctx.toCard('w1', 'k', 'm');
    expect(sourceValues(ctx.store.doc, id('w1'))).toBeUndefined();
  });

  it('uses the configured format and refuses invalid ones', () => {
    const ctx = withCard();
    must(ctx.store, setElementInfo, { id: id('a1'), set: { plc_address: '0' } });
    must(ctx.store, updateNumbering, { set: { plcPattern: '%IX{byte}.{morsetto}' } });
    ctx.toCard('w1', 'k', 'b2');
    expect(sourceValues(ctx.store.doc, id('w1'))?.values[0]?.value).toBe('%IX0.2');
    const missing = ctx.store.run(updateNumbering, { set: { plcPattern: '{byte}' } });
    expect(missing.ok || missing.error.message).toContain('{morsetto}');
    const unknown = ctx.store.run(updateNumbering, { set: { plcPattern: '{bit}' } });
    expect(unknown.ok || unknown.error.message).toContain('{bit}');
  });

  it('reports two card inputs on the same potential as a conflict', () => {
    const ctx = withCard();
    ctx.toCard('w1', 'k', 'b1');
    ctx.toCard('w2', 'k', 'b2'); // same contact terminal: same potential
    expect(numberingConflicts(ctx.store.doc)[0]?.candidates.map((c) => c.value)).toEqual([
      'I0.1',
      'I0.2',
    ]);
  });

  it('keeps plain elements with a full PLC address unchanged', () => {
    const ctx = chain({ q: { plc_address: 'Q4.7' } });
    ctx.wire('w1', 'k', 'x');
    ctx.wire('w2', 'x', 'q');
    expect(sourceValues(ctx.store.doc, id('w1'))?.values[0]?.value).toBe('Q4.7');
  });
});

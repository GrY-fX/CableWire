import { describe, expect, it } from 'vitest';
import { addWire, splitWire } from './commands/wires.ts';
import { placeElement } from './commands/elements.ts';
import { removeItems } from './commands/remove.ts';
import { getPotentials, terminalKey } from './potentials.ts';
import { CONTACT, T1, T2, TERMINAL, must, setup } from './test-utils.ts';

/** Casts a test string to any id type. */
const id = (s: string) => s as never;

/**
 * K1 —w1— X1 (feed-through) —w2— K2, plus K3 unconnected.
 */
function circuit() {
  const ctx = setup();
  const place = (name: string, symbolId = CONTACT.id, x = 0) =>
    must(ctx.store, placeElement, {
      id: id(name),
      sheetId: ctx.sheet,
      symbolId,
      x,
      y: 0,
    });
  place('K1');
  place('X1', TERMINAL.id, 20);
  place('K2', CONTACT.id, 40);
  place('K3', CONTACT.id, 60);
  must(ctx.store, addWire, {
    id: id('w1'),
    from: { element: id('K1'), terminal: T2 },
    to: { element: id('X1'), terminal: T1 },
  });
  must(ctx.store, addWire, {
    id: id('w2'),
    from: { element: id('X1'), terminal: T2 },
    to: { element: id('K2'), terminal: T1 },
  });
  return ctx;
}

const key = (element: string, terminal = T1) => terminalKey(id(element), terminal);

describe('potentials', () => {
  it('joins wires through feed-through terminals', () => {
    const { store } = circuit();
    const p = getPotentials(store.doc);
    const main = p.potentialOf(key('K1', T2));
    expect(main).toBeDefined();
    expect(p.potentialOf(key('X1', T1))).toBe(main);
    expect(p.potentialOf(key('X1', T2))).toBe(main);
    expect(p.potentialOf(key('K2', T1))).toBe(main);
    expect(p.wires(main!)).toEqual(['w1', 'w2']);
    expect(p.potentialOfWire(id('w2'))).toBe(main);

    expect(p.potentialOf(key('K1', T1))).not.toBe(main);
    expect(p.potentialOf(key('K3'))).not.toBe(main);
    // K1.T1, K1.T2+X1+K2.T1, K2.T2, K3.T1, K3.T2
    expect(p.count).toBe(5);
  });

  it('includes junctions and branches', () => {
    const { store } = circuit();
    const J = id('j');
    must(store, splitWire, {
      id: id('w2'),
      at: { x: 30, y: 0 },
      junctionId: J,
      newWireId: id('w3'),
    });
    must(store, addWire, { from: { junction: J }, to: { element: id('K3'), terminal: T1 } });
    const p = getPotentials(store.doc);
    expect(p.potentialOf(`j:${J}`)).toBe(p.potentialOf(key('K1', T2)));
    expect(p.potentialOf(key('K3'))).toBe(p.potentialOf(key('K1', T2)));
    expect(p.nodes(p.potentialOf(key('K3'))!)).toContain(`j:${J}`);
  });

  it('splits potentials when a wire is removed', () => {
    const { store } = circuit();
    must(store, removeItems, { wires: [id('w2')] });
    const p = getPotentials(store.doc);
    expect(p.potentialOf(key('K2'))).not.toBe(p.potentialOf(key('K1', T2)));
  });

  it('is memoized per document version', () => {
    const { store } = circuit();
    expect(getPotentials(store.doc)).toBe(getPotentials(store.doc));
    const before = getPotentials(store.doc);
    must(store, removeItems, { wires: [id('w1')] });
    expect(getPotentials(store.doc)).not.toBe(before);
  });
});

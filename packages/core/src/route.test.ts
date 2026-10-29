import { describe, expect, it } from 'vitest';
import type { ElementId, WireId } from './ids.ts';
import { moveItems, placeElement } from './commands/elements.ts';
import { addWire, reconnectWire, setWireBends } from './commands/wires.ts';
import { autoRoute, routeOrthogonal, simplifyPath } from './route.ts';
import { CONTACT, T1, T2, must, setup } from './test-utils.ts';

const p = (x: number, y: number) => ({ x, y });

describe('routeOrthogonal', () => {
  it('goes straight when aligned', () => {
    expect(routeOrthogonal(p(0, 0), 's', p(0, 20), 'n')).toEqual([]);
  });

  it('makes a Z between two vertical terminals and an L otherwise', () => {
    expect(routeOrthogonal(p(0, 0), 's', p(20, 30), 'n')).toEqual([p(0, 15), p(20, 15)]);
    expect(routeOrthogonal(p(0, 0), 'e', p(20, 30), 'w')).toEqual([p(10, 0), p(10, 30)]);
    expect(routeOrthogonal(p(0, 0), 's', p(20, 30), 'w')).toEqual([p(0, 30)]);
    expect(routeOrthogonal(p(0, 0), undefined, p(20, 30), 'n')).toEqual([p(20, 0)]);
    expect(routeOrthogonal(p(0, 0), undefined, p(20, 30), undefined)).toEqual([p(20, 0)]);
  });

  it('snaps the middle of a Z to the grid', () => {
    expect(routeOrthogonal(p(0, 0), 's', p(20, 31), 'n')).toEqual([p(0, 15), p(20, 15)]);
  });

  it('goes out of a terminal first when the target is behind it', () => {
    // Terminal facing north, target below and to the right.
    expect(routeOrthogonal(p(0, 0), 'n', p(20, 30), undefined)).toEqual([p(0, -5), p(20, -5)]);
  });

  it('simplifies paths', () => {
    expect(simplifyPath([p(0, 0), p(0, 0), p(0, 5), p(0, 10), p(5, 10)])).toEqual([
      p(0, 0),
      p(0, 10),
      p(5, 10),
    ]);
  });
});

describe('wires following moved elements', () => {
  /** Contact A at (0,0) and B at (20,30); wire A.T2 (0,5) → B.T1 (20,25). */
  function twoContacts(bends?: { x: number; y: number }[]) {
    const ctx = setup();
    const place = (id: string, x: number, y: number) =>
      must(ctx.store, placeElement, {
        id: id as ElementId,
        sheetId: ctx.sheet,
        symbolId: CONTACT.id,
        x,
        y,
      });
    place('a', 0, 0);
    place('b', 20, 30);
    must(ctx.store, addWire, {
      id: 'w' as WireId,
      from: { element: 'a' as ElementId, terminal: T2 },
      to: { element: 'b' as ElementId, terminal: T1 },
      bends: bends ?? [p(0, 15), p(20, 15)],
    });
    return ctx;
  }
  const bends = (ctx: ReturnType<typeof twoContacts>) => ctx.store.doc.wires['w' as WireId]!.bends;

  it('shifts only the bend next to the moved element (rubber band)', () => {
    const ctx = twoContacts();
    must(ctx.store, moveItems, { elements: ['a' as ElementId], dx: 5, dy: 2.5 });
    // First segment was vertical: the first bend follows in x only.
    expect(bends(ctx)).toEqual([p(5, 15), p(20, 15)]);
    must(ctx.store, moveItems, { elements: ['b' as ElementId], dx: -10, dy: 0 });
    expect(bends(ctx)).toEqual([p(5, 15), p(10, 15)]);
  });

  it('moves every bend when both ends move', () => {
    const ctx = twoContacts();
    must(ctx.store, moveItems, { elements: ['a', 'b'] as ElementId[], dx: 5, dy: 5 });
    expect(bends(ctx)).toEqual([p(5, 20), p(25, 20)]);
  });

  it('routes a straight wire that would become diagonal', () => {
    const ctx = twoContacts([]);
    must(ctx.store, setWireBends, { id: 'w' as WireId, bends: [] });
    // Make it straight first: B right below A.
    must(ctx.store, moveItems, { elements: ['b' as ElementId], dx: -20, dy: 0 });
    expect(bends(ctx)).toEqual([]);
    must(ctx.store, moveItems, { elements: ['b' as ElementId], dx: 10, dy: 0 });
    expect(bends(ctx)).toEqual([p(0, 15), p(10, 15)]);
  });

  it('computes a fresh route and reconnects ends', () => {
    const ctx = twoContacts([p(0, 40), p(20, 40)]);
    const w = ctx.store.doc.wires['w' as WireId]!;
    expect(autoRoute(ctx.store.doc, w.from, w.to)).toEqual([p(0, 15), p(20, 15)]);

    must(ctx.store, reconnectWire, {
      id: 'w' as WireId,
      end: 'to',
      target: { element: 'b' as ElementId, terminal: T2 },
      bends: [],
    });
    expect(ctx.store.doc.wires['w' as WireId]!.to).toEqual({ element: 'b', terminal: T2 });
    const loop = ctx.store.run(reconnectWire, {
      id: 'w' as WireId,
      end: 'to',
      target: { element: 'a' as ElementId, terminal: T2 },
    });
    expect(loop.ok || loop.error.code).toBe('loop');
  });
});

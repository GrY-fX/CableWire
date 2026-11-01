import { describe, expect, it } from 'vitest';
import type { ElementId } from './ids.ts';
import { autoConnections } from './autoconnect.ts';
import { placeElement } from './commands/elements.ts';
import { addWire } from './commands/wires.ts';
import { CONTACT, T1, T2, TERMINAL, must, setup } from './test-utils.ts';

const id = (s: string) => s as never;

/** Contact `a` at (50, 50): T1 on top at (50, 45), T2 at the bottom at (50, 55). */
function project() {
  const ctx = setup();
  must(ctx.store, placeElement, {
    id: id('a'),
    sheetId: ctx.sheet,
    symbolId: CONTACT.id,
    x: 50,
    y: 50,
  });
  return ctx;
}
/** A contact about to be placed at (x, y). */
const ghost = (x: number, y: number, rotation: 0 | 90 | 180 | 270 = 0) => ({
  symbol: CONTACT,
  x,
  y,
  rotation,
  mirrored: false,
});

describe('automatic connections', () => {
  it('joins facing terminals on the same vertical line, however far', () => {
    const ctx = project();
    const found = autoConnections(ctx.store.doc, ctx.sheet, ghost(50, 120));
    expect(found).toEqual([
      {
        from: { element: undefined, terminal: T1 },
        to: { element: 'a', terminal: T2 },
        points: [
          { x: 50, y: 115 },
          { x: 50, y: 55 },
        ],
      },
    ]);
    // Above `a` it is the other way round: its bottom terminal reaches a's top one.
    expect(autoConnections(ctx.store.doc, ctx.sheet, ghost(50, 10))[0]?.to.terminal).toBe(T1);
  });

  it('needs the same line and terminals pointing at each other', () => {
    const ctx = project();
    expect(autoConnections(ctx.store.doc, ctx.sheet, ghost(52.5, 120))).toEqual([]);
    // Turned sideways its terminals point left and right: nothing faces a's.
    expect(autoConnections(ctx.store.doc, ctx.sheet, ghost(50, 120, 90))).toEqual([]);
  });

  it('takes the nearest terminal and stops at anything in between', () => {
    const ctx = project();
    must(ctx.store, placeElement, {
      id: id('b'),
      sheetId: ctx.sheet,
      symbolId: CONTACT.id,
      x: 50,
      y: 80,
    });
    expect(autoConnections(ctx.store.doc, ctx.sheet, ghost(50, 120))[0]?.to.element).toBe('b');
    // A symbol across the line (a terminal turned sideways) blocks it.
    must(ctx.store, placeElement, {
      id: id('x'),
      sheetId: ctx.sheet,
      symbolId: TERMINAL.id,
      x: 50,
      y: 100,
      rotation: 90,
    });
    expect(autoConnections(ctx.store.doc, ctx.sheet, ghost(50, 120))).toEqual([]);
  });

  it('skips terminals already wired and elements excluded', () => {
    const ctx = project();
    must(ctx.store, placeElement, {
      id: id('c'),
      sheetId: ctx.sheet,
      symbolId: CONTACT.id,
      x: 100,
      y: 50,
    });
    must(ctx.store, addWire, {
      from: { element: id('a'), terminal: T2 },
      to: { element: id('c'), terminal: T2 },
      bends: [
        { x: 50, y: 60 },
        { x: 100, y: 60 },
      ],
    });
    expect(autoConnections(ctx.store.doc, ctx.sheet, ghost(50, 120))).toEqual([]);
    const free = autoConnections(
      ctx.store.doc,
      ctx.sheet,
      ghost(50, 10),
      new Set(['a' as ElementId]),
    );
    expect(free).toEqual([]);
  });

  it('ignores the element itself and its own wired terminals when it moves', () => {
    const ctx = project();
    must(ctx.store, placeElement, {
      id: id('b'),
      sheetId: ctx.sheet,
      symbolId: CONTACT.id,
      x: 50,
      y: 90,
    });
    const b = ctx.store.doc.elements['b' as ElementId]!;
    const found = autoConnections(ctx.store.doc, ctx.sheet, { ...b, id: b.id, symbol: CONTACT });
    expect(found.map((c) => [c.from, c.to])).toEqual([
      [
        { element: 'b', terminal: T1 },
        { element: 'a', terminal: T2 },
      ],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { ElementId, JunctionId, SheetId, WireId } from '../ids.ts';
import { CONTACT, T1, T2, must, setup } from '../test-utils.ts';
import { copyFragment, freshIds, isEmptyFragment, pasteFragment } from './clipboard.ts';
import { placeElement } from './elements.ts';
import { addSheet } from './sheets.ts';
import { addWire, splitWire } from './wires.ts';

const id = (s: string) => s as never;

function circuit() {
  const ctx = setup();
  const place = (name: string, x: number) =>
    must(ctx.store, placeElement, {
      id: id(name),
      sheetId: ctx.sheet,
      symbolId: CONTACT.id,
      x,
      y: 0,
      info: { label: name },
    });
  place('a', 0);
  place('b', 20);
  place('c', 40);
  must(ctx.store, addWire, {
    id: id('ab'),
    from: { element: id('a'), terminal: T2 },
    to: { element: id('b'), terminal: T2 },
    bends: [
      { x: 0, y: 10 },
      { x: 20, y: 10 },
    ],
  });
  must(ctx.store, addWire, {
    id: id('bc'),
    from: { element: id('b'), terminal: T1 },
    to: { element: id('c'), terminal: T1 },
  });
  return ctx;
}

describe('clipboard', () => {
  it('copies elements with the wires between them and their symbols', () => {
    const { store } = circuit();
    const f = copyFragment(store.doc, { elements: [id('a'), id('b')] });
    expect(f.elements.map((e) => e.id)).toEqual(['a', 'b']);
    expect(f.wires.map((w) => w.id)).toEqual(['ab']);
    expect(f.symbols.map((s) => s.id)).toEqual([CONTACT.id]);
    expect(isEmptyFragment(copyFragment(store.doc, {}))).toBe(true);
  });

  it('pastes with new ids and an offset, on the same or another sheet', () => {
    const { store, sheet } = circuit();
    const f = copyFragment(store.doc, { elements: [id('a'), id('b')] });
    const ids = freshIds(f);
    must(store, pasteFragment, { fragment: f, sheetId: sheet, dx: 5, dy: 5, ids });
    const a2 = store.doc.elements[ids.a as ElementId]!;
    expect(a2).toMatchObject({ x: 5, y: 5, info: { label: 'a' } });
    const w2 = store.doc.wires[ids.ab as WireId]!;
    expect(w2.from).toEqual({ element: ids.a, terminal: T2 });
    expect(w2.bends).toEqual([
      { x: 5, y: 15 },
      { x: 25, y: 15 },
    ]);
    expect(Object.keys(store.doc.elements)).toHaveLength(5);

    must(store, addSheet, { id: 's2' as SheetId });
    const ids2 = freshIds(f);
    must(store, pasteFragment, { fragment: f, sheetId: 's2' as SheetId, dx: 0, dy: 0, ids: ids2 });
    expect(store.doc.elements[ids2.b as ElementId]!.sheetId).toBe('s2');

    store.undo();
    expect(store.doc.elements[ids2.b as ElementId]).toBeUndefined();
  });

  it('copies junctions and imports missing symbols', () => {
    const { store, sheet } = circuit();
    must(store, splitWire, { id: id('bc'), at: { x: 30, y: -5 }, junctionId: 'j' as JunctionId });
    const f = copyFragment(store.doc, { elements: [id('b')], junctions: ['j' as JunctionId] });
    expect(f.wires.map((w) => w.id)).toEqual(['bc']);

    // Paste into a project that does not have the symbol yet.
    const other = setup();
    const ids = freshIds(f);
    const result = other.store.run(pasteFragment, {
      fragment: { ...f, symbols: f.symbols },
      sheetId: other.sheet,
      dx: 0,
      dy: 0,
      ids,
    });
    expect(result.ok).toBe(true);
    expect(other.store.doc.junctions[ids.j as JunctionId]).toBeDefined();
    expect(sheet).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { ElementId, SheetId } from './ids.ts';
import { copyFragment, freshIds, pasteFragment } from './commands/clipboard.ts';
import { placeElement, setElementInfo } from './commands/elements.ts';
import { renumberLabels } from './commands/numbering.ts';
import { addSheet } from './commands/sheets.ts';
import { importSymbol } from './commands/symbols.ts';
import { must, setup, twoTerminalSymbol } from './test-utils.ts';

const id = (s: string) => s as never;
const COIL = twoTerminalSymbol('coil', { kind: 'master', defaultInfo: { label: '{foglio}K{n}' } });
const RELAY = twoTerminalSymbol('relay', {
  kind: 'master',
  defaultInfo: { label: '{foglio}K{n}' },
});
const LAMP = twoTerminalSymbol('lamp', {
  defaultInfo: { label: 'H{n:2}', location: '+Q{foglio}' },
});

function project() {
  const ctx = setup();
  for (const symbol of [COIL, RELAY, LAMP]) must(ctx.store, importSymbol, { symbol });
  must(ctx.store, addSheet, { id: id('s2') });
  must(ctx.store, addSheet, { id: id('s5') });
  return ctx;
}
const place = (
  ctx: ReturnType<typeof project>,
  name: string,
  symbolId: string,
  sheetId: SheetId,
  x: number,
  y = 50,
) => must(ctx.store, placeElement, { id: id(name), sheetId, symbolId: id(symbolId), x, y });
const label = (ctx: ReturnType<typeof project>, name: string) =>
  ctx.store.doc.elements[name as ElementId]!.info['label'];

describe('automatic labels', () => {
  it('numbers per sheet: 1K1, 1K2… on sheet 1, 3K1 on sheet 3', () => {
    const ctx = project();
    place(ctx, 'a', COIL.id, ctx.sheet, 50);
    place(ctx, 'b', COIL.id, ctx.sheet, 100);
    place(ctx, 'c', COIL.id, 's5' as SheetId, 50);
    expect([label(ctx, 'a'), label(ctx, 'b'), label(ctx, 'c')]).toEqual(['1K1', '1K2', '3K1']);
  });

  it('shares the counter between symbols with the same pattern and fills gaps', () => {
    const ctx = project();
    place(ctx, 'a', COIL.id, ctx.sheet, 50);
    place(ctx, 'b', RELAY.id, ctx.sheet, 100);
    expect(label(ctx, 'b')).toBe('1K2');
    must(ctx.store, setElementInfo, { id: id('a'), set: { label: 'KM_POMPA' } });
    place(ctx, 'c', COIL.id, ctx.sheet, 150);
    expect(label(ctx, 'c')).toBe('1K1');
  });

  it('supports digits and fills {foglio} in other fields', () => {
    const ctx = project();
    place(ctx, 'h', LAMP.id, 's2' as SheetId, 50);
    expect(ctx.store.doc.elements['h' as ElementId]!.info).toMatchObject({
      label: 'H01',
      location: '+Q2',
    });
  });

  it('pasted copies get new numbers on the sheet they land on', () => {
    const ctx = project();
    place(ctx, 'a', COIL.id, ctx.sheet, 50);
    place(ctx, 'b', COIL.id, ctx.sheet, 100);
    const fragment = copyFragment(ctx.store.doc, { elements: [id('a'), id('b')] });
    const ids = freshIds(fragment);
    must(ctx.store, pasteFragment, { fragment, sheetId: ctx.sheet, dx: 0, dy: 60, ids });
    const pasted = [ids['a'], ids['b']].map((i) => ctx.store.doc.elements[i as ElementId]!);
    expect(pasted.map((e) => e.info['label'])).toEqual(['1K3', '1K4']);
    const ids2 = freshIds(fragment);
    must(ctx.store, pasteFragment, { fragment, sheetId: 's2' as SheetId, dx: 0, dy: 0, ids: ids2 });
    expect(ctx.store.doc.elements[ids2['a'] as ElementId]!.info['label']).toBe('2K1');
  });

  it('renumbers in reading order, keeping labels written by hand', () => {
    const ctx = project();
    place(ctx, 'a', COIL.id, ctx.sheet, 300);
    place(ctx, 'b', COIL.id, ctx.sheet, 50, 100);
    place(ctx, 'c', COIL.id, ctx.sheet, 50, 50);
    place(ctx, 'd', COIL.id, ctx.sheet, 200);
    must(ctx.store, setElementInfo, { id: id('d'), set: { label: 'KM_POMPA' } });
    must(ctx.store, renumberLabels, { sheetId: ctx.sheet });
    // Column 1 top to bottom (c, b), then a further right; d is kept.
    expect(['c', 'b', 'a', 'd'].map((n) => label(ctx, n))).toEqual([
      '1K1',
      '1K2',
      '1K3',
      'KM_POMPA',
    ]);
  });
});

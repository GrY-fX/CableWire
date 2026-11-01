import { describe, expect, it } from 'vitest';
import type { TextId } from './ids.ts';
import { copyFragment, freshIds, pasteFragment } from './commands/clipboard.ts';
import { moveItems } from './commands/elements.ts';
import { updateProjectMeta } from './commands/project.ts';
import { removeItems } from './commands/remove.ts';
import { addSheet, removeSheet } from './commands/sheets.ts';
import { addText, rotateTexts, updateText } from './commands/texts.ts';
import { must, setup } from './test-utils.ts';
import { textLayout } from './texts.ts';

const id = (s: string) => s as never;
const text = (ctx: ReturnType<typeof setup>, name: string) => ctx.store.doc.texts[name as TextId]!;

describe('free texts', () => {
  it('are placed, edited, moved and turned', () => {
    const ctx = setup();
    must(ctx.store, addText, { id: id('t'), sheetId: ctx.sheet, x: 50, y: 40 });
    expect(text(ctx, 't')).toMatchObject({ text: 'Testo', size: 3.5, x: 50, y: 40 });
    must(ctx.store, updateText, { id: id('t'), set: { text: 'Nota', size: 5, anchor: 'middle' } });
    must(ctx.store, moveItems, { texts: [id('t')], dx: 10, dy: -5 });
    must(ctx.store, rotateTexts, { ids: [id('t')], by: 90 });
    expect(text(ctx, 't')).toMatchObject({ text: 'Nota', size: 5, x: 60, y: 35, rotation: 90 });
    must(ctx.store, rotateTexts, { ids: [id('t')], by: 270 });
    expect(text(ctx, 't').rotation).toBeUndefined();
  });

  it('span lines and fill the title block placeholders', () => {
    const ctx = setup();
    must(ctx.store, updateProjectMeta, { set: { title: 'Quadro pompa' } });
    must(ctx.store, addText, {
      id: id('t'),
      sheetId: ctx.sheet,
      x: 50,
      y: 40,
      text: 'Progetto {titolo}\nFoglio {foglio} di {fogli}\n{sconosciuto}',
      size: 2.5,
    });
    const layout = textLayout(ctx.store.doc, text(ctx, 't'));
    expect(layout.lines).toEqual([
      { x: 50, y: 40, text: 'Progetto Quadro pompa' },
      { x: 50, y: 43.5, text: 'Foglio 1 di 1' },
      { x: 50, y: 47, text: '{sconosciuto}' },
    ]);
    // 21 characters × 2.5 × 0.6 wide, from half a line above the first to below the last.
    expect(layout.bounds).toEqual({ minX: 50, maxX: 50 + 31.5, minY: 38.75, maxY: 48.25 });
    // Vertical: the next lines go to the left.
    must(ctx.store, rotateTexts, { ids: [id('t')], by: 90 });
    const vertical = textLayout(ctx.store.doc, text(ctx, 't'));
    expect(vertical.angle).toBe(90);
    expect(vertical.lines.map((l) => l.x)).toEqual([50, 46.5, 43]);
  });

  it('are copied, pasted and removed, also with their sheet', () => {
    const ctx = setup();
    must(ctx.store, addSheet, { id: id('s2') });
    must(ctx.store, addText, { id: id('t'), sheetId: ctx.sheet, x: 50, y: 40, text: 'A' });
    const fragment = copyFragment(ctx.store.doc, { texts: [id('t')] });
    const ids = freshIds(fragment);
    must(ctx.store, pasteFragment, { fragment, sheetId: id('s2'), dx: 0, dy: 0, ids });
    expect(text(ctx, ids['t']!)).toMatchObject({ text: 'A', sheetId: 's2', x: 50 });
    must(ctx.store, removeItems, { texts: [id('t')] });
    expect(ctx.store.doc.texts['t' as TextId]).toBeUndefined();
    must(ctx.store, removeSheet, { id: id('s2') });
    expect(ctx.store.doc.texts).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import type { SymbolId } from './ids.ts';
import type { SymbolDef } from './model.ts';
import { updateProjectMeta } from './commands/project.ts';
import { A3, must, setup } from './test-utils.ts';
import {
  getTitleBlock,
  setProjectField,
  setTitleBlock,
  SIMPLE_TITLE_BLOCK,
  titleBlockPlacement,
  titleBlockValues,
} from './titleblock.ts';

const BAND: SymbolDef = {
  ...SIMPLE_TITLE_BLOCK,
  id: 'band' as SymbolId,
  titleBlock: { anchor: 'band', width: 200, height: 10 },
};

describe('title blocks', () => {
  it('use the simple one until the project chooses another', () => {
    const ctx = setup();
    expect(getTitleBlock(ctx.store.doc)).toBe(SIMPLE_TITLE_BLOCK);
    must(ctx.store, setTitleBlock, { symbol: BAND });
    expect(getTitleBlock(ctx.store.doc).id).toBe('band');
    expect(ctx.store.doc.symbols['band' as SymbolId]).toEqual(BAND);
    expect(ctx.store.run(setTitleBlock, { symbol: { ...BAND, kind: 'simple' } }).ok).toBe(false);
  });

  it('sit in the corner, or span the frame as a band', () => {
    const sheet = { id: 's', title: '1', ...A3 } as never;
    // A3 landscape: frame from (10, 10), 400 × 277.
    expect(titleBlockPlacement(sheet, SIMPLE_TITLE_BLOCK)).toEqual({
      x: 290,
      y: 267,
      scaleX: 1,
      width: 120,
      height: 20,
    });
    expect(titleBlockPlacement(sheet, BAND)).toEqual({
      x: 10,
      y: 277,
      scaleX: 2,
      width: 400,
      height: 10,
    });
  });

  it('fill placeholders from the project, its fields and the sheet', () => {
    const ctx = setup();
    must(ctx.store, updateProjectMeta, { set: { title: 'Quadro pompa', author: 'G.' } });
    must(ctx.store, setProjectField, { key: 'cliente', value: 'ACME' });
    must(ctx.store, setProjectField, { key: 'quadro', value: 'QE1' });
    const doc = ctx.store.doc;
    const values = titleBlockValues(doc, doc.sheets[ctx.sheet]!);
    expect(values).toMatchObject({
      titolo: 'Quadro pompa',
      autore: 'G.',
      cliente: 'ACME',
      quadro: 'QE1',
      foglio: '1',
      fogli: '1',
      data: '2026-01-01',
    });
    // Emptying a field removes it; names are words only.
    must(ctx.store, setProjectField, { key: 'quadro', value: '' });
    expect(ctx.store.doc.meta.fields).toEqual({ cliente: 'ACME' });
    expect(ctx.store.run(setProjectField, { key: 'data rev', value: 'x' }).ok).toBe(false);
  });
});

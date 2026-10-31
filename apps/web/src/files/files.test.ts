// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addSheet, createEmptyProject, createStore, updateSheet } from '@cablewire/core';
import type { SheetId } from '@cablewire/core';
import { pngSize, safeFileName } from './export.ts';
import { buildPrintDocument, printRoot } from './print.ts';
import {
  addRecent,
  getCurrentFile,
  listRecent,
  MAX_RECENT,
  removeRecent,
  setCurrentFile,
} from './recent.ts';
import type { FileHandle } from './fileAccess.ts';

describe('file names', () => {
  it('builds safe names from titles', () => {
    expect(safeFileName('Quadro pompa – Più', '.cwp')).toBe('Quadro-pompa-Piu.cwp');
    expect(safeFileName('   ', '.cwp')).toBe('progetto.cwp');
    expect(safeFileName('Foglio 1/2', '.png', 'foglio')).toBe('Foglio-1-2.png');
  });
});

describe('export sizes', () => {
  it('computes PNG pixels from the sheet size and dpi', () => {
    const doc = createEmptyProject('t');
    const sheet = doc.sheets[doc.sheetOrder[0]!]!; // A4 landscape, the default
    expect(pngSize(sheet, 300)).toEqual({ width: 3508, height: 2480 });
    expect(pngSize({ ...sheet, size: 'A4', orientation: 'portrait' }, 150)).toEqual({
      width: 1240,
      height: 1754,
    });
  });
});

describe('print document', () => {
  it('makes one page per sheet with its own size and orientation', () => {
    const store = createStore(createEmptyProject('t'));
    store.run(addSheet, { id: 's2' as SheetId });
    store.run(updateSheet, { id: 's2' as SheetId, set: { size: 'A3', orientation: 'portrait' } });
    const { css, pages } = buildPrintDocument(store.doc, store.doc.sheetOrder, '/*font*/');
    expect(css).toContain('@page cw-297x210 { size: 297mm 210mm; margin: 0; }');
    expect(css).toContain('@page cw-297x420 { size: 297mm 420mm; margin: 0; }');
    expect(pages.map(({ name, width, height }) => ({ name, width, height }))).toEqual([
      { name: 'cw-297x210', width: 297, height: 210 },
      { name: 'cw-297x420', width: 297, height: 420 },
    ]);
    expect(pages[0]!.svg).not.toContain('terminal-mark');
    expect(pages[0]!.svg).toContain('/*font*/');

    const root = printRoot(pages);
    const sections = [...root.querySelectorAll('.cw-print-page')];
    expect(sections).toHaveLength(2);
    expect((sections[1] as HTMLElement).style.width).toBe('297mm');
    expect(sections[0]!.querySelector('svg')?.getAttribute('width')).toBe('297mm');
  });
});

describe('recent files', () => {
  it('keeps the most recent files first, up to the limit', async () => {
    const db = `recent-${Math.random()}`;
    const handle = {} as FileHandle;
    for (let i = 0; i < MAX_RECENT + 2; i++) {
      await addRecent(
        { name: `f${i}.cwp`, handle },
        db,
        `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      );
    }
    const list = await listRecent(db);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]!.name).toBe(`f${MAX_RECENT + 1}.cwp`);
    await removeRecent(list[0]!.name, db);
    expect((await listRecent(db))[0]!.name).toBe(`f${MAX_RECENT}.cwp`);
  });
});

describe('current file', () => {
  it('is remembered across sessions and can be forgotten', async () => {
    const db = `current-${Math.random()}`;
    expect(await getCurrentFile(db)).toBeUndefined();
    await setCurrentFile({ name: 'a.cwp', savedText: '{}' }, db);
    expect(await getCurrentFile(db)).toEqual({ name: 'a.cwp', savedText: '{}' });
    await setCurrentFile(undefined, db);
    expect(await getCurrentFile(db)).toBeUndefined();
  });
});

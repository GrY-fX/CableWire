import { describe, expect, it } from 'vitest';
import type { ElementId, SheetId } from './ids.ts';
import { copyFragment, freshIds, pasteFragment } from './commands/clipboard.ts';
import { placeElement } from './commands/elements.ts';
import { updateNumbering } from './commands/numbering.ts';
import { updateSettings } from './commands/project.ts';
import { addSheet, moveSheet, removeSheet } from './commands/sheets.ts';
import {
  addStrip,
  removeStrip,
  renumberTerminals,
  setTerminalNo,
  setTerminalStrip,
  updateStrip,
} from './commands/strips.ts';
import { addWire } from './commands/wires.ts';
import { sourceValues } from './autonumber/sources.ts';
import { getStrips, stripName, terminalLabel } from './strips.ts';
import { CONTACT, T1, TERMINAL, must, setup } from './test-utils.ts';

const id = (s: string) => s as never;

/** Sheets 1, 2, 3; strips a (sheet 1), b (sheet 1), c (sheet 3), pump (custom «XPOMPA»). */
function project() {
  const ctx = setup();
  const store = ctx.store;
  must(store, addSheet, { id: id('s2') });
  must(store, addSheet, { id: id('s3') });
  must(store, addStrip, { id: 'a', mode: 'sheet', sheetId: ctx.sheet });
  must(store, addStrip, { id: 'b', mode: 'sheet', sheetId: ctx.sheet });
  must(store, addStrip, { id: 'c', mode: 'sheet', sheetId: id('s3') });
  must(store, addStrip, { id: 'pump', mode: 'custom', name: 'XPOMPA' });
  return { ...ctx, s2: 's2' as SheetId, s3: 's3' as SheetId };
}
const strip = (ctx: ReturnType<typeof project>, sid: string) =>
  getStrips(ctx.store.doc).find((s) => s.id === sid)!;
const placeTerminal = (
  ctx: ReturnType<typeof project>,
  name: string,
  sheetId: SheetId,
  x: number,
  y: number,
  s?: string,
) =>
  must(ctx.store, placeElement, {
    id: id(name),
    sheetId,
    symbolId: TERMINAL.id,
    x,
    y,
    ...(s ? { strip: s } : {}),
  });
const el = (ctx: ReturnType<typeof project>, name: string) =>
  ctx.store.doc.elements[name as ElementId]!;

describe('terminal strips', () => {
  it('names sheet strips from the pattern and keeps custom names', () => {
    const ctx = project();
    const doc = ctx.store.doc;
    expect(['a', 'b', 'c', 'pump'].map((s) => stripName(doc, strip(ctx, s)))).toEqual([
      '1X1',
      '1X2',
      '3X1',
      'XPOMPA',
    ]);
    must(ctx.store, updateSettings, { set: { stripPattern: '-X{foglio}{n:2}' } });
    expect(stripName(ctx.store.doc, strip(ctx, 'c'))).toBe('-X301');
    // Moving sheets renames their strips.
    must(ctx.store, moveSheet, { id: ctx.s3, index: 0 });
    expect(stripName(ctx.store.doc, strip(ctx, 'c'))).toBe('-X101');
  });

  it('numbers terminals per strip on every sheet, labelled strip:number', () => {
    const ctx = project();
    placeTerminal(ctx, 't1', ctx.sheet, 50, 50, 'pump');
    placeTerminal(ctx, 't2', ctx.s2, 50, 50, 'pump');
    placeTerminal(ctx, 't3', ctx.s2, 80, 50, 'a');
    expect(['t1', 't2', 't3'].map((t) => terminalLabel(ctx.store.doc, el(ctx, t)))).toEqual([
      'XPOMPA:1',
      'XPOMPA:2',
      '1X1:1',
    ]);
    // A strip renamed renames its terminals.
    must(ctx.store, updateStrip, { id: 'pump', name: 'X10' });
    expect(terminalLabel(ctx.store.doc, el(ctx, 't2'))).toBe('X10:2');
  });

  it('takes the first free number; numbers written as text are allowed', () => {
    const ctx = project();
    placeTerminal(ctx, 't1', ctx.sheet, 50, 50, 'a');
    placeTerminal(ctx, 't2', ctx.sheet, 80, 50, 'a');
    must(ctx.store, setTerminalNo, { id: id('t1'), no: 'PE' });
    placeTerminal(ctx, 't3', ctx.sheet, 110, 50, 'a');
    expect(el(ctx, 't3').terminalNo).toBe('1');
  });

  it('renumbers in reading order, keeping text numbers', () => {
    const ctx = project();
    placeTerminal(ctx, 'right', ctx.sheet, 300, 50, 'a');
    placeTerminal(ctx, 'low', ctx.sheet, 50, 150, 'a');
    placeTerminal(ctx, 'high', ctx.sheet, 50, 60, 'a');
    placeTerminal(ctx, 'pe', ctx.sheet, 200, 50, 'a');
    must(ctx.store, setTerminalNo, { id: id('pe'), no: 'PE' });
    must(ctx.store, renumberTerminals, { strip: 'a' });
    expect(['high', 'low', 'right', 'pe'].map((t) => el(ctx, t).terminalNo)).toEqual([
      '1',
      '2',
      '3',
      'PE',
    ]);
  });

  it('moves terminals between strips and out of them, keeping their label', () => {
    const ctx = project();
    placeTerminal(ctx, 't1', ctx.sheet, 50, 50, 'a');
    must(ctx.store, setTerminalStrip, { id: id('t1'), strip: 'pump' });
    expect(terminalLabel(ctx.store.doc, el(ctx, 't1'))).toBe('XPOMPA:1');
    must(ctx.store, removeStrip, { id: 'pump' });
    expect(el(ctx, 't1').strip).toBeUndefined();
    expect(terminalLabel(ctx.store.doc, el(ctx, 't1'))).toBe('XPOMPA:1');
  });

  it('refuses a custom name already used', () => {
    const ctx = project();
    expect(ctx.store.run(addStrip, { mode: 'custom', name: '1X2' }).ok).toBe(false);
    expect(ctx.store.run(updateStrip, { id: 'pump', name: '3X1' }).ok).toBe(false);
  });

  it('a sheet strip turning custom keeps its name', () => {
    const ctx = project();
    must(ctx.store, updateStrip, { id: 'b', mode: 'custom' });
    expect(strip(ctx, 'b')).toEqual({ id: 'b', mode: 'custom', name: '1X2' });
  });

  it('removing a sheet keeps its strips used elsewhere, with their name', () => {
    const ctx = project();
    placeTerminal(ctx, 't1', ctx.s3, 50, 50, 'c');
    placeTerminal(ctx, 't2', ctx.s2, 50, 50, 'c');
    must(ctx.store, removeSheet, { id: ctx.s3 });
    expect(strip(ctx, 'c')).toEqual({ id: 'c', mode: 'custom', name: '3X1' });
    expect(terminalLabel(ctx.store.doc, el(ctx, 't2'))).toBe('3X1:2');
  });

  it('pasted terminals stay in their strip with new numbers', () => {
    const ctx = project();
    placeTerminal(ctx, 't1', ctx.sheet, 50, 50, 'a');
    const fragment = copyFragment(ctx.store.doc, { elements: [id('t1')] });
    const ids = freshIds(fragment);
    must(ctx.store, pasteFragment, { fragment, sheetId: ctx.s2, dx: 0, dy: 0, ids });
    const copy = ctx.store.doc.elements[ids['t1'] as ElementId]!;
    expect([copy.strip, copy.terminalNo]).toEqual(['a', '2']);
  });

  it('wire numbers from terminals use strip:number', () => {
    const ctx = project();
    must(ctx.store, updateNumbering, { set: { sources: ['terminal'] } });
    placeTerminal(ctx, 't1', ctx.sheet, 50, 50, 'pump');
    placeTerminal(ctx, 't2', ctx.sheet, 80, 50, 'pump');
    must(ctx.store, placeElement, {
      id: id('k'),
      sheetId: ctx.sheet,
      symbolId: CONTACT.id,
      x: 80,
      y: 100,
    });
    must(ctx.store, addWire, {
      id: id('w'),
      from: { element: id('t2'), terminal: T1 },
      to: { element: id('k'), terminal: T1 },
    });
    expect(sourceValues(ctx.store.doc, id('w'))?.values[0]).toMatchObject({
      value: '2',
      from: 'XPOMPA:2',
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { ElementId, SheetId } from './ids.ts';
import { copyFragment, freshIds, pasteFragment } from './commands/clipboard.ts';
import { placeElement, setElementInfo } from './commands/elements.ts';
import { linkSlave, setSlaveLabel, unlinkSlave } from './commands/masters.ts';
import { updateSettings } from './commands/project.ts';
import { removeItems } from './commands/remove.ts';
import { addSheet } from './commands/sheets.ts';
import { importSymbol } from './commands/symbols.ts';
import {
  masterOf,
  masterRef,
  mastersWithLabel,
  slaveLabel,
  slavesOf,
  unlinkedSlaves,
} from './masters.ts';
import { A3, must, setup, twoTerminalSymbol } from './test-utils.ts';

const id = (s: string) => s as never;
const COIL = twoTerminalSymbol('coil', { kind: 'master', defaultInfo: { label: 'K' } });
const NO = twoTerminalSymbol('no', { kind: 'slave', contact: 'no', defaultInfo: { label: 'K' } });

/** Sheet 1: coils km1 (column 3) and km2. Sheet 2: contacts c1, c2 (unlinked). */
function project() {
  const ctx = setup();
  const store = ctx.store;
  must(store, importSymbol, { symbol: COIL });
  must(store, importSymbol, { symbol: NO });
  must(store, addSheet, { id: id('s2'), format: A3 });
  const s2 = 's2' as SheetId;
  const place = (name: string, symbolId: string, sheetId: SheetId, x: number, label: string) =>
    must(store, placeElement, {
      id: id(name),
      sheetId,
      symbolId: id(symbolId),
      x,
      y: 50,
      info: { label },
    });
  place('km1', COIL.id, ctx.sheet, 100, 'KM1');
  place('km2', COIL.id, ctx.sheet, 200, 'KM2');
  place('c1', NO.id, s2, 60, 'K');
  place('c2', NO.id, s2, 120, 'K');
  return { ...ctx, s2 };
}
const el = (ctx: ReturnType<typeof project>, name: string) =>
  ctx.store.doc.elements[name as ElementId]!;

describe('coils and contacts', () => {
  it('links a contact to a coil: it takes the label and shows where the coil is', () => {
    const ctx = project();
    must(ctx.store, linkSlave, { slave: id('c1'), master: id('km1') });
    const doc = ctx.store.doc;
    expect(masterOf(doc, el(ctx, 'c1'))?.id).toBe('km1');
    expect(el(ctx, 'c1').info['label']).toBe('KM1');
    expect(masterRef(doc, el(ctx, 'c1'))).toBe('/1.3');
    expect(masterRef(doc, el(ctx, 'c2'))).toBe('');
    must(ctx.store, updateSettings, { set: { masterRefPattern: '{titolo}:{foglio}{riga}' } });
    expect(masterRef(ctx.store.doc, el(ctx, 'c1'))).toBe('1:1A');
  });

  it('a coil has as many contacts as needed, in reading order', () => {
    const ctx = project();
    must(ctx.store, linkSlave, { slave: id('c2'), master: id('km1') });
    must(ctx.store, linkSlave, { slave: id('c1'), master: id('km1') });
    expect(slavesOf(ctx.store.doc, el(ctx, 'km1')).map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(unlinkedSlaves(ctx.store.doc)).toEqual([]);
  });

  it('the contact follows the label of its coil', () => {
    const ctx = project();
    must(ctx.store, linkSlave, { slave: id('c1'), master: id('km1') });
    must(ctx.store, setElementInfo, { id: id('km1'), set: { label: 'KA1' } });
    expect(slaveLabel(ctx.store.doc, el(ctx, 'c1'))).toBe('KA1');
  });

  it('typing the label of a coil links the contact; another label unlinks it', () => {
    const ctx = project();
    must(ctx.store, setSlaveLabel, { slave: id('c1'), label: ' KM2 ' });
    expect(masterOf(ctx.store.doc, el(ctx, 'c1'))?.id).toBe('km2');
    must(ctx.store, setSlaveLabel, { slave: id('c1'), label: 'KM9' });
    expect(el(ctx, 'c1').link).toBeUndefined();
    expect(slaveLabel(ctx.store.doc, el(ctx, 'c1'))).toBe('KM9');
  });

  it('does not link when several coils have the label', () => {
    const ctx = project();
    must(ctx.store, setElementInfo, { id: id('km2'), set: { label: 'KM1' } });
    expect(mastersWithLabel(ctx.store.doc, 'KM1')).toHaveLength(2);
    must(ctx.store, setSlaveLabel, { slave: id('c1'), label: 'KM1' });
    expect(el(ctx, 'c1').link).toBeUndefined();
  });

  it('unlinking keeps the label; removing the coil unlinks its contacts', () => {
    const ctx = project();
    must(ctx.store, linkSlave, { slave: id('c1'), master: id('km1') });
    must(ctx.store, linkSlave, { slave: id('c2'), master: id('km1') });
    must(ctx.store, unlinkSlave, { slave: id('c1') });
    expect(el(ctx, 'c1')).toMatchObject({ info: { label: 'KM1' } });
    expect(el(ctx, 'c1').link).toBeUndefined();
    must(ctx.store, removeItems, { elements: [id('km1')] });
    expect(el(ctx, 'c2').link).toBeUndefined();
  });

  it('refuses links that are not contact → coil', () => {
    const ctx = project();
    expect(ctx.store.run(linkSlave, { slave: id('km2'), master: id('km1') }).ok).toBe(false);
    expect(ctx.store.run(linkSlave, { slave: id('c1'), master: id('c2') }).ok).toBe(false);
  });

  it('a pasted contact keeps its coil; coil and contacts pasted together link to each other', () => {
    const ctx = project();
    must(ctx.store, linkSlave, { slave: id('c1'), master: id('km1') });
    const alone = copyFragment(ctx.store.doc, { elements: [id('c1')] });
    const ids1 = freshIds(alone);
    must(ctx.store, pasteFragment, { fragment: alone, sheetId: ctx.s2, dx: 0, dy: 40, ids: ids1 });
    const copy = ctx.store.doc.elements[ids1['c1'] as ElementId]!;
    expect(copy.link).toBe('km1');

    const both = copyFragment(ctx.store.doc, { elements: [id('km1'), id('c1')] });
    const ids2 = freshIds(both);
    must(ctx.store, pasteFragment, { fragment: both, sheetId: ctx.s2, dx: 0, dy: 80, ids: ids2 });
    expect(ctx.store.doc.elements[ids2['c1'] as ElementId]!.link).toBe(ids2['km1']);
  });
});

import { describe, expect, it } from 'vitest';
import type { ElementId, SheetId, SymbolId, WireId } from './ids.ts';
import type { SymbolDef } from './model.ts';
import { copyFragment, freshIds, pasteFragment } from './commands/clipboard.ts';
import { placeElement } from './commands/elements.ts';
import { updateSettings } from './commands/project.ts';
import { linkReports, unlinkReport } from './commands/references.ts';
import { removeItems } from './commands/remove.ts';
import { addSheet } from './commands/sheets.ts';
import { importSymbol } from './commands/symbols.ts';
import { addWire } from './commands/wires.ts';
import { getPotentials, terminalKey } from './potentials.ts';
import {
  availablePartners,
  linkedReport,
  referenceTarget,
  reportName,
  unlinkedReports,
} from './references.ts';
import { CONTACT, T1, T2, must, setup } from './test-utils.ts';

const id = (s: string) => s as never;

const reportSymbol = (report: 'in' | 'out'): SymbolDef => ({
  id: `report-${report}` as SymbolId,
  name: report,
  category: 'test',
  kind: 'report',
  report,
  graphics: [],
  terminals: [{ id: T1, name: '1', x: 0, y: 0, dir: report === 'out' ? 'w' : 'e' }],
  bridges: [],
  defaultInfo: { label: '' },
  version: 1,
});
const OUT = reportSymbol('out');
const IN = reportSymbol('in');

/** Sheet 1: contact a wired to outgoing reference o1 (wire "ao"). Sheet 2: incoming i1, i2. */
function project() {
  const ctx = setup();
  const store = ctx.store;
  must(store, importSymbol, { symbol: OUT });
  must(store, importSymbol, { symbol: IN });
  must(store, addSheet, { id: id('s2'), title: 'Motori' });
  const s2 = 's2' as SheetId;
  const place = (name: string, symbolId: string, sheetId: SheetId, x: number, y = 50) =>
    must(store, placeElement, { id: id(name), sheetId, symbolId: id(symbolId), x, y });
  place('a', CONTACT.id, ctx.sheet, 100);
  place('o1', OUT.id, ctx.sheet, 380, 60);
  place('i1', IN.id, s2, 40, 60);
  place('i2', IN.id, s2, 40, 120);
  must(store, addWire, {
    id: id('ao'),
    from: { element: id('a'), terminal: T2 },
    to: { element: id('o1'), terminal: T1 },
    props: { number: '12' },
  });
  return { ...ctx, s2 };
}
const el = (ctx: ReturnType<typeof project>, name: string) =>
  ctx.store.doc.elements[name as ElementId]!;

describe('sheet references', () => {
  it('gives each new reference its own id, used as name until its wire is numbered', () => {
    const ctx = project();
    expect(el(ctx, 'o1').info['ref_id']).toBe('N/C_1');
    expect(el(ctx, 'i1').info['ref_id']).toBe('N/C_2');
    expect(reportName(ctx.store.doc, el(ctx, 'o1'))).toBe('12');
    expect(reportName(ctx.store.doc, el(ctx, 'i1'))).toBe('N/C_2');
  });

  it('offers unlinked references of the opposite direction, in reading order', () => {
    const ctx = project();
    const doc = ctx.store.doc;
    expect(availablePartners(doc, el(ctx, 'o1')).map((e) => e.id)).toEqual(['i1', 'i2']);
    expect(availablePartners(doc, el(ctx, 'i1')).map((e) => e.id)).toEqual(['o1']);
    must(ctx.store, linkReports, { a: id('o1'), b: id('i1') });
    expect(availablePartners(ctx.store.doc, el(ctx, 'i2'))).toEqual([]);
  });

  it('refuses to link two references of the same direction', () => {
    const ctx = project();
    const result = ctx.store.run(linkReports, { a: id('i1'), b: id('i2') });
    expect(result.ok).toBe(false);
  });

  it('joins the potentials: the incoming side takes the wire number', () => {
    const ctx = project();
    must(ctx.store, placeElement, {
      id: id('b'),
      sheetId: ctx.s2,
      symbolId: CONTACT.id,
      x: 100,
      y: 60,
    });
    must(ctx.store, addWire, {
      id: id('ib'),
      from: { element: id('i1'), terminal: T1 },
      to: { element: id('b'), terminal: T1 },
    });
    must(ctx.store, linkReports, { a: id('o1'), b: id('i1') });
    const doc = ctx.store.doc;
    const potentials = getPotentials(doc);
    expect(potentials.potentialOf(terminalKey(id('b'), T1))).toBe(
      potentials.potentialOf(terminalKey(id('a'), T2)),
    );
    expect(doc.wires['ib' as WireId]!.props.number).toBe('12');
    expect(reportName(doc, el(ctx, 'i1'))).toBe('12');
    // One undo entry: link and inherited number go back together.
    ctx.store.undo();
    expect(ctx.store.doc.wires['ib' as WireId]!.props.number).toBeUndefined();
    expect(el(ctx, 'o1').link).toBeUndefined();
  });

  it('shows where the wire continues, with a customisable pattern', () => {
    const ctx = project();
    expect(referenceTarget(ctx.store.doc, el(ctx, 'o1'))).toBe('→ ?.?');
    must(ctx.store, linkReports, { a: id('o1'), b: id('i1') });
    expect(referenceTarget(ctx.store.doc, el(ctx, 'o1'))).toBe('→ 2.1');
    expect(referenceTarget(ctx.store.doc, el(ctx, 'i1'))).toBe('→ 1.10');
    must(ctx.store, updateSettings, { set: { referencePattern: '{titolo} /{foglio}-{riga}{x}' } });
    expect(referenceTarget(ctx.store.doc, el(ctx, 'o1'))).toBe('Motori /2-A{x}');
  });

  it('relinking replaces the old partner, unlinking frees both', () => {
    const ctx = project();
    must(ctx.store, linkReports, { a: id('o1'), b: id('i1') });
    must(ctx.store, linkReports, { a: id('i2'), b: id('o1') });
    expect(el(ctx, 'i1').link).toBeUndefined();
    expect(linkedReport(ctx.store.doc, el(ctx, 'o1'))?.id).toBe('i2');
    must(ctx.store, unlinkReport, { id: id('i2') });
    expect(el(ctx, 'o1').link).toBeUndefined();
    expect(el(ctx, 'i2').link).toBeUndefined();
    expect(unlinkedReports(ctx.store.doc).map((e) => e.id)).toEqual(['o1', 'i1', 'i2']);
  });

  it('removing a reference unlinks its partner', () => {
    const ctx = project();
    must(ctx.store, linkReports, { a: id('o1'), b: id('i1') });
    must(ctx.store, removeItems, { elements: [id('i1')] });
    expect(el(ctx, 'o1').link).toBeUndefined();
  });

  it('pasted references get new ids; a pasted pair stays linked', () => {
    const ctx = project();
    must(ctx.store, linkReports, { a: id('i1'), b: id('o1') });
    const fragment = copyFragment(ctx.store.doc, { elements: [id('o1'), id('i1'), id('i2')] });
    const ids = freshIds(fragment);
    must(ctx.store, pasteFragment, { fragment, sheetId: ctx.s2, dx: 0, dy: 100, ids });
    const pasted = (name: string) => ctx.store.doc.elements[ids[name] as ElementId]!;
    expect(pasted('o1').info['ref_id']).toBe('N/C_4');
    expect(pasted('i1').info['ref_id']).toBe('N/C_5');
    expect(pasted('i2').info['ref_id']).toBe('N/C_6');
    expect(linkedReport(ctx.store.doc, pasted('o1'))?.id).toBe(ids['i1']);
  });
});

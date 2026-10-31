import { describe, expect, it } from 'vitest';
import type { ElementId, SymbolId, TerminalId } from './ids.ts';
import type { ContactType, SymbolDef } from './model.ts';
import { moveItems, placeElement, rotateElements } from './commands/elements.ts';
import { linkSlave, setXrefOffset } from './commands/masters.ts';
import { updateSettings } from './commands/project.ts';
import { importSymbol } from './commands/symbols.ts';
import { must, setup, twoTerminalSymbol } from './test-utils.ts';
import { xrefContacts, xrefLayout } from './xref.ts';

const id = (s: string) => s as never;
const COIL = twoTerminalSymbol('coil', { kind: 'master', defaultInfo: { label: 'KM1' } });

const contact = (name: string, type: ContactType, terminals: string[]): SymbolDef => ({
  id: name as SymbolId,
  name,
  category: 'test',
  kind: 'slave',
  contact: type,
  graphics: [{ type: 'line', x1: 0, y1: -5, x2: 0, y2: 5 }],
  terminals: terminals.map((n, i) => ({
    id: `t${i}` as TerminalId,
    name: n,
    x: i * 2.5,
    y: i % 2 ? 5 : -5,
    dir: i % 2 ? 's' : 'n',
  })),
  bridges: [],
  defaultInfo: { label: 'K' },
  version: 1,
});
const NO = contact('no', 'no', ['13', '14']);
const NC = contact('nc', 'nc', ['21', '22']);
const SW = contact('sw', 'changeover', ['11', '12', '14']);
const POWER = contact('power', 'power', ['1', '2', '3', '4', '5', '6']);

/** Coil km1 at (100, 50) on an A3 sheet with an NA (column 5), an NC, a changeover, power. */
function project() {
  const ctx = setup();
  const store = ctx.store;
  for (const symbol of [COIL, NO, NC, SW, POWER]) must(store, importSymbol, { symbol });
  const place = (name: string, symbolId: string, x: number, y: number) =>
    must(store, placeElement, { id: id(name), sheetId: ctx.sheet, symbolId: id(symbolId), x, y });
  place('km1', COIL.id, 100, 50);
  place('c-no', NO.id, 180, 150);
  place('c-nc', NC.id, 260, 150);
  place('c-sw', SW.id, 300, 100);
  place('c-pw', POWER.id, 60, 200);
  for (const slave of ['c-no', 'c-nc', 'c-sw', 'c-pw']) {
    must(store, linkSlave, { slave: id(slave), master: id('km1') });
  }
  return ctx;
}
const coil = (ctx: ReturnType<typeof project>) => ctx.store.doc.elements['km1' as ElementId]!;

describe('contact table', () => {
  it('sorts contacts into NA and NC (a changeover in both), power apart', () => {
    const ctx = project();
    const t = xrefContacts(ctx.store.doc, coil(ctx));
    // Reading order: top to bottom, then left to right.
    expect(t.no.map((r) => `${r.terminals} ${r.ref}`)).toEqual(['11-14 1.8', '13-14 1.5']);
    expect(t.nc.map((r) => `${r.terminals} ${r.ref}`)).toEqual(['11-12 1.8', '21-22 1.7']);
    expect(t.power.map((r) => `${r.terminals} ${r.ref}`)).toEqual(['1-2 3-4 5-6 1.2']);
  });

  it('sits under the coil, centred, with a row area per contact', () => {
    const ctx = project();
    const layout = xrefLayout(ctx.store.doc, coil(ctx))!;
    // The coil reaches y = 55: the table starts 2 mm below, centred on x = 100.
    expect(layout.box.minY).toBe(57);
    expect((layout.box.minX + layout.box.maxX) / 2).toBeCloseTo(100);
    expect(layout.texts.slice(0, 2).map((t) => t.text)).toEqual(['NA', 'NC']);
    expect(layout.rows.map((r) => r.slave)).toEqual(['c-sw', 'c-no', 'c-sw', 'c-nc', 'c-pw']);
    // Two table rows plus one power row under the header.
    expect(layout.box.maxY - layout.box.minY).toBeCloseTo(3.5 + 2 * 3 + 3 + 0.5);
  });

  it('moves only up or down, staying centred on the coil, also when the coil moves', () => {
    const ctx = project();
    const base = xrefLayout(ctx.store.doc, coil(ctx))!.box;
    must(ctx.store, setXrefOffset, { id: id('km1'), offset: 15 });
    const shifted = xrefLayout(ctx.store.doc, coil(ctx))!.box;
    expect(shifted.minY - base.minY).toBeCloseTo(15);
    expect(shifted.minX).toBeCloseTo(base.minX);
    must(ctx.store, moveItems, { elements: [id('km1')], dx: 10, dy: 10 });
    const after = xrefLayout(ctx.store.doc, coil(ctx))!.box;
    expect(after.minX - shifted.minX).toBeCloseTo(10);
    expect(after.minY - shifted.minY).toBeCloseTo(10);
    must(ctx.store, rotateElements, { ids: [id('km1')], by: 90 });
    expect(coil(ctx).xrefOffset).toBe(15);
    must(ctx.store, setXrefOffset, { id: id('km1'), offset: 0 });
    expect(coil(ctx).xrefOffset).toBeUndefined();
  });

  it('is not drawn without contacts or when the project hides tables', () => {
    const ctx = project();
    must(ctx.store, placeElement, {
      id: id('km2'),
      sheetId: ctx.sheet,
      symbolId: COIL.id,
      x: 200,
      y: 50,
    });
    expect(xrefLayout(ctx.store.doc, ctx.store.doc.elements['km2' as ElementId]!)).toBeUndefined();
    must(ctx.store, updateSettings, { set: { showXref: false } });
    expect(xrefLayout(ctx.store.doc, coil(ctx))).toBeUndefined();
  });
});

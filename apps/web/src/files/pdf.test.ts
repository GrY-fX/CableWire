// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  addSheet,
  createEmptyProject,
  createStore,
  importSymbol,
  linkReports,
  placeElement,
  updateSheet,
} from '@cablewire/core';
import type { ElementId, SheetId, SymbolDef, SymbolId, TerminalId } from '@cablewire/core';
import { addLinks, pdfPlan, woffToSfnt } from './pdf.ts';

const report = (dir: 'in' | 'out'): SymbolDef => ({
  id: `report-${dir}` as SymbolId,
  name: dir,
  category: 'Rimandi',
  kind: 'report',
  report: dir,
  graphics: [{ type: 'rect', x: -4, y: -2, width: 8, height: 4 }],
  terminals: [{ id: 't1' as TerminalId, name: '1', x: 0, y: 0, dir: 'w' }],
  bridges: [],
  defaultInfo: {},
  version: 1,
});

/** Sheet 1 (A4 landscape): outgoing o1. Sheet 2 «Motori» (A3 portrait): incoming i1, free i2. */
function project() {
  const store = createStore(createEmptyProject('Quadro'));
  const s1 = store.doc.sheetOrder[0]!;
  const s2 = 's2' as SheetId;
  const run = <A>(command: Parameters<typeof store.run<A>>[0], args: A) => {
    const result = store.run(command, args);
    if (!result.ok) throw new Error(result.error.message);
  };
  run(importSymbol, { symbol: report('out') });
  run(importSymbol, { symbol: report('in') });
  run(addSheet, { id: s2, title: 'Motori' });
  run(updateSheet, { id: s2, set: { size: 'A3', orientation: 'portrait' } });
  const place = (id: string, symbolId: string, sheetId: SheetId, x: number, y: number) =>
    run(placeElement, { id: id as ElementId, sheetId, symbolId: symbolId as SymbolId, x, y });
  place('o1', 'report-out', s1, 250, 100);
  place('i1', 'report-in', s2, 30, 200);
  place('i2', 'report-in', s2, 30, 300);
  run(linkReports, { a: 'o1' as ElementId, b: 'i1' as ElementId });
  return { doc: store.doc, s1, s2 };
}

describe('PDF plan', () => {
  it('makes one page per sheet with its size and a bookmark title', () => {
    const { doc, s1, s2 } = project();
    const { pages } = pdfPlan(doc, [s1, s2]);
    expect(pages).toEqual([
      { sheetId: s1, title: 'Foglio 1', width: 297, height: 210, orientation: 'landscape' },
      { sheetId: s2, title: '2 – Motori', width: 297, height: 420, orientation: 'portrait' },
    ]);
  });

  it('links each linked reference to the page and place of its partner', () => {
    const { doc, s1, s2 } = project();
    const { links } = pdfPlan(doc, [s1, s2]);
    expect(links).toEqual([
      {
        page: 1,
        rect: { x: 245, y: 97, width: 10, height: 6 },
        target: { page: 2, x: 30, y: 200 },
      },
      {
        page: 2,
        rect: { x: 25, y: 197, width: 10, height: 6 },
        target: { page: 1, x: 250, y: 100 },
      },
    ]);
  });

  it('leaves out links to sheets not exported', () => {
    const { doc, s1 } = project();
    expect(pdfPlan(doc, [s1]).links).toEqual([]);
  });

  it('writes the links as PDF annotations towards the right pages', () => {
    const { doc, s1, s2 } = project();
    const plan = pdfPlan(doc, [s1, s2]);
    const pdf = new jsPDF({ unit: 'mm', format: [297, 210], orientation: 'landscape' });
    pdf.addPage([297, 420], 'portrait');
    addLinks(pdf, plan);
    const text = pdf.output();
    const links = text.match(/\/Subtype \/Link [^>]*\/Dest \[\d+ 0 R \/FitH \d+\]/g) ?? [];
    expect(links).toHaveLength(2);
    // Partner of o1: i1 at y = 200 mm on a 420 mm page, shown 30 mm below the top edge.
    expect(links[0]).toContain(`/FitH ${Math.round((420 - 170) * (72 / 25.4))}]`);
  });
});

describe('font for the PDF', () => {
  it('unpacks osifont from WOFF into a TrueType file', async () => {
    // Tests run from the repository root.
    const woff = readFileSync('packages/render/assets/osifont.woff');
    const sfnt = await woffToSfnt(
      woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.length),
    );
    const view = new DataView(sfnt.buffer);
    expect(view.getUint32(0)).toBe(0x00010000); // TrueType outlines
    const tags = Array.from({ length: view.getUint16(4) }, (_, i) =>
      String.fromCharCode(...sfnt.subarray(12 + i * 16, 16 + i * 16)),
    );
    expect(tags).toEqual(expect.arrayContaining(['cmap', 'glyf', 'head', 'hmtx', 'loca']));
    // jsPDF accepts it.
    const pdf = new jsPDF();
    let binary = '';
    for (const b of sfnt) binary += String.fromCharCode(b);
    pdf.addFileToVFS('osifont.ttf', btoa(binary));
    pdf.addFont('osifont.ttf', 'osifont', 'normal');
    pdf.setFont('osifont');
    pdf.text('Foglio 1', 10, 10);
    expect(pdf.output()).toContain('/FontFile2');
  });
});

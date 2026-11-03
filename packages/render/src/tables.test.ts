import { describe, expect, it } from 'vitest';
import type { ListTable } from '@cablewire/core';
import type { SceneNode } from './scene.ts';
import { columnWidths, paginateLists, rowsPerPage, tablePageScene } from './tables.ts';
import { fixture } from './fixture.test-utils.ts';

const texts = (node: SceneNode): string[] =>
  node.kind === 'text' ? [node.text] : node.kind === 'group' ? node.children.flatMap(texts) : [];

const list = (rows: number): ListTable => ({
  kind: 'wires',
  title: 'Lista fili',
  columns: ['Numero', 'Da', 'A'],
  rows: Array.from({ length: rows }, (_, i) => [String(i + 1), `1K${i}:A1`, `X1:${i}`]),
});

describe('pages of tables', () => {
  it('cut long lists into pages, numbered after the sheets', () => {
    const { store } = fixture();
    const per = rowsPerPage(store.doc);
    const pages = paginateLists(store.doc, [list(per + 3), { ...list(0), title: 'Lista cavi' }]);
    expect(pages.map((p) => [p.title, p.rows.length])).toEqual([
      ['Lista fili (1)', per],
      ['Lista fili (2)', 3],
      ['Lista cavi', 0],
    ]);
    // The project has one sheet: the second page of tables is sheet 3 of 4.
    const scene = tablePageScene(store.doc, pages[1]!, 3, 4);
    const frame = texts(scene.items[0]!.node);
    expect(frame).toContain('Lista fili (2)');
    expect(frame.some((t) => t.includes('3') && t.includes('4'))).toBe(true);
    const table = texts(scene.items[1]!.node);
    expect(table.slice(0, 4)).toEqual([
      'Lista fili (2)',
      'Numero',
      String(per + 1),
      String(per + 2),
    ]);
    expect(texts(tablePageScene(store.doc, pages[2]!, 4, 4).items[1]!.node)).toContain(
      'Nessun elemento.',
    );
  });

  it('give columns room in proportion to their texts', () => {
    const widths = columnWidths(
      { kind: 'wires', title: '', columns: ['N', 'Descrizione'], rows: [['1', 'Bobina']] },
      140,
    );
    // "N" counts as 3 characters (at least), "Descrizione" as 11.
    expect(widths).toEqual([30, 110]);
  });
});

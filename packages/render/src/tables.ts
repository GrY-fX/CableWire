import { createSheet, sheetLayout, titleBlockReserve } from '@cablewire/core';
import type { ListTable, ProjectDoc, Sheet } from '@cablewire/core';
import type { Scene, SceneNode } from './scene.ts';
import { buildFrame } from './sheet.ts';

// Lists of the project laid out on pages with the sheets' format, frame and title
// block: the heading of the columns on every page, alternate rows shaded.

/** One page of a list: its rows, and which part of the list it is. */
export interface TablePage {
  list: ListTable;
  /** E.g. "Lista fili (2)" for the second page of a list. */
  title: string;
  rows: string[][];
}

const MARGIN = 5;
const HEADING = 4;
const ROW = 6;
const TEXT = 2.5;
/** Average width of a character, in font sizes (osifont). */
const CHAR = 0.6;
const PAD = 1.2;

/** A sheet with the project's format (its first sheet's), for a page of tables. */
export function tableSheet(doc: ProjectDoc, title: string): Sheet {
  const first = doc.sheets[doc.sheetOrder[0]!];
  const sheet = createSheet(title, 'table' as never, first);
  return sheet;
}

/** Room for the table on a page: the drawing area inside a small margin. */
function tableArea(doc: ProjectDoc, sheet: Sheet) {
  const { drawing } = sheetLayout(sheet, titleBlockReserve(doc));
  return {
    x: drawing.x + MARGIN,
    y: drawing.y + MARGIN,
    width: drawing.width - 2 * MARGIN,
    height: drawing.height - 2 * MARGIN,
  };
}

/** Rows that fit on one page under the heading and the column names. */
export function rowsPerPage(doc: ProjectDoc): number {
  const area = tableArea(doc, tableSheet(doc, ''));
  return Math.max(1, Math.floor((area.height - HEADING - 2 - ROW) / ROW));
}

/** The lists cut into pages; an empty list still gets a page saying so. */
export function paginateLists(doc: ProjectDoc, lists: readonly ListTable[]): TablePage[] {
  const per = rowsPerPage(doc);
  return lists.flatMap((list) => {
    const parts = Math.max(1, Math.ceil(list.rows.length / per));
    return Array.from({ length: parts }, (_, i) => ({
      list,
      title: parts > 1 ? `${list.title} (${i + 1})` : list.title,
      rows: list.rows.slice(i * per, (i + 1) * per),
    }));
  });
}

/** Column widths in proportion to their longest text, filling the width. */
export function columnWidths(list: ListTable, width: number): number[] {
  const longest = list.columns.map((name, i) =>
    Math.max(name.length, 3, ...list.rows.map((r) => (r[i] ?? '').length)),
  );
  const total = longest.reduce((a, b) => a + b, 0);
  return longest.map((n) => (n / total) * width);
}

/** Text cut to a width, with an ellipsis when it does not fit. */
function fit(text: string, width: number): string {
  const max = Math.floor((width - 2 * PAD) / (TEXT * CHAR));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** A page of a list as a scene: frame and title block (as page `number` of `total`), table. */
export function tablePageScene(
  doc: ProjectDoc,
  page: TablePage,
  number: number,
  total: number,
): Scene {
  const sheet = tableSheet(doc, page.title);
  const { width, height } = sheetLayout(sheet);
  const area = tableArea(doc, sheet);
  const widths = columnWidths(page.list, area.width);
  const texts: SceneNode[] = [];
  const shade: string[] = [];
  const lines: string[] = [];
  const text = (x: number, y: number, value: string, size = TEXT) =>
    texts.push({
      kind: 'text',
      x: round(x),
      y: round(y),
      text: value,
      size,
      anchor: 'start',
      classes: ['text'],
    });

  text(area.x, area.y + HEADING / 2, page.title, HEADING);
  const top = area.y + HEADING + 2;
  const bottom = top + ROW * (page.rows.length + 1);
  const right = area.x + area.width;
  // Column names on a grey band, then the rows (every other one shaded).
  shade.push(`M${area.x} ${top}h${area.width}v${ROW}h${-area.width}Z`);
  page.rows.forEach((_, r) => {
    if (r % 2 === 1)
      shade.push(`M${area.x} ${round(top + ROW * (r + 1))}h${area.width}v${ROW}h${-area.width}Z`);
  });
  lines.push(`M${area.x} ${top}H${right}V${bottom}H${area.x}Z`, `M${area.x} ${top + ROW}H${right}`);
  let x = area.x;
  page.list.columns.forEach((name, c) => {
    const w = widths[c]!;
    if (c > 0) lines.push(`M${round(x)} ${top}V${bottom}`);
    text(x + PAD, top + ROW / 2, fit(name, w));
    page.rows.forEach((row, r) => text(x + PAD, top + ROW * (r + 1.5), fit(row[c] ?? '', w)));
    x += w;
  });
  if (page.rows.length === 0) text(area.x + PAD, top + ROW * 1.5, 'Nessun elemento.');

  const table: SceneNode = {
    kind: 'group',
    children: [
      { kind: 'path', d: shade.join(''), classes: ['table-shade'] },
      { kind: 'path', d: lines.join(''), classes: ['stroke'] },
      ...texts,
    ],
  };
  return {
    width,
    height,
    items: [
      { key: 'frame', layer: 'frame', node: buildFrame(doc, sheet, { number, total }) },
      { key: 'table', layer: 'elements', node: table },
    ],
  };
}

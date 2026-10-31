import type { ElementId } from './ids.ts';
import type { Bounds } from './geometry.ts';
import { elementBounds, TEXT_WIDTH_RATIO } from './geometry.ts';
import { contactType, slavesOf } from './masters.ts';
import type { Element, ProjectDoc } from './model.ts';
import { referenceValues } from './references.ts';

// The contact table under a coil: NA and NC columns, one row per contact with its
// terminals and where it is (sheet.column), power contacts in rows below. Its place
// is computed here, so the drawing, the editor (dragging) and the PDF (links) agree.

export interface XrefRow {
  slave: ElementId;
  /** Terminals of the contact, e.g. `13-14`, or `1-2 3-4 5-6` for power contacts. */
  terminals: string;
  /** Where the contact is: `2.5` = sheet 2, column 5. */
  ref: string;
}

export interface XrefContacts {
  no: XrefRow[];
  nc: XrefRow[];
  power: XrefRow[];
}

/** Contacts of a coil sorted into the table's columns (a changeover goes in both). */
export function xrefContacts(doc: ProjectDoc, master: Element): XrefContacts {
  const result: XrefContacts = { no: [], nc: [], power: [] };
  for (const slave of slavesOf(doc, master)) {
    const names = (doc.symbols[slave.symbolId]?.terminals ?? []).map((t) => t.name);
    const values = referenceValues(doc, slave);
    const row = (terminals: string): XrefRow => ({
      slave: slave.id,
      terminals,
      ref: `${values['foglio']}.${values['colonna']}`,
    });
    switch (contactType(doc, slave)) {
      case 'nc':
        result.nc.push(row(names.join('-')));
        break;
      case 'changeover': {
        // IEC numbering: common x1, closed x2, open x4; otherwise in drawing order.
        const [common = '', ...rest] = names;
        const nc = rest.find((n) => n.endsWith('2')) ?? rest[0] ?? '';
        const no = rest.find((n) => n.endsWith('4')) ?? rest[1] ?? '';
        result.no.push(row(`${common}-${no}`));
        result.nc.push(row(`${common}-${nc}`));
        break;
      }
      case 'power': {
        const pairs: string[] = [];
        for (let i = 0; i < names.length; i += 2) pairs.push(names.slice(i, i + 2).join('-'));
        result.power.push(row(pairs.join(' ')));
        break;
      }
      default:
        result.no.push(row(names.join('-')));
    }
  }
  return result;
}

export interface XrefText {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

export interface XrefLayout {
  /** Whole table, for hit testing and dragging. */
  box: Bounds;
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  texts: XrefText[];
  /** Area of each row, for links to its contact. */
  rows: { slave: ElementId; rect: Bounds }[];
}

/** Text height in the table, in mm. */
export const XREF_TEXT_SIZE = 2;
const HEADER = 3.5;
const ROW = 3;
const PAD = 1.5;
const GAP = 2;
/** Space between the coil and the table in its default place. */
const MARGIN = 2;

const width = (text: string) => text.length * XREF_TEXT_SIZE * TEXT_WIDTH_RATIO;

/** Whether the project shows contact tables. */
export function showsXref(doc: ProjectDoc): boolean {
  return doc.settings.showXref !== false;
}

/**
 * Lines and texts of a coil's table at its place: under the coil, centred on its X
 * axis, moved up or down by the coil's `xrefOffset`. Undefined when the coil has no
 * contacts or tables are off.
 */
export function xrefLayout(doc: ProjectDoc, master: Element): XrefLayout | undefined {
  const symbol = doc.symbols[master.symbolId];
  if (!symbol || symbol.kind !== 'master' || !showsXref(doc)) return undefined;
  const { no, nc, power } = xrefContacts(doc, master);
  if (no.length + nc.length + power.length === 0) return undefined;

  const cell = (r: XrefRow) => width(r.terminals) + GAP + width(r.ref) + 2 * PAD;
  const column = Math.max(width('NA') + 2 * PAD, ...[...no, ...nc].map(cell));
  const total = Math.max(2 * column, ...power.map(cell));
  const col = total / 2;
  const tableRows = Math.max(no.length, nc.length);
  const height = HEADER + tableRows * ROW + (power.length ? power.length * ROW + 0.5 : 0);

  const bounds = elementBounds(master, symbol);
  const left = round(master.x - total / 2);
  const top = round(bounds.maxY + MARGIN + (master.xrefOffset ?? 0));
  const right = left + total;
  const lines: XrefLayout['lines'] = [];
  const texts: XrefText[] = [];
  const rows: XrefLayout['rows'] = [];

  // Header and the cross separating NA from NC.
  const headerBottom = top + HEADER;
  const tableBottom = headerBottom + tableRows * ROW;
  texts.push({ x: left + col / 2, y: top + HEADER / 2, text: 'NA', anchor: 'middle' });
  texts.push({ x: left + col * 1.5, y: top + HEADER / 2, text: 'NC', anchor: 'middle' });
  lines.push({ x1: left, y1: headerBottom, x2: right, y2: headerBottom });
  lines.push({ x1: left + col, y1: top, x2: left + col, y2: tableBottom });

  const addRow = (r: XrefRow, x1: number, x2: number, y: number) => {
    texts.push({ x: x1 + PAD, y: y + ROW / 2, text: r.terminals, anchor: 'start' });
    texts.push({ x: x2 - PAD, y: y + ROW / 2, text: r.ref, anchor: 'end' });
    rows.push({ slave: r.slave, rect: { minX: x1, minY: y, maxX: x2, maxY: y + ROW } });
  };
  no.forEach((r, i) => addRow(r, left, left + col, headerBottom + i * ROW));
  nc.forEach((r, i) => addRow(r, left + col, right, headerBottom + i * ROW));
  if (power.length) {
    const start = tableBottom + 0.5;
    lines.push({ x1: left, y1: tableBottom, x2: right, y2: tableBottom });
    power.forEach((r, i) => addRow(r, left, right, start + i * ROW));
  }
  return { box: { minX: left, minY: top, maxX: right, maxY: top + height }, lines, texts, rows };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

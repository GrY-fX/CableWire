import type { ElementId } from './ids.ts';
import type { Bounds } from './geometry.ts';
import { elementBounds, symbolBounds, TEXT_WIDTH_RATIO } from './geometry.ts';
import { contactType, slavesOf } from './masters.ts';
import type { Element, MasterType, Primitive, ProjectDoc, SymbolDef, XrefStyle } from './model.ts';
import { referenceValues } from './references.ts';

// The contacts of a master, in one of two styles: a table under it (NA and NC
// columns, one row per contact with its terminals and where it is, power contacts in
// rows below), or the contacts drawn small side by side on its right, each with where
// it is underneath. Their
// place is computed here, so the drawing, the editor (dragging) and the PDF (links)
// agree.

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
    const row = (terminals: string): XrefRow => ({
      slave: slave.id,
      terminals,
      ref: shortRef(doc, slave),
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

/** Where an element is, as sheet.column (e.g. `2.5`). */
function shortRef(doc: ProjectDoc, element: Element): string {
  const values = referenceValues(doc, element);
  return `${values['foglio']}.${values['colonna']}`;
}

export interface XrefText {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  /** Clockwise rotation in degrees around (x, y); 90 reads from top to bottom. */
  angle?: number;
}

/** A contact drawn small: its symbol's graphics scaled by `scale`, top-left at (x, y). */
export interface XrefGlyph {
  slave: ElementId;
  symbol: SymbolDef;
  x: number;
  y: number;
  scale: number;
}

export interface XrefLayout {
  style: XrefStyle;
  /** Whole table or column of contacts, for hit testing and dragging. */
  box: Bounds;
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  texts: XrefText[];
  /** Contacts drawn small (style `contacts`). */
  glyphs: XrefGlyph[];
  /** Area of each row or drawn contact, for links to its contact. */
  rows: { slave: ElementId; rect: Bounds }[];
}

/** Text height of the references, in mm. */
export const XREF_TEXT_SIZE = 2;
const HEADER = 3.5;
const ROW = 3;
const PAD = 1.5;
const GAP = 2;
/** Space between the master and its contacts in their default place. */
const MARGIN = 2;
/** Height of a drawn contact, space between two of them and above the reference. */
const GLYPH_HEIGHT = 6;
const GLYPH_GAP = 3;
const TEXT_GAP = 1;

/** Styles per kind of master when the project does not say. */
export const DEFAULT_XREF_STYLES: Record<MasterType, XrefStyle> = {
  coil: 'table',
  device: 'contacts',
};

const width = (text: string) => text.length * XREF_TEXT_SIZE * TEXT_WIDTH_RATIO;

/** Whether the project shows the contacts of masters. */
export function showsXref(doc: ProjectDoc): boolean {
  return doc.settings.showXref !== false;
}

/** Style of the project for a kind of master. */
export function projectXrefStyle(doc: ProjectDoc, type: MasterType): XrefStyle {
  return doc.settings.xrefStyles?.[type] ?? DEFAULT_XREF_STYLES[type];
}

/** Style used by a master: its own choice, else the project's for its kind. */
export function xrefStyleOf(doc: ProjectDoc, master: Element): XrefStyle {
  const type = doc.symbols[master.symbolId]?.master ?? 'coil';
  return master.xrefStyle ?? projectXrefStyle(doc, type);
}

/**
 * Where a master's contacts are drawn, in its style: a table under the master,
 * centred on its X axis and moved up or down by `xrefOffset`; or the contacts drawn
 * small side by side on its right, each with its reference underneath, moved by
 * `xrefOffsetX` and `xrefOffset`.
 * Undefined when the master has no contacts or the project hides them.
 */
export function xrefLayout(doc: ProjectDoc, master: Element): XrefLayout | undefined {
  const symbol = doc.symbols[master.symbolId];
  if (!symbol || symbol.kind !== 'master' || !showsXref(doc)) return undefined;
  const bounds = elementBounds(master, withFilledTexts(symbol, master.info));
  return xrefStyleOf(doc, master) === 'contacts'
    ? contactsLayout(doc, master, bounds)
    : tableLayout(doc, master, bounds);
}

function tableLayout(doc: ProjectDoc, master: Element, bounds: Bounds): XrefLayout | undefined {
  const { no, nc, power } = xrefContacts(doc, master);
  if (no.length + nc.length + power.length === 0) return undefined;

  const cell = (r: XrefRow) => width(r.terminals) + GAP + width(r.ref) + 2 * PAD;
  const column = Math.max(width('NA') + 2 * PAD, ...[...no, ...nc].map(cell));
  const total = Math.max(2 * column, ...power.map(cell));
  const col = total / 2;
  const tableRows = Math.max(no.length, nc.length);
  const height = HEADER + tableRows * ROW + (power.length ? power.length * ROW + 0.5 : 0);

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
  const box = { minX: left, minY: top, maxX: right, maxY: top + height };
  return { style: 'table', box, lines, texts, glyphs: [], rows };
}

/**
 * The symbol with its texts as drawn for an element (`{label}` → `KM1`), so its
 * bounds follow what is on the sheet, not the length of the placeholders.
 */
function withFilledTexts(symbol: SymbolDef, info: Record<string, string>): SymbolDef {
  const graphics = symbol.graphics.flatMap((g): Primitive[] => {
    if (g.type !== 'text') return [g];
    const text = g.text.replace(/\{(\w+)\}/g, (_, key: string) => info[key] ?? '');
    return text.trim() ? [{ ...g, text }] : [];
  });
  return { ...symbol, graphics };
}

/** Bounds of a symbol's drawing (graphics and terminals, texts left out). */
export function drawingBounds(symbol: SymbolDef): Bounds | undefined {
  return symbolBounds({ ...symbol, graphics: symbol.graphics.filter((g) => g.type !== 'text') });
}

function contactsLayout(doc: ProjectDoc, master: Element, bounds: Bounds): XrefLayout | undefined {
  const left = round(bounds.maxX + MARGIN + (master.xrefOffsetX ?? 0));
  const top = round(bounds.minY + (master.xrefOffset ?? 0));
  const texts: XrefText[] = [];
  const glyphs: XrefGlyph[] = [];
  const rows: XrefLayout['rows'] = [];
  // Contacts side by side, left to right, each with its reference underneath, turned
  // a quarter clockwise (it reads from top to bottom).
  const textY = top + GLYPH_HEIGHT + TEXT_GAP;
  let bottom = textY;
  let x = left;
  for (const slave of slavesOf(doc, master)) {
    const symbol = doc.symbols[slave.symbolId];
    const b = symbol && drawingBounds(symbol);
    if (!symbol || !b) continue;
    const ref = shortRef(doc, slave);
    const scale = GLYPH_HEIGHT / Math.max(b.maxY - b.minY, 1);
    const glyphWidth = (b.maxX - b.minX) * scale;
    const itemWidth = Math.max(glyphWidth, XREF_TEXT_SIZE);
    const centre = x + itemWidth / 2;
    const itemBottom = textY + width(ref);
    glyphs.push({ slave: slave.id, symbol, x: round(centre - glyphWidth / 2), y: top, scale });
    texts.push({ x: round(centre), y: round(textY), text: ref, anchor: 'start', angle: 90 });
    rows.push({
      slave: slave.id,
      rect: { minX: x, minY: top, maxX: x + itemWidth, maxY: itemBottom },
    });
    bottom = Math.max(bottom, itemBottom);
    x += itemWidth + GLYPH_GAP;
  }
  if (glyphs.length === 0) return undefined;
  const box = { minX: left, minY: top, maxX: x - GLYPH_GAP, maxY: bottom };
  return { style: 'contacts', box, lines: [], texts, glyphs, rows };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

import type { ProjectDoc, Sheet, SheetSize } from '@cablewire/core';
import type { SceneNode } from './scene.ts';

/** ISO 216 sizes in millimetres, landscape (width ≥ height). */
const ISO_SIZES: Record<SheetSize, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function sheetDimensions(sheet: Sheet): { width: number; height: number } {
  const [long, short] = ISO_SIZES[sheet.size];
  return sheet.orientation === 'landscape'
    ? { width: long, height: short }
    : { width: short, height: long };
}

/** Width of the band holding column numbers and row letters. */
export const BAND = 5;
export const TITLE_BLOCK = { width: 120, height: 20 };

export interface SheetLayout {
  width: number;
  height: number;
  /** Outer frame, inside the paper margin. */
  frame: Rect;
  /** Area for the drawing, inside the reference bands. */
  drawing: Rect;
  titleBlock: Rect;
}

export function sheetLayout(sheet: Sheet): SheetLayout {
  const { width, height } = sheetDimensions(sheet);
  const margin = sheet.size === 'A4' ? 5 : 10;
  const frame = { x: margin, y: margin, width: width - 2 * margin, height: height - 2 * margin };
  const drawing = {
    x: frame.x + BAND,
    y: frame.y + BAND,
    width: frame.width - BAND,
    height: frame.height - BAND,
  };
  const titleBlock = {
    x: frame.x + frame.width - TITLE_BLOCK.width,
    y: frame.y + frame.height - TITLE_BLOCK.height,
    ...TITLE_BLOCK,
  };
  return { width, height, frame, drawing, titleBlock };
}

const rect = (r: Rect) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1}L${x2} ${y2}`;

/** Row label for 0-based index: A, B, ... Z, AA, AB, ... */
export function rowLabel(index: number): string {
  let label = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    label = String.fromCharCode(65 + r) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** Frame, reference bands and the simple title block. */
export function buildFrame(doc: ProjectDoc, sheet: Sheet): SceneNode {
  const { frame, drawing, titleBlock: tb } = sheetLayout(sheet);
  const parts: string[] = [rect(frame)];
  const texts: SceneNode[] = [];
  const text = (x: number, y: number, value: string, size: number, anchor: 'start' | 'middle') =>
    texts.push({ kind: 'text', x, y, text: value, size, anchor, classes: ['text'] });

  parts.push(line(drawing.x, frame.y, drawing.x, frame.y + frame.height));
  parts.push(line(frame.x, drawing.y, frame.x + frame.width, drawing.y));

  const colWidth = drawing.width / sheet.cols;
  for (let c = 0; c < sheet.cols; c++) {
    const x = drawing.x + c * colWidth;
    if (c > 0) parts.push(line(x, frame.y, x, drawing.y));
    text(x + colWidth / 2, frame.y + BAND / 2, String(c + 1), 2.5, 'middle');
  }
  const rowHeight = drawing.height / sheet.rows;
  for (let r = 0; r < sheet.rows; r++) {
    const y = drawing.y + r * rowHeight;
    if (r > 0) parts.push(line(frame.x, y, drawing.x, y));
    text(frame.x + BAND / 2, y + rowHeight / 2, rowLabel(r), 2.5, 'middle');
  }

  // Title block: project title | sheet title on the first row, author | date | sheet n/N below.
  const row = tb.height / 2;
  parts.push(rect(tb), line(tb.x, tb.y + row, tb.x + tb.width, tb.y + row));
  parts.push(line(tb.x + 70, tb.y, tb.x + 70, tb.y + tb.height));
  parts.push(line(tb.x + 95, tb.y + row, tb.x + 95, tb.y + tb.height));
  const index = doc.sheetOrder.indexOf(sheet.id) + 1;
  text(tb.x + 2, tb.y + row / 2, doc.meta.title, 3.5, 'start');
  text(tb.x + 72, tb.y + row / 2, sheet.title, 3.5, 'start');
  text(tb.x + 2, tb.y + row * 1.5, doc.meta.author, 2.5, 'start');
  text(tb.x + 72, tb.y + row * 1.5, doc.meta.updatedAt.slice(0, 10), 2.5, 'start');
  text(tb.x + 97, tb.y + row * 1.5, `Foglio ${index} / ${doc.sheetOrder.length}`, 2.5, 'start');

  return {
    kind: 'group',
    children: [{ kind: 'path', d: parts.join(''), classes: ['stroke', 'frame'] }, ...texts],
  };
}

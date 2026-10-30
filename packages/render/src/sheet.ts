import { BAND, sheetLayout } from '@cablewire/core';
import type { ProjectDoc, Rect, Sheet } from '@cablewire/core';
import type { SceneNode } from './scene.ts';

// Sheet geometry lives in core (numbering needs it too); re-exported for existing users.
export { BAND, sheetDimensions, sheetLayout, TITLE_BLOCK } from '@cablewire/core';
export type { Rect, SheetLayout } from '@cablewire/core';

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

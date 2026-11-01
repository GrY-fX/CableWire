import {
  BAND,
  getTitleBlock,
  readableText,
  rowLabel,
  sheetLayout,
  titleBlockPlacement,
  titleBlockReserve,
  titleBlockValues,
} from '@cablewire/core';
import type { Primitive, ProjectDoc, Rect, Sheet } from '@cablewire/core';
import { primitivePath } from './build.ts';
import { fillPlaceholders } from './text.ts';
import type { SceneNode } from './scene.ts';

// Sheet geometry lives in core (numbering needs it too); re-exported for existing users.
export { BAND, rowLabel, sheetDimensions, sheetLayout, TITLE_BLOCK } from '@cablewire/core';
export type { Rect, SheetLayout } from '@cablewire/core';

const rect = (r: Rect) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1}L${x2} ${y2}`;

/** Line printed under the frame of every sheet. */
export const CREDIT_TEXT = 'Schema realizzato con il software CableWire';

/** Frame, reference bands and the project's title block. */
export function buildFrame(doc: ProjectDoc, sheet: Sheet): SceneNode {
  // A title block spanning the width keeps the bottom of the frame: rows end above it.
  const reserve = titleBlockReserve(doc);
  const { frame, drawing } = sheetLayout(sheet, reserve);
  const parts: string[] = [rect(frame)];
  const texts: SceneNode[] = [];
  const text = (x: number, y: number, value: string, size: number, anchor: 'start' | 'middle') =>
    texts.push({ kind: 'text', x, y, text: value, size, anchor, classes: ['text'] });

  parts.push(line(drawing.x, frame.y, drawing.x, frame.y + frame.height - reserve));
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

  // Credit line, small, in the paper margin under the frame (unless turned off).
  if (doc.settings.showCredit !== false) {
    const margin = frame.y;
    texts.push({
      kind: 'text',
      x: frame.x,
      y: round(frame.y + frame.height + margin / 2),
      text: CREDIT_TEXT,
      size: Math.min(1.8, margin * 0.4),
      anchor: 'start',
      classes: ['text', 'credit'],
    });
  }

  // Title block from the project's template, placeholders filled for this sheet.
  const block = getTitleBlock(doc);
  const place = titleBlockPlacement(sheet, block);
  const values = titleBlockValues(doc, sheet);
  const shapes: SceneNode[] = [];
  for (const p of block.graphics) {
    const q = placePrimitive(p, place);
    if (q.type === 'text') {
      const value = fillPlaceholders(q.text, values);
      if (!value) continue;
      const { angle, anchor } = readableText(q.rotation ?? 0, false, q.anchor ?? 'start');
      texts.push({
        kind: 'text',
        x: q.x,
        y: q.y,
        text: value,
        size: q.size,
        anchor,
        ...(angle ? { angle } : {}),
        classes: ['text'],
      });
    } else if (q.type === 'line') {
      parts.push(line(q.x1, q.y1, q.x2, q.y2));
    } else if (q.type === 'rect' && !q.filled) {
      parts.push(rect(q));
    } else {
      shapes.push(primitivePath(q));
    }
  }

  return {
    kind: 'group',
    children: [
      { kind: 'path', d: parts.join(''), classes: ['stroke', 'frame'] },
      ...shapes,
      ...texts,
    ],
  };
}

/**
 * A title block's shape at its place on the sheet: moved to the block's corner and,
 * for bands, stretched across (sizes of texts and circles are kept).
 */
function placePrimitive(p: Primitive, place: { x: number; y: number; scaleX: number }): Primitive {
  const X = (x: number) => round(place.x + x * place.scaleX);
  const Y = (y: number) => round(place.y + y);
  switch (p.type) {
    case 'line':
      return { ...p, x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2) };
    case 'polyline':
      return { ...p, points: p.points.map((q) => ({ x: X(q.x), y: Y(q.y) })) };
    case 'rect':
      return { ...p, x: X(p.x), y: Y(p.y), width: round(p.width * place.scaleX) };
    case 'circle':
      return { ...p, cx: X(p.cx), cy: Y(p.cy) };
    case 'arc':
      return { ...p, cx: X(p.cx), cy: Y(p.cy) };
    case 'text':
      return { ...p, x: X(p.x), y: Y(p.y) };
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;

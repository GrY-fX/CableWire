import type { Bounds } from './geometry.ts';
import { readableText, TEXT_WIDTH_RATIO } from './geometry.ts';
import type { ProjectDoc, SheetText } from './model.ts';
import { titleBlockValues } from './titleblock.ts';

// Free texts on the sheets: notes, legends, headings. They may span several lines and
// use the title block's placeholders ({titolo}, {foglio}, {cliente}…). Their layout is
// computed here, so the drawing and the editor (clicks, selection) agree.

/** Heights offered for free texts, in mm. */
export const TEXT_SIZES: readonly number[] = [2.5, 3.5, 5, 7, 10];
export const DEFAULT_TEXT_SIZE = 3.5;
/** Distance between lines, as a fraction of the text height. */
const LINE_SPACING = 1.4;

export interface TextLayout {
  /** One entry per line, already placed and with placeholders filled. */
  lines: { x: number; y: number; text: string }[];
  angle: 0 | 90;
  anchor: 'start' | 'middle' | 'end';
  bounds: Bounds;
}

/** Fills placeholders with the project's and the sheet's values; unknown ones stay. */
function fill(doc: ProjectDoc, t: SheetText): string {
  const sheet = doc.sheets[t.sheetId];
  if (!sheet) return t.text;
  const values = titleBlockValues(doc, sheet);
  return t.text.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
}

/**
 * Lines of a free text at their place: the first line on the text's point, the next
 * ones below it (to the left when the text is vertical, so it reads from the right).
 */
export function textLayout(doc: ProjectDoc, t: SheetText): TextLayout {
  const { angle, anchor } = readableText(t.rotation ?? 0, false, t.anchor ?? 'start');
  const step = t.size * LINE_SPACING;
  const rows = fill(doc, t).split('\n');
  const lines = rows.map((text, i) => ({
    x: angle === 90 ? t.x - i * step : t.x,
    y: angle === 90 ? t.y : t.y + i * step,
    text,
  }));
  // Box: along the longest line, across from the first line to the last.
  const length = Math.max(1, ...rows.map((r) => r.length)) * t.size * TEXT_WIDTH_RATIO;
  const start = anchor === 'start' ? 0 : anchor === 'middle' ? -length / 2 : -length;
  const across = (rows.length - 1) * step;
  const half = t.size / 2;
  const bounds =
    angle === 90
      ? {
          minX: t.x - across - half,
          maxX: t.x + half,
          minY: t.y + start,
          maxY: t.y + start + length,
        }
      : {
          minX: t.x + start,
          maxX: t.x + start + length,
          minY: t.y - half,
          maxY: t.y + across + half,
        };
  return { lines, angle, anchor, bounds };
}

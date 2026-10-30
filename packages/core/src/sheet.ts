import type { Point, Sheet, SheetSize } from './model.ts';

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

/** Column (1-based, clamped to the frame) of the reference grid containing `p`. */
export function columnAt(sheet: Sheet, p: Point): number {
  const { drawing } = sheetLayout(sheet);
  const col = Math.floor(((p.x - drawing.x) / drawing.width) * sheet.cols) + 1;
  return Math.min(sheet.cols, Math.max(1, col));
}

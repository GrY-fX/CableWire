import { DEFAULT_SHEET_FORMAT } from '@cablewire/core';
import type { Sheet, SheetFormat } from '@cablewire/core';

// The last paper and grid chosen for a sheet, remembered in this browser: new sheets
// and new projects start from it. Storage may be unavailable (private windows), so
// every access falls back to the default.

const KEY = 'cablewire.sheetFormat';
const SIZES = ['A4', 'A3', 'A2', 'A1', 'A0'];

function valid(value: unknown): value is SheetFormat {
  const f = value as Partial<SheetFormat> | null;
  const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 1;
  return (
    !!f &&
    SIZES.includes(f.size as string) &&
    (f.orientation === 'landscape' || f.orientation === 'portrait') &&
    count(f.rows) &&
    count(f.cols)
  );
}

export function loadSheetFormat(): SheetFormat {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (valid(stored)) return stored;
  } catch {
    // Missing or unreadable: use the default.
  }
  return DEFAULT_SHEET_FORMAT;
}

export function rememberSheetFormat(sheet: Sheet): void {
  const { size, orientation, rows, cols } = sheet;
  try {
    localStorage.setItem(KEY, JSON.stringify({ size, orientation, rows, cols }));
  } catch {
    // Not remembered: new sheets keep starting from the default.
  }
}

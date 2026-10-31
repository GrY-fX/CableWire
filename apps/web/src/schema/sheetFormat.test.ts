// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createSheet, DEFAULT_SHEET_FORMAT } from '@cablewire/core';
import { loadSheetFormat, rememberSheetFormat } from './sheetFormat.ts';

describe('remembered sheet format', () => {
  afterEach(() => localStorage.clear());

  it('starts from A4 landscape, 10 columns by 6 rows', () => {
    expect(loadSheetFormat()).toEqual({ size: 'A4', orientation: 'landscape', rows: 6, cols: 10 });
  });

  it('returns the last format chosen, without the sheet identity', () => {
    const sheet = { ...createSheet('Motori'), size: 'A3' as const, rows: 8, cols: 12 };
    rememberSheetFormat(sheet);
    expect(loadSheetFormat()).toEqual({ size: 'A3', orientation: 'landscape', rows: 8, cols: 12 });
  });

  it('ignores a damaged value', () => {
    localStorage.setItem('cablewire.sheetFormat', '{"size":"B5","rows":0}');
    expect(loadSheetFormat()).toBe(DEFAULT_SHEET_FORMAT);
  });
});

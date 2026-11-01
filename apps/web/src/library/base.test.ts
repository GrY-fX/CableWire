import { describe, expect, it, vi } from 'vitest';
import { checkSymbol } from '@cablewire/editor';
import { loadBaseSymbols } from './base.ts';

describe('base symbol set', () => {
  it('loads every file without errors, CC0 and with unique ids', () => {
    const error = vi.spyOn(console, 'error');
    const symbols = loadBaseSymbols();
    expect(error).not.toHaveBeenCalled();
    expect(symbols).toHaveLength(26);
    expect(new Set(symbols.map((s) => s.id)).size).toBe(26);
    for (const s of symbols) {
      expect(s.id.startsWith('base-')).toBe(true);
      expect(s.license).toBe('CC0-1.0');
      expect(checkSymbol(s).errors, s.name).toEqual([]);
    }
  });
});

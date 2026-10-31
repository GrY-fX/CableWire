import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { SymbolDef, SymbolId } from '@cablewire/core';
import { newSymbol } from '@cablewire/editor';
import {
  groupByCategory,
  matches,
  NO_CATEGORY,
  prepareSave,
  resolveImport,
  symbolFileName,
} from './logic.ts';
import { SymbolStorage } from './storage.ts';

const sym = (name: string, category: string, extra: Partial<SymbolDef> = {}): SymbolDef => ({
  ...newSymbol(),
  name,
  category,
  ...extra,
});

describe('library logic', () => {
  it('searches name and category ignoring case and accents', () => {
    const s = sym('Contatto di scambio', 'Contatti');
    expect(matches(s, 'SCAMBIO contat')).toBe(true);
    expect(matches(sym('Relè', 'Bobine'), 'rele')).toBe(true);
    expect(matches(s, 'bobina')).toBe(false);
    expect(matches(s, '  ')).toBe(true);
  });

  it('groups by category in alphabetical order', () => {
    const items = [
      sym('Zeta', 'Contatti'),
      sym('Alfa', ''),
      sym('Beta', 'Contatti'),
      sym('Bobina', 'Bobine'),
    ].map((symbol) => ({ symbol, source: 'personal' as const, favorite: false }));
    const groups = groupByCategory(items);
    expect(groups.map((g) => g.name)).toEqual(['Bobine', 'Contatti', NO_CATEGORY]);
    expect(groups[1]!.items.map((i) => i.symbol.name)).toEqual(['Beta', 'Zeta']);
  });

  it('keeps the id on save and bumps the version only on change', () => {
    const base = sym('Contatto NA', 'Contatti', { author: 'CableWire', license: 'CC0-1.0' });
    // A base symbol keeps its id: the saved version replaces the original.
    const edited = prepareSave({ ...base, name: 'Contatto NA rinforzato' }, base);
    expect(edited).toMatchObject({ id: base.id, version: base.version + 1 });
    expect(prepareSave({ ...base }, base)).toBe(base);

    const stored = { ...base, version: 3 };
    expect(prepareSave({ ...stored }, stored)).toBe(stored);
    expect(prepareSave({ ...stored, name: 'Altro' }, stored).version).toBe(4);
    expect(prepareSave(base, undefined)).toBe(base);
  });

  it('resolves import conflicts', () => {
    const s = sym('Lampada', 'Segnalazioni');
    const none = new Set<SymbolId>();
    const mine = new Set([s.id]);
    expect(resolveImport(s, none, none, undefined)).toBe(s);
    expect(resolveImport(s, mine, none, 'replace')).toBe(s);
    expect(resolveImport(s, mine, none, 'skip')).toBeUndefined();
    const both = resolveImport(s, mine, none, 'keep-both')!;
    expect(both.id).not.toBe(s.id);
    expect(both.name).toBe('Lampada (importato)');
    expect(resolveImport(s, none, mine, undefined)!.id).not.toBe(s.id);
  });

  it('builds file names', () => {
    expect(symbolFileName(sym('Contatto NA (copia)', ''))).toBe('contatto-na-copia.cwsym');
    expect(symbolFileName(sym('Relè termico', ''))).toBe('rele-termico.cwsym');
    expect(symbolFileName(sym('***', ''))).toBe('simbolo.cwsym');
  });
});

describe('SymbolStorage', () => {
  it('stores, lists, updates and removes symbols and favourites', async () => {
    const storage = await SymbolStorage.open(`test-${Math.random()}`);
    const a = sym('A', 'X');
    const b = sym('B', 'X');
    await storage.put(a, '2026-01-01');
    await storage.put(b);
    await storage.put({ ...a, name: 'A2' });
    expect((await storage.list()).map((e) => e.symbol.name).sort()).toEqual(['A2', 'B']);
    expect((await storage.get(a.id))?.symbol.name).toBe('A2');

    await storage.setFavorite(a.id, true);
    await storage.setFavorite('base:lamp' as SymbolId, true);
    expect(await storage.favorites()).toEqual(new Set([a.id, 'base:lamp']));

    await storage.remove(a.id);
    expect(await storage.get(a.id)).toBeUndefined();
    expect(await storage.favorites()).toEqual(new Set(['base:lamp']));
    storage.close();
  });
});

import { newId } from '@cablewire/core';
import type { ProjectDoc, SymbolDef, SymbolId } from '@cablewire/core';

export type Source = 'base' | 'personal';

export interface LibraryItem {
  symbol: SymbolDef;
  source: Source;
  favorite: boolean;
  /** Base symbol replaced by the user's own version (it can be restored). */
  modified?: boolean;
}

export interface Category {
  name: string;
  items: LibraryItem[];
}

export const NO_CATEGORY = 'Senza categoria';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Every word of the query must appear in the name or category (accents ignored). */
export function matches(symbol: SymbolDef, query: string): boolean {
  const haystack = normalize(`${symbol.name} ${symbol.category}`);
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** Groups items by category, both sorted alphabetically (Italian collation). */
export function groupByCategory(items: readonly LibraryItem[]): Category[] {
  const groups = new Map<string, LibraryItem[]>();
  for (const item of items) {
    const name = item.symbol.category.trim() || NO_CATEGORY;
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  const collator = new Intl.Collator('it');
  return [...groups.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([name, list]) => ({
      name,
      items: list.sort((a, b) => collator.compare(a.symbol.name, b.symbol.name)),
    }));
}

/** Plain JSON comparison is enough: symbols are JSON data. */
export function sameSymbol(a: SymbolDef, b: SymbolDef): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What to store when the user saves, given the previous version (stored in the
 * library, or the original of a base symbol): unchanged, it stays as it is; changed,
 * its version is bumped. Base symbols keep their id, so they replace the original.
 */
export function prepareSave(symbol: SymbolDef, stored: SymbolDef | undefined): SymbolDef {
  if (!stored) return symbol;
  if (sameSymbol({ ...symbol, version: stored.version }, stored)) return stored;
  return { ...symbol, version: stored.version + 1 };
}

export type ImportChoice = 'replace' | 'keep-both' | 'skip';

/**
 * Symbol to store for an imported file, given the ids already present.
 * Base ids are never overwritten: such a file is always kept as a copy.
 */
export function resolveImport(
  symbol: SymbolDef,
  personalIds: ReadonlySet<SymbolId>,
  baseIds: ReadonlySet<SymbolId>,
  choice: ImportChoice | undefined,
): SymbolDef | undefined {
  if (baseIds.has(symbol.id)) return { ...symbol, id: newId() };
  if (!personalIds.has(symbol.id)) return symbol;
  switch (choice) {
    case 'replace':
      return symbol;
    case 'keep-both':
      return { ...symbol, id: newId(), name: `${symbol.name} (importato)` };
    default:
      return undefined;
  }
}

/** A symbol used in a project for which the library has a newer version. */
export interface OutdatedSymbol {
  project: SymbolDef;
  library: SymbolDef;
  /** Elements of the project using it. */
  uses: number;
}

/**
 * Symbols placed in the project whose library version is newer (higher version,
 * different content). A project copy newer than the library is left alone.
 */
export function outdatedSymbols(
  doc: ProjectDoc,
  find: (id: SymbolId) => SymbolDef | undefined,
): OutdatedSymbol[] {
  const uses = new Map<string, number>();
  for (const e of Object.values(doc.elements))
    uses.set(e.symbolId, (uses.get(e.symbolId) ?? 0) + 1);
  // The project's title block counts as used.
  const block = doc.settings.titleBlock;
  if (block !== undefined) uses.set(block, (uses.get(block) ?? 0) + 1);
  return Object.values(doc.symbols).flatMap((project) => {
    const library = find(project.id);
    const count = uses.get(project.id) ?? 0;
    if (!library || count === 0 || library.version <= project.version) return [];
    return sameSymbol(library, project) ? [] : [{ project, library, uses: count }];
  });
}

/** File name for an exported symbol, e.g. `contatto-na.cwsym`. */
export function symbolFileName(symbol: SymbolDef): string {
  const slug = normalize(symbol.name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'simbolo'}.cwsym`;
}

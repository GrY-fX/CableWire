import { symbolBounds } from '@cablewire/core';
import type { SymbolDef } from '@cablewire/core';
import { TERMINAL_GRID } from './document.ts';

export interface SymbolChecks {
  /** Block saving. */
  errors: string[];
  /** Shown, but saving is allowed. */
  warnings: string[];
}

const onGrid = (v: number) => Math.abs(v / TERMINAL_GRID - Math.round(v / TERMINAL_GRID)) < 1e-6;

/** Problems to show before saving a symbol into the library. */
export function checkSymbol(symbol: SymbolDef): SymbolChecks {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!symbol.name.trim()) errors.push('Il simbolo non ha un nome.');
  const ids = new Set(symbol.terminals.map((t) => t.id));
  if (ids.size !== symbol.terminals.length)
    errors.push('Ci sono terminali con lo stesso identificativo.');
  for (const t of symbol.terminals) {
    if (!onGrid(t.x) || !onGrid(t.y)) {
      errors.push(`Il terminale ${t.name} non è sulla griglia di ${TERMINAL_GRID} mm.`);
    }
  }
  if (symbol.bridges.some(([a, b]) => !ids.has(a) || !ids.has(b))) {
    errors.push('Un collegamento interno usa un terminale inesistente.');
  }

  if (symbol.terminals.length === 0) warnings.push('Il simbolo non ha terminali.');
  const names = symbol.terminals.map((t) => t.name);
  if (new Set(names).size !== names.length) warnings.push('Alcuni terminali hanno lo stesso nome.');
  if (!symbol.graphics.some((p) => p.type === 'text' && p.text.includes('{label}'))) {
    warnings.push('Nessun testo {label}: la sigla non comparirà nello schema.');
  }
  const b = symbolBounds(symbol);
  if (b && Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY)) > 50) {
    warnings.push("Il disegno è lontano dall'origine (punto di inserimento).");
  }
  if (!symbol.category.trim()) warnings.push('Nessuna categoria: sarà difficile ritrovarlo.');
  return { errors, warnings };
}

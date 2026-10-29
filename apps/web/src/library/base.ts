import { parseSymbol } from '@cablewire/formats';
import type { SymbolDef } from '@cablewire/core';

// Base symbols ship with the app as .cwsym files (CC0, see base/README.md).
const files = import.meta.glob('./base/*.cwsym', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The read-only base set, parsed once; a broken file is reported and skipped. */
export function loadBaseSymbols(): SymbolDef[] {
  const symbols: SymbolDef[] = [];
  for (const [path, text] of Object.entries(files)) {
    const result = parseSymbol(text);
    if (result.ok) symbols.push(result.value);
    else console.error(`Base symbol ${path}: ${result.error.message}`, result.error.details);
  }
  return symbols;
}

import { defineCommand, fail, ok } from '../command.ts';
import type { SymbolId } from '../ids.ts';
import type { SymbolDef } from '../model.ts';
import { del, put } from '../ops.ts';

/** Copies a symbol definition into the project, or replaces the existing copy. */
export const importSymbol = defineCommand<{ symbol: SymbolDef }>(
  'Importa simbolo',
  (doc, { symbol }) => {
    const ids = new Set(symbol.terminals.map((t) => t.id));
    if (ids.size !== symbol.terminals.length) {
      return fail('invalid-symbol', 'Terminal ids must be unique');
    }
    if (symbol.bridges.some(([a, b]) => !ids.has(a) || !ids.has(b))) {
      return fail('invalid-symbol', 'A bridge refers to a missing terminal');
    }
    if (doc.symbols[symbol.id]) {
      const placed = new Set(
        Object.values(doc.elements)
          .filter((e) => e.symbolId === symbol.id)
          .map((e) => e.id as string),
      );
      const usesMissingTerminal = Object.values(doc.wires).some((w) =>
        [w.from, w.to].some(
          (end) => 'element' in end && placed.has(end.element) && !ids.has(end.terminal),
        ),
      );
      if (usesMissingTerminal) {
        return fail('terminal-in-use', 'The new version removes a terminal that has wires');
      }
    }
    return ok([put('symbols', symbol)]);
  },
);

export const removeSymbol = defineCommand<{ id: SymbolId }>('Rimuovi simbolo', (doc, { id }) => {
  if (!doc.symbols[id]) return fail('not-found', 'Symbol not found');
  if (Object.values(doc.elements).some((e) => e.symbolId === id)) {
    return fail('in-use', 'The symbol is used in the project');
  }
  return ok([del('symbols', id)]);
});

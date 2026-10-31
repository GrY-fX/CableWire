import type { Command } from './command.ts';
import type { SymbolId, TerminalId } from './ids.ts';
import type { ProjectDoc, SheetFormat, SymbolDef } from './model.ts';
import { createEmptyProject, DEFAULT_SHEET_FORMAT } from './model.ts';
import { createStore } from './store.ts';
import type { Store, StoreOptions } from './store.ts';
import { importSymbol } from './commands/symbols.ts';

/** Tests use A3 sheets, the default before A4: their coordinates depend on it. */
export const A3: SheetFormat = { ...DEFAULT_SHEET_FORMAT, size: 'A3' };

export const T1 = 't1' as TerminalId;
export const T2 = 't2' as TerminalId;

/** Two-terminal symbol: T1 on top (0,-5), T2 at the bottom (0,5). */
export function twoTerminalSymbol(id: string, overrides: Partial<SymbolDef> = {}): SymbolDef {
  return {
    id: id as SymbolId,
    name: id,
    category: 'test',
    kind: 'simple',
    graphics: [{ type: 'line', x1: 0, y1: -5, x2: 0, y2: 5 }],
    terminals: [
      { id: T1, name: '1', x: 0, y: -5, dir: 'n' },
      { id: T2, name: '2', x: 0, y: 5, dir: 's' },
    ],
    bridges: [],
    defaultInfo: { label: '' },
    version: 1,
    ...overrides,
  };
}

export const CONTACT = twoTerminalSymbol('contact', { defaultInfo: { label: 'K' } });
/** Feed-through terminal: both sides are the same potential. */
export const TERMINAL = twoTerminalSymbol('terminal', { kind: 'terminal', bridges: [[T1, T2]] });

/** Expects a successful command; throws with the error otherwise. */
export function must<A>(store: Store, command: Command<A>, args: A): void {
  const result = store.run(command, args);
  if (!result.ok) throw new Error(`${command.label}: ${result.error.message}`);
}

/** A validating store with CONTACT and TERMINAL imported (two undo entries). */
export function setup(options: StoreOptions = {}): {
  store: Store;
  sheet: ProjectDoc['sheetOrder'][number];
} {
  const store = createStore(createEmptyProject('test', '2026-01-01T00:00:00.000Z', A3), {
    checkInvariants: true,
    ...options,
  });
  must(store, importSymbol, { symbol: CONTACT });
  must(store, importSymbol, { symbol: TERMINAL });
  return { store, sheet: store.doc.sheetOrder[0]! };
}

import {
  addWire,
  createEmptyProject,
  DEFAULT_SHEET_FORMAT,
  createStore,
  importSymbol,
  placeElement,
  setWireBends,
  setWireProps,
  splitWire,
  updateProjectMeta,
} from '@cablewire/core';
import type {
  Command,
  ElementId,
  JunctionId,
  Store,
  SymbolDef,
  SymbolId,
  TerminalId,
  WireId,
} from '@cablewire/core';

export const T1 = 't1' as TerminalId;
export const T2 = 't2' as TerminalId;

export const COIL: SymbolDef = {
  id: 'coil' as SymbolId,
  name: 'Bobina',
  category: 'test',
  kind: 'master',
  graphics: [
    { type: 'line', x1: 0, y1: -5, x2: 0, y2: -2.5 },
    { type: 'rect', x: -3, y: -2.5, width: 6, height: 5 },
    { type: 'line', x1: 0, y1: 2.5, x2: 0, y2: 5 },
    { type: 'text', x: 4.5, y: 0, text: '{label}', size: 2.5 },
  ],
  terminals: [
    { id: T1, name: 'A1', x: 0, y: -5, dir: 'n' },
    { id: T2, name: 'A2', x: 0, y: 5, dir: 's' },
  ],
  bridges: [],
  defaultInfo: { label: 'K' },
  version: 1,
};

export function must<A>(store: Store, command: Command<A>, args: A): void {
  const result = store.run(command, args);
  if (!result.ok) throw new Error(`${command.label}: ${result.error.message}`);
}

export const K1 = 'k1' as ElementId;
export const K2 = 'k2' as ElementId;
export const W1 = 'w1' as WireId;
export const J1 = 'j1' as JunctionId;

/** K1 at (50,50) and K2 at (80,80), wired K1.A2 → bend (50,80) → K2.A1. */
export function fixture() {
  const store = createStore(
    createEmptyProject('Impianto', '2026-10-29T10:00:00.000Z', {
      ...DEFAULT_SHEET_FORMAT,
      size: 'A3',
    }),
    {
      checkInvariants: true,
    },
  );
  const sheet = store.doc.sheetOrder[0]!;
  must(store, updateProjectMeta, { set: { author: 'G.' } });
  must(store, importSymbol, { symbol: COIL });
  must(store, placeElement, {
    id: K1,
    sheetId: sheet,
    symbolId: COIL.id,
    x: 50,
    y: 50,
    info: { label: 'KM1' },
  });
  must(store, placeElement, {
    id: K2,
    sheetId: sheet,
    symbolId: COIL.id,
    x: 80,
    y: 80,
    rotation: 180,
    info: { label: 'KM2' },
  });
  must(store, addWire, {
    id: W1,
    from: { element: K1, terminal: T2 },
    to: { element: K2, terminal: T2 },
  });
  must(store, setWireBends, {
    id: W1,
    bends: [
      { x: 50, y: 75 },
      { x: 80, y: 75 },
    ],
  });
  must(store, setWireProps, { id: W1, set: { number: '12' } });
  return {
    store,
    sheet,
    split: () => must(store, splitWire, { id: W1, at: { x: 60, y: 75 }, junctionId: J1 }),
  };
}

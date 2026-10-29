import {
  addSheet,
  addWire,
  createEmptyProject,
  createStore,
  importSymbol,
  placeElement,
  setWireProps,
  splitWire,
  updateProjectMeta,
} from '@cablewire/core';
import type {
  Command,
  ElementId,
  JunctionId,
  ProjectDoc,
  SheetId,
  Store,
  SymbolDef,
  SymbolId,
  TerminalId,
  WireId,
} from '@cablewire/core';

export const T1 = 't1' as TerminalId;
export const T2 = 't2' as TerminalId;

/** Uses every primitive kind and optional field, to exercise the schema. */
export const RICH_SYMBOL: SymbolDef = {
  id: 'rich' as SymbolId,
  name: 'Morsetto doppio',
  category: 'Morsetti',
  kind: 'terminal',
  graphics: [
    { type: 'line', x1: 0, y1: -5, x2: 0, y2: -1.25 },
    {
      type: 'polyline',
      points: [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      closed: true,
      filled: true,
    },
    { type: 'arc', cx: 0, cy: 0, r: 2, start: 180, sweep: 180 },
    { type: 'circle', cx: 0, cy: 0, r: 1.25 },
    { type: 'rect', x: -2.5, y: -2.5, width: 5, height: 5, filled: false },
    { type: 'text', x: 3, y: 0, text: '{label}', size: 2.5, anchor: 'start' },
  ],
  terminals: [
    { id: T1, name: '1', x: 0, y: -5, dir: 'n' },
    { id: T2, name: '2', x: 0, y: 5, dir: 's' },
  ],
  bridges: [[T1, T2]],
  defaultInfo: { label: 'X1' },
  version: 3,
};

function must<A>(store: Store, command: Command<A>, args: A): void {
  const result = store.run(command, args);
  if (!result.ok) throw new Error(`${command.label}: ${result.error.message}`);
}

/** Deterministic two-sheet project (fixed ids and dates) used for fixtures and round trips. */
export function sampleProject(): ProjectDoc {
  const base = createEmptyProject('Quadro pompa', '2026-10-29T10:00:00.000Z');
  const first = base.sheetOrder[0]!;
  const sheet1 = 'sheet-1' as SheetId;
  const store = createStore(
    {
      ...base,
      sheetOrder: [sheet1],
      sheets: { [sheet1]: { ...base.sheets[first]!, id: sheet1 } } as ProjectDoc['sheets'],
    },
    { checkInvariants: true },
  );
  must(store, updateProjectMeta, { set: { author: 'Giuseppe' } });
  must(store, addSheet, { id: 'sheet-2' as SheetId, title: 'Potenza' });
  must(store, importSymbol, { symbol: RICH_SYMBOL });
  const place = (id: string, x: number, y: number, extra = {}) =>
    must(store, placeElement, {
      id: id as ElementId,
      sheetId: sheet1,
      symbolId: RICH_SYMBOL.id,
      x,
      y,
      ...extra,
    });
  place('x1', 20, 20, { info: { label: 'X1:1', plc_address: 'I0.0' } });
  place('x2', 20.1 + 0.2, 40, { rotation: 90, mirrored: true }); // 20.3 exercises rounding
  place('x3', 40, 40);
  must(store, addWire, {
    id: 'w1' as WireId,
    from: { element: 'x1' as ElementId, terminal: T2 },
    to: { element: 'x2' as ElementId, terminal: T1 },
    bends: [{ x: 20, y: 30 }],
  });
  must(store, setWireProps, {
    id: 'w1' as WireId,
    set: { number: '101', section: '1.5', color: 'BU' },
  });
  must(store, splitWire, {
    id: 'w1' as WireId,
    at: { x: 20, y: 28 },
    junctionId: 'j1' as JunctionId,
    newWireId: 'w2' as WireId,
  });
  must(store, addWire, {
    id: 'w3' as WireId,
    from: { junction: 'j1' as JunctionId },
    to: { element: 'x3' as ElementId, terminal: T1 },
  });
  return store.doc;
}

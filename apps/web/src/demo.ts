import {
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
  Primitive,
  Store,
  SymbolDef,
  SymbolId,
  TerminalId,
  WireId,
} from '@cablewire/core';

// Temporary sample symbols and circuit to check the renderer by eye; the real
// base library comes with the symbol editor (phase 1, step 4).

const T1 = 't1' as TerminalId;
const T2 = 't2' as TerminalId;

function symbol(
  id: string,
  name: string,
  graphics: Primitive[],
  extra: Partial<SymbolDef> = {},
): SymbolDef {
  return {
    id: id as SymbolId,
    name,
    category: 'demo',
    kind: 'simple',
    graphics,
    terminals: [
      { id: T1, name: '1', x: 0, y: -5, dir: 'n' },
      { id: T2, name: '2', x: 0, y: 5, dir: 's' },
    ],
    bridges: [],
    defaultInfo: { label: '' },
    version: 1,
    ...extra,
  };
}

const leads: Primitive[] = [
  { type: 'line', x1: 0, y1: -5, x2: 0, y2: -2.5 },
  { type: 'line', x1: 0, y1: 2.5, x2: 0, y2: 5 },
];
const pushActuator: Primitive[] = [
  { type: 'line', x1: -1.5, y1: 0, x2: -5, y2: 0 },
  { type: 'line', x1: -5, y1: -1.5, x2: -5, y2: 1.5 },
];

const NO_CONTACT = symbol(
  'no-contact',
  'Contatto NA',
  [
    ...leads,
    { type: 'line', x1: 0, y1: 2.5, x2: -2.5, y2: -3 },
    { type: 'text', x: 2, y: 0, text: '{label}', size: 2.5 },
  ],
  { kind: 'slave' },
);
const NO_BUTTON = symbol('no-button', 'Pulsante NA', [...NO_CONTACT.graphics, ...pushActuator]);
const NC_BUTTON = symbol('nc-button', 'Pulsante NC', [
  ...leads,
  { type: 'line', x1: 0, y1: 2.5, x2: 2.5, y2: -3 },
  { type: 'line', x1: 0, y1: -2.5, x2: 3, y2: -2.5 },
  ...pushActuator,
  { type: 'text', x: 4.5, y: 0, text: '{label}', size: 2.5 },
]);
const COIL = symbol(
  'coil',
  'Bobina',
  [
    ...leads,
    { type: 'rect', x: -3, y: -2.5, width: 6, height: 5 },
    { type: 'text', x: 4.5, y: 0, text: '{label}', size: 2.5 },
    { type: 'text', x: 4.5, y: 3, text: '{function}', size: 2 },
  ],
  { kind: 'master' },
);
const TERMINAL = symbol(
  'terminal',
  'Morsetto',
  [
    { type: 'line', x1: 0, y1: -5, x2: 0, y2: -1.25 },
    { type: 'circle', cx: 0, cy: 0, r: 1.25 },
    { type: 'line', x1: 0, y1: 1.25, x2: 0, y2: 5 },
    { type: 'text', x: 2.5, y: 0, text: '{label}', size: 2.5 },
  ],
  { kind: 'terminal', bridges: [[T1, T2]] },
);

function must<A>(store: Store, command: Command<A>, args: A): void {
  const result = store.run(command, args);
  if (!result.ok) throw new Error(`${command.label}: ${result.error.message}`);
}

/** Start/stop circuit with self-holding contact: X1:1 – S1 – (S2 ∥ KM1) – KM1 coil – X1:2. */
export function createDemo() {
  const store = createStore(createEmptyProject('Demo marcia/arresto'));
  const sheetId = store.doc.sheetOrder[0]!;
  must(store, updateProjectMeta, { set: { author: 'CableWire' } });
  for (const s of [NO_CONTACT, NO_BUTTON, NC_BUTTON, COIL, TERMINAL]) {
    must(store, importSymbol, { symbol: s });
  }

  const place = (
    id: string,
    symbolId: SymbolId,
    x: number,
    y: number,
    info: Record<string, string>,
  ) => must(store, placeElement, { id: id as ElementId, sheetId, symbolId, x, y, info });
  place('x1', TERMINAL.id, 60, 40, { label: 'X1:1' });
  place('s1', NC_BUTTON.id, 60, 60, { label: 'S1' });
  place('s2', NO_BUTTON.id, 60, 80, { label: 'S2' });
  place('km1c', NO_CONTACT.id, 80, 80, { label: 'KM1' });
  place('km1', COIL.id, 60, 105, { label: 'KM1', function: 'Motore pompa' });
  place('x2', TERMINAL.id, 60, 125, { label: 'X1:2' });

  const wire = (
    id: string,
    from: string,
    ft: TerminalId,
    to: string,
    tt: TerminalId,
    number: string,
  ) => {
    must(store, addWire, {
      id: id as WireId,
      from: { element: from as ElementId, terminal: ft },
      to: { element: to as ElementId, terminal: tt },
    });
    must(store, setWireProps, { id: id as WireId, set: { number } });
  };
  wire('w1', 'x1', T2, 's1', T1, '1');
  wire('w2', 's1', T2, 's2', T1, '2');
  wire('w3', 's2', T2, 'km1', T1, '3');
  wire('w4', 'km1', T2, 'x2', T1, '4');

  // Self-holding contact in parallel with S2, via two T branches.
  const branch = (
    wireId: string,
    y: number,
    junction: string,
    newWire: string,
    terminal: TerminalId,
  ) => {
    must(store, splitWire, {
      id: wireId as WireId,
      at: { x: 60, y },
      junctionId: junction as JunctionId,
      newWireId: `${newWire}-split` as WireId,
    });
    must(store, addWire, {
      id: newWire as WireId,
      from: { junction: junction as JunctionId },
      to: { element: 'km1c' as ElementId, terminal },
      bends: [{ x: 80, y }],
    });
  };
  branch('w2', 70, 'j1', 'w5', T1);
  branch('w3', 90, 'j2', 'w6', T2);

  return { store, sheetId };
}

import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId, JunctionId, SheetId, WireId } from '../ids.ts';
import { newId } from '../ids.ts';
import type { Sheet } from '../model.ts';
import { createSheet } from '../model.ts';
import type { Patch } from '../ops.ts';
import { del, meta, patch, put } from '../ops.ts';
import { removeOps } from './remove.ts';

export const addSheet = defineCommand<{ id?: SheetId; title?: string; index?: number }>(
  'Aggiungi foglio',
  (doc, { id = newId(), title, index = doc.sheetOrder.length }) => {
    if (doc.sheets[id]) return fail('exists', 'A sheet with this id already exists');
    const sheet = createSheet(title ?? String(doc.sheetOrder.length + 1), id);
    const sheetOrder = [...doc.sheetOrder];
    sheetOrder.splice(index, 0, id);
    return ok([put('sheets', sheet), meta({ sheetOrder })]);
  },
);

export const removeSheet = defineCommand<{ id: SheetId }>('Elimina foglio', (doc, { id }) => {
  if (!doc.sheets[id]) return fail('not-found', 'Sheet not found');
  if (doc.sheetOrder.length <= 1) return fail('last-sheet', 'A project needs at least one sheet');
  const on = <T extends { sheetId: SheetId; id: string }>(rows: Record<string, T>) =>
    Object.values(rows)
      .filter((row) => row.sheetId === id)
      .map((row) => row.id);
  const contents = removeOps(doc, {
    elements: on(doc.elements) as ElementId[],
    wires: on(doc.wires) as WireId[],
    junctions: on(doc.junctions) as JunctionId[],
  });
  return ok([
    ...contents,
    del('sheets', id),
    meta({ sheetOrder: doc.sheetOrder.filter((s) => s !== id) }),
  ]);
});

export const updateSheet = defineCommand<{ id: SheetId; set: Patch<Sheet> }>(
  'Modifica foglio',
  (doc, { id, set }) => {
    if (!doc.sheets[id]) return fail('not-found', 'Sheet not found');
    return ok([patch('sheets', id, set)]);
  },
);

export const moveSheet = defineCommand<{ id: SheetId; index: number }>(
  'Sposta foglio',
  (doc, { id, index }) => {
    const from = doc.sheetOrder.indexOf(id);
    if (from < 0) return fail('not-found', 'Sheet not found');
    const sheetOrder = doc.sheetOrder.filter((s) => s !== id);
    sheetOrder.splice(Math.max(0, Math.min(index, sheetOrder.length)), 0, id);
    return ok([meta({ sheetOrder })]);
  },
);

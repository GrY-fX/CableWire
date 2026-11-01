import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId, JunctionId, SheetId, WireId } from '../ids.ts';
import { newId } from '../ids.ts';
import type { Sheet, SheetFormat, TerminalStrip } from '../model.ts';
import { createSheet } from '../model.ts';
import type { Patch } from '../ops.ts';
import { del, meta, patch, put } from '../ops.ts';
import { getStrips, stripName, terminalsOf } from '../strips.ts';
import { removeOps } from './remove.ts';

export const addSheet = defineCommand<{
  id?: SheetId;
  title?: string;
  index?: number;
  format?: SheetFormat;
}>('Aggiungi foglio', (doc, { id = newId(), title, index = doc.sheetOrder.length, format }) => {
  if (doc.sheets[id]) return fail('exists', 'A sheet with this id already exists');
  const sheet = createSheet(title ?? String(doc.sheetOrder.length + 1), id, format);
  const sheetOrder = [...doc.sheetOrder];
  sheetOrder.splice(index, 0, id);
  return ok([put('sheets', sheet), meta({ sheetOrder })]);
});

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
  // Strips named after this sheet: kept with their name if used elsewhere, else removed.
  const strips = getStrips(doc).flatMap((strip): TerminalStrip[] => {
    if (strip.mode !== 'sheet' || strip.sheetId !== id) return [strip];
    const elsewhere = terminalsOf(doc, strip.id).some((t) => t.sheetId !== id);
    return elsewhere ? [{ id: strip.id, mode: 'custom', name: stripName(doc, strip) }] : [];
  });
  const changedStrips =
    strips.length !== getStrips(doc).length || strips.some((s, i) => s !== getStrips(doc)[i]);
  return ok([
    ...contents,
    del('sheets', id),
    meta({ sheetOrder: doc.sheetOrder.filter((s) => s !== id) }),
    ...(changedStrips ? [meta({ settings: { ...doc.settings, terminalStrips: strips } })] : []),
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

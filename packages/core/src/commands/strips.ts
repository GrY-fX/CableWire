import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId, SheetId } from '../ids.ts';
import type { ProjectDoc, TerminalStrip } from '../model.ts';
import type { Op } from '../ops.ts';
import { meta, patch } from '../ops.ts';
import {
  findStrip,
  getStrips,
  isTerminal,
  newStripId,
  nextTerminalNo,
  renumberTerminalsOps,
  stripName,
  terminalLabel,
  terminalsOf,
} from '../strips.ts';

const setStrips = (doc: ProjectDoc, terminalStrips: TerminalStrip[]): Op =>
  meta({ settings: { ...doc.settings, terminalStrips } });

/** Whether another strip already has this name. */
function nameTaken(doc: ProjectDoc, name: string, except?: string): boolean {
  return getStrips(doc).some((s) => s.id !== except && stripName(doc, s) === name);
}

/** Adds a strip: named from the pattern on a sheet, or with a name of its own. */
export const addStrip = defineCommand<{
  id?: string;
  mode: 'sheet' | 'custom';
  sheetId?: SheetId;
  name?: string;
}>('Nuova morsettiera', (doc, { id = newStripId(doc), mode, sheetId, name }) => {
  if (findStrip(doc, id)) return fail('exists', 'A strip with this id already exists');
  let strip: TerminalStrip;
  if (mode === 'sheet') {
    if (!sheetId || !doc.sheets[sheetId]) return fail('not-found', 'Sheet not found');
    strip = { id, mode, sheetId };
  } else {
    const value = name?.trim() ?? '';
    if (!value) return fail('invalid-name', 'Scrivi il nome della morsettiera.');
    if (nameTaken(doc, value)) return fail('exists', `C'è già una morsettiera «${value}».`);
    strip = { id, mode, name: value };
  }
  return ok([setStrips(doc, [...getStrips(doc), strip])]);
});

/**
 * Renames a custom strip, or changes its mode: a sheet strip turning custom keeps the
 * name it had; a custom strip turning into a sheet strip needs the sheet.
 */
export const updateStrip = defineCommand<{
  id: string;
  mode?: 'sheet' | 'custom';
  name?: string;
  sheetId?: SheetId;
}>('Modifica morsettiera', (doc, { id, mode, name, sheetId }) => {
  const strip = findStrip(doc, id);
  if (!strip) return fail('not-found', 'Strip not found');
  const nextMode = mode ?? strip.mode;
  let next: TerminalStrip;
  if (nextMode === 'custom') {
    const value = (
      name ??
      (strip.mode === 'custom' ? strip.name : stripName(doc, strip)) ??
      ''
    ).trim();
    if (!value) return fail('invalid-name', 'Scrivi il nome della morsettiera.');
    if (nameTaken(doc, value, id)) return fail('exists', `C'è già una morsettiera «${value}».`);
    next = { id, mode: 'custom', name: value };
  } else {
    const sheet = sheetId ?? strip.sheetId;
    if (!sheet || !doc.sheets[sheet]) return fail('not-found', 'Sheet not found');
    next = { id, mode: 'sheet', sheetId: sheet };
  }
  return ok([
    setStrips(
      doc,
      getStrips(doc).map((s) => (s.id === id ? next : s)),
    ),
  ]);
});

/** Removes a strip; its terminals keep their current label, written by hand. */
export const removeStrip = defineCommand<{ id: string }>('Elimina morsettiera', (doc, { id }) => {
  if (!findStrip(doc, id)) return fail('not-found', 'Strip not found');
  const ops: Op[] = terminalsOf(doc, id).map((t) =>
    patch('elements', t.id, {
      strip: undefined,
      terminalNo: undefined,
      info: { ...t.info, label: terminalLabel(doc, t) },
    }),
  );
  ops.push(
    setStrips(
      doc,
      getStrips(doc).filter((s) => s.id !== id),
    ),
  );
  return ok(ops);
});

/** Puts a terminal in a strip (with the strip's first free number), or takes it out. */
export const setTerminalStrip = defineCommand<{ id: ElementId; strip: string | undefined }>(
  'Morsettiera del morsetto',
  (doc, { id, strip }) => {
    const e = doc.elements[id];
    if (!e) return fail('not-found', 'Element not found');
    if (!isTerminal(doc, e)) return fail('invalid', 'Solo i morsetti stanno in una morsettiera.');
    if (strip === e.strip) return ok([]);
    if (strip === undefined) {
      const info = { ...e.info, label: terminalLabel(doc, e) };
      return ok([patch('elements', id, { strip: undefined, terminalNo: undefined, info })]);
    }
    if (!findStrip(doc, strip)) return fail('not-found', 'Strip not found');
    return ok([patch('elements', id, { strip, terminalNo: nextTerminalNo(doc, strip) })]);
  },
);

/** Sets the number of a terminal in its strip; empty gives the first free one. */
export const setTerminalNo = defineCommand<{ id: ElementId; no: string }>(
  'Numero del morsetto',
  (doc, { id, no }) => {
    const e = doc.elements[id];
    if (!e?.strip) return fail('not-found', 'Terminal not in a strip');
    const value = no.trim() || nextTerminalNo(doc, e.strip);
    return ok(value === e.terminalNo ? [] : [patch('elements', id, { terminalNo: value })]);
  },
);

/** Renumbers the terminals of one strip, or of all, in reading order. */
export const renumberTerminals = defineCommand<{ strip?: string }>(
  'Ricalcola morsetti',
  (doc, { strip }) => {
    if (strip !== undefined && !findStrip(doc, strip)) return fail('not-found', 'Strip not found');
    return ok(renumberTerminalsOps(doc, strip));
  },
);

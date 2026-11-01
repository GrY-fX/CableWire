import { autoNumberOps, renumberOps } from '../autonumber/allocate.ts';
import { checkPlcPattern, parsePattern } from '../autonumber/rule.ts';
import { defineCommand, fail, ok } from '../command.ts';
import type { SheetId, WireId } from '../ids.ts';
import type { NumberingSettings } from '../model.ts';
import { getNumbering } from '../model.ts';
import { renumberLabelsOps } from '../labels.ts';
import { meta } from '../ops.ts';

/** Changes the project's numbering settings; an invalid pattern is refused. */
export const updateNumbering = defineCommand<{ set: Partial<NumberingSettings> }>(
  'Impostazioni numerazione',
  (doc, { set }) => {
    const numbering = { ...getNumbering(doc), ...set };
    const parsed = parsePattern(numbering.pattern);
    if (!parsed.ok) return fail('invalid-pattern', parsed.error);
    const plcError = numbering.plcPattern ? checkPlcPattern(numbering.plcPattern) : undefined;
    if (plcError) return fail('invalid-pattern', plcError);
    return ok([meta({ settings: { ...doc.settings, numbering } })]);
  },
);

/** Numbers the potential of a wire if automatic numbering is on and it has no number. */
export const autoNumberPotential = defineCommand<{ id: WireId }>('Numera filo', (doc, { id }) => {
  if (!doc.wires[id]) return fail('not-found', 'Wire not found');
  return ok(autoNumberOps(doc, id));
});

/** Renumbers automatic labels (e.g. {foglio}K{n}) on a sheet or in the whole project. */
export const renumberLabels = defineCommand<{ sheetId?: SheetId }>(
  'Ricalcola sigle',
  (doc, { sheetId }) => {
    if (sheetId !== undefined && !doc.sheets[sheetId]) return fail('not-found', 'Sheet not found');
    return ok(renumberLabelsOps(doc, sheetId));
  },
);

/** Renumbers a sheet (or the whole project), keeping locked numbers. */
export const renumber = defineCommand<{ sheetId?: SheetId }>(
  'Ricalcola numerazione',
  (doc, { sheetId }) => {
    if (sheetId !== undefined && !doc.sheets[sheetId]) return fail('not-found', 'Sheet not found');
    if (!parsePattern(getNumbering(doc).pattern).ok) {
      return fail('invalid-pattern', 'Il modello di numerazione non è valido.');
    }
    return ok(renumberOps(doc, sheetId));
  },
);

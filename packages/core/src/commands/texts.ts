import { defineCommand, fail, ok } from '../command.ts';
import { addRotation } from '../geometry.ts';
import type { SheetId, TextId } from '../ids.ts';
import { newId } from '../ids.ts';
import type { Rotation, SheetText } from '../model.ts';
import type { Op, Patch } from '../ops.ts';
import { patch, put } from '../ops.ts';
import { DEFAULT_TEXT_SIZE } from '../texts.ts';

/** Places a free text on a sheet. */
export const addText = defineCommand<{
  id?: TextId;
  sheetId: SheetId;
  x: number;
  y: number;
  text?: string;
  size?: number;
}>('Inserisci testo', (doc, { id = newId(), sheetId, x, y, text = 'Testo', size }) => {
  if (!doc.sheets[sheetId]) return fail('not-found', 'Sheet not found');
  if (doc.texts[id]) return fail('exists', 'A text with this id already exists');
  const value: SheetText = { id, sheetId, x, y, text, size: size ?? DEFAULT_TEXT_SIZE };
  return ok([put('texts', value)]);
});

/** Changes a free text; a field set to `undefined` is removed (back to its default). */
export const updateText = defineCommand<{ id: TextId; set: Patch<SheetText> }>(
  'Modifica testo',
  (doc, { id, set }) => {
    if (!doc.texts[id]) return fail('not-found', 'Text not found');
    if (set.size !== undefined && !(set.size > 0)) return fail('invalid', 'Altezza non valida');
    return ok([patch('texts', id, set)]);
  },
);

/** Turns free texts clockwise (they stay readable). */
export const rotateTexts = defineCommand<{ ids: readonly TextId[]; by: Rotation }>(
  'Ruota testo',
  (doc, { ids, by }) => {
    const ops: Op[] = [];
    for (const id of ids) {
      const t = doc.texts[id];
      if (!t) return fail('not-found', `Text ${id} not found`);
      const rotation = addRotation(t.rotation ?? 0, by);
      ops.push(patch('texts', id, { rotation: rotation || undefined }));
    }
    return ok(ops);
  },
);

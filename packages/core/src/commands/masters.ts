import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId } from '../ids.ts';
import { isMaster, isSlave, mastersWithLabel } from '../masters.ts';
import { patch } from '../ops.ts';

/** Links a contact to a coil; the contact takes the coil's label. */
export const linkSlave = defineCommand<{ slave: ElementId; master: ElementId }>(
  'Collega contatto',
  (doc, { slave, master }) => {
    const s = doc.elements[slave];
    const m = doc.elements[master];
    if (!s || !m) return fail('not-found', 'Element not found');
    if (!isSlave(doc, s) || !isMaster(doc, m)) {
      return fail('invalid-link', 'Si collega solo un contatto a una bobina.');
    }
    const label = m.info['label'] ?? '';
    return ok([patch('elements', slave, { link: master, info: { ...s.info, label } })]);
  },
);

/** Unlinks a contact from its coil; it keeps the label it had. */
export const unlinkSlave = defineCommand<{ slave: ElementId }>(
  'Scollega contatto',
  (doc, { slave }) => {
    const s = doc.elements[slave];
    if (!s) return fail('not-found', 'Element not found');
    return ok(s.link === undefined ? [] : [patch('elements', slave, { link: undefined })]);
  },
);

/**
 * Sets the label of a contact. The label of exactly one coil links the contact to
 * that coil; any other label unlinks it (with several coils of that label it is left
 * unlinked: the caller tells the user).
 */
export const setSlaveLabel = defineCommand<{ slave: ElementId; label: string }>(
  'Sigla contatto',
  (doc, { slave, label }) => {
    const s = doc.elements[slave];
    if (!s) return fail('not-found', 'Element not found');
    const value = label.trim();
    const masters = mastersWithLabel(doc, value);
    const info = { ...s.info, label: value };
    if (masters.length === 1) {
      return ok([patch('elements', slave, { link: masters[0]!.id, info })]);
    }
    return ok([patch('elements', slave, { link: undefined, info })]);
  },
);

import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId } from '../ids.ts';
import { inheritNumberOps } from '../numbering.ts';
import type { Op } from '../ops.ts';
import { applyOps, patch } from '../ops.ts';
import { canLink, linkedReport, reportWires } from '../references.ts';

/**
 * Links two references (one incoming, one outgoing). Previous partners of either are
 * unlinked. The joined potential takes the number of the side that has one; two
 * different numbers are left as they are and show up as a conflict.
 */
export const linkReports = defineCommand<{ a: ElementId; b: ElementId }>(
  'Collega rimandi',
  (doc, { a, b }) => {
    const ea = doc.elements[a];
    const eb = doc.elements[b];
    if (!ea || !eb) return fail('not-found', 'Element not found');
    if (!canLink(doc, ea, eb)) {
      return fail('invalid-link', 'Si collega solo un rimando in entrata con uno in uscita.');
    }
    if (linkedReport(doc, ea)?.id === b) return ok([]);
    const ops: Op[] = [];
    for (const e of [ea, eb]) {
      const old = e.link && doc.elements[e.link];
      if (old && old.link === e.id && old.id !== a && old.id !== b) {
        ops.push(patch('elements', old.id, { link: undefined }));
      }
    }
    ops.push(patch('elements', a, { link: b }), patch('elements', b, { link: a }));
    const after = applyOps(doc, ops).doc;
    const wire = reportWires(after, after.elements[a]!)[0];
    if (wire) ops.push(...inheritNumberOps(after, wire));
    return ok(ops);
  },
);

/** Unlinks a reference from its partner; both sides keep their wire numbers. */
export const unlinkReport = defineCommand<{ id: ElementId }>('Scollega rimando', (doc, { id }) => {
  const element = doc.elements[id];
  if (!element) return fail('not-found', 'Element not found');
  const ops: Op[] = [];
  if (element.link !== undefined) ops.push(patch('elements', id, { link: undefined }));
  const partner = element.link && doc.elements[element.link];
  if (partner && partner.link === id) ops.push(patch('elements', partner.id, { link: undefined }));
  return ok(ops);
});

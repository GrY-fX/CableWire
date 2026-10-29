import { describe, expect, it } from 'vitest';
import type { ElementId } from './ids.ts';
import { createEmptyProject } from './model.ts';
import type { Element } from './model.ts';
import { applyOps, del, meta, patch, put } from './ops.ts';
import { CONTACT } from './test-utils.ts';

const base = createEmptyProject('t', '2026-01-01T00:00:00.000Z');
const sheetId = base.sheetOrder[0]!;
const element: Element = {
  id: 'e1' as ElementId,
  sheetId,
  symbolId: CONTACT.id,
  x: 10,
  y: 20,
  rotation: 0,
  mirrored: false,
  info: {},
};

describe('applyOps', () => {
  it('applies put, patch, delete and meta, and the inverse restores the original', () => {
    const start = applyOps(base, [put('symbols', CONTACT), put('elements', element)]).doc;
    const ops = [
      patch('elements', element.id, { x: 30, link: 'other' as ElementId }),
      meta({ settings: { gridStep: 5 } }),
      patch('elements', element.id, { link: undefined }),
      del('symbols', CONTACT.id),
    ];
    const { doc, inverse, changes } = applyOps(start, ops);

    expect(doc.elements[element.id]).toEqual({ ...element, x: 30 });
    expect('link' in doc.elements[element.id]!).toBe(false);
    expect(doc.settings.gridStep).toBe(5);
    expect(doc.symbols[CONTACT.id]).toBeUndefined();
    expect(changes).toHaveLength(4);

    expect(applyOps(doc, inverse).doc).toEqual(start);
  });

  it('does not modify the input and shares untouched tables', () => {
    const snapshot = JSON.stringify(base);
    const { doc } = applyOps(base, [put('elements', element)]);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(doc.sheets).toBe(base.sheets);
    expect(doc.elements).not.toBe(base.elements);
  });

  it('inverts a put that replaces an existing row', () => {
    const start = applyOps(base, [put('elements', element)]).doc;
    const { doc, inverse } = applyOps(start, [put('elements', { ...element, x: 99 })]);
    expect(doc.elements[element.id]!.x).toBe(99);
    expect(applyOps(doc, inverse).doc.elements[element.id]).toEqual(element);
  });

  it('throws on patch or delete of a missing row', () => {
    expect(() => applyOps(base, [patch('elements', element.id, { x: 1 })])).toThrow();
    expect(() => applyOps(base, [del('elements', element.id)])).toThrow();
  });
});

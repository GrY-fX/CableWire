import { describe, expect, it } from 'vitest';
import type { ElementId } from './ids.ts';
import { endPosition, snap, transformDirection, transformPoint } from './geometry.ts';
import { placeElement } from './commands/elements.ts';
import { CONTACT, T1, T2, must, setup } from './test-utils.ts';

describe('geometry', () => {
  it('rotates clockwise on screen and mirrors horizontally', () => {
    const p = { x: 2, y: 1 };
    expect(transformPoint(p, 90, false)).toEqual({ x: -1, y: 2 });
    expect(transformPoint(p, 180, false)).toEqual({ x: -2, y: -1 });
    expect(transformPoint(p, 270, false)).toEqual({ x: 1, y: -2 });
    expect(transformPoint(p, 0, true)).toEqual({ x: -2, y: 1 });
    expect(transformDirection('n', 90, false)).toBe('e');
    expect(transformDirection('e', 0, true)).toBe('w');
    expect(transformDirection('w', 270, false)).toBe('s');
  });

  it('snaps to the grid', () => {
    expect(snap(3.7, 2.5)).toBe(2.5);
    expect(snap(3.8, 2.5)).toBe(5);
    expect(snap(-1.4, 2.5)).toBe(-2.5);
  });

  it('computes terminal positions of rotated elements', () => {
    const { store, sheet } = setup();
    const E = 'e' as ElementId;
    must(store, placeElement, {
      id: E,
      sheetId: sheet,
      symbolId: CONTACT.id,
      x: 100,
      y: 50,
      rotation: 90,
    });
    // T1 is at (0,-5); rotated 90° clockwise it ends up at (5,0).
    expect(endPosition(store.doc, { element: E, terminal: T1 })).toEqual({ x: 105, y: 50 });
    expect(endPosition(store.doc, { element: E, terminal: T2 })).toEqual({ x: 95, y: 50 });
    expect(endPosition(store.doc, { element: 'nope' as ElementId, terminal: T1 })).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { angleOnArc, primitiveBounds, symbolBounds, textRotation } from './geometry.ts';
import { CONTACT } from './test-utils.ts';

describe('bounds', () => {
  it('covers each primitive kind', () => {
    expect(primitiveBounds({ type: 'line', x1: 2, y1: 5, x2: -1, y2: 0 })).toEqual({
      minX: -1,
      minY: 0,
      maxX: 2,
      maxY: 5,
    });
    expect(primitiveBounds({ type: 'rect', x: 1, y: 1, width: -3, height: 2 })).toEqual({
      minX: -2,
      minY: 1,
      maxX: 1,
      maxY: 3,
    });
    expect(primitiveBounds({ type: 'circle', cx: 0, cy: 0, r: 2 })).toEqual({
      minX: -2,
      minY: -2,
      maxX: 2,
      maxY: 2,
    });
    // Lower half circle (clockwise from 0° to 180° goes through 90°, which is down).
    const arc = primitiveBounds({ type: 'arc', cx: 0, cy: 0, r: 2, start: 0, sweep: 180 });
    expect(arc.minY).toBeCloseTo(0);
    expect(arc.maxY).toBeCloseTo(2);
    expect(
      primitiveBounds({ type: 'text', x: 10, y: 0, text: 'ab', size: 2, anchor: 'end' }),
    ).toEqual({ minX: 7.6, minY: -1, maxX: 10, maxY: 1 });
  });

  it('knows which angles lie on an arc', () => {
    expect(angleOnArc(90, 0, 180)).toBe(true);
    expect(angleOnArc(270, 0, 180)).toBe(false);
    expect(angleOnArc(0, 270, 180)).toBe(true);
    expect(angleOnArc(45, 90, -90)).toBe(true);
  });

  it('includes terminals in symbol bounds', () => {
    expect(symbolBounds(CONTACT)).toEqual({ minX: 0, minY: -5, maxX: 0, maxY: 5 });
  });
});

describe('rotated texts', () => {
  it('turn their box when vertical, anchored at their point', () => {
    const text = {
      type: 'text' as const,
      x: 10,
      y: 20,
      text: 'ABCD',
      size: 2.5,
      rotation: 90 as const,
    };
    // Four characters: 4 × 2.5 × 0.6 = 6 mm long, running down from (10, 20).
    expect(primitiveBounds(text)).toEqual({ minX: 8.75, minY: 20, maxX: 11.25, maxY: 26 });
    // At 270° it stays readable (turned 90°) and runs up to the anchor point instead.
    expect(primitiveBounds({ ...text, rotation: 270 })).toEqual({
      minX: 8.75,
      minY: 14,
      maxX: 11.25,
      maxY: 20,
    });
  });

  it('add up with the element rotation, reversed when mirrored', () => {
    expect(textRotation(90, 0, false)).toBe(90);
    expect(textRotation(90, 90, false)).toBe(180);
    expect(textRotation(90, 0, true)).toBe(270);
    expect(textRotation(undefined, 270, false)).toBe(270);
  });
});

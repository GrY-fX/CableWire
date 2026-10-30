import { describe, expect, it } from 'vitest';
import type { Primitive } from '@cablewire/core';
import { SnapshotHistory } from './history.ts';
import { distanceToPrimitive } from './hit.ts';
import { snapPoint } from './snap.ts';
import {
  fitBounds,
  panBy,
  screenToWorld,
  viewBoxOf,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
} from './viewport.ts';

describe('viewport', () => {
  const vp = { x: -10, y: -5, scale: 4 };

  it('converts between screen pixels and millimetres', () => {
    expect(screenToWorld(vp, { x: 40, y: 20 })).toEqual({ x: 0, y: 0 });
    expect(worldToScreen(vp, { x: 0, y: 0 })).toEqual({ x: 40, y: 20 });
  });

  it('zooms around the cursor', () => {
    const zoomed = zoomAt(vp, { x: 40, y: 20 }, 2);
    expect(zoomed.scale).toBe(8);
    expect(screenToWorld(zoomed, { x: 40, y: 20 })).toEqual({ x: 0, y: 0 });
    expect(zoomAt(vp, { x: 0, y: 0 }, 1e6).scale).toBe(200);
  });

  it('pans and fits', () => {
    expect(panBy(vp, 8, -4)).toEqual({ x: -12, y: -4, scale: 4 });
    const fit = fitBounds(
      { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      { width: 300, height: 200 },
      0,
    );
    expect(fit.scale).toBe(10);
    expect(viewBoxOf(fit, { width: 300, height: 200 })).toEqual({
      x: -15,
      y: -10,
      width: 30,
      height: 20,
    });
  });
});

describe('snap', () => {
  it('snaps to the grid without float noise', () => {
    expect(snapPoint({ x: 0.74, y: -0.2 }, 0.5)).toEqual({ x: 0.5, y: 0 });
    expect(snapPoint({ x: 3.7, y: 6.3 }, 2.5)).toEqual({ x: 2.5, y: 7.5 });
  });
});

describe('hit distance', () => {
  it('measures distance to outlines and filled areas', () => {
    const p = { x: 0, y: 1 };
    expect(distanceToPrimitive(p, { type: 'line', x1: -5, y1: 0, x2: 5, y2: 0 })).toBe(1);
    expect(distanceToPrimitive(p, { type: 'circle', cx: 0, cy: 0, r: 3 })).toBe(2);
    expect(distanceToPrimitive(p, { type: 'circle', cx: 0, cy: 0, r: 3, filled: true })).toBe(0);
    expect(distanceToPrimitive(p, { type: 'rect', x: -2, y: -2, width: 4, height: 4 })).toBe(1);
    // Upper half arc (from 180° clockwise to 360°): the point below the centre is far from it.
    const arc = { type: 'arc', cx: 0, cy: 0, r: 2, start: 180, sweep: 180 } as const;
    expect(distanceToPrimitive({ x: 0, y: -2 }, arc)).toBeCloseTo(0);
    expect(distanceToPrimitive({ x: 0, y: 2 }, arc)).toBeCloseTo(Math.hypot(2, 2));
    const closed: Primitive & { type: 'polyline' } = {
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      closed: true,
      filled: true,
    };
    expect(distanceToPrimitive({ x: 1, y: 1 }, closed)).toBe(0);
    expect(distanceToPrimitive({ x: 2, y: 2 }, { ...closed, filled: false })).toBe(0);
    expect(
      distanceToPrimitive({ x: 11, y: 0 }, { type: 'text', x: 10, y: 0, text: 'K', size: 2.5 }),
    ).toBe(0);
  });
});

describe('SnapshotHistory', () => {
  it('records changes and merges a gesture into one entry', () => {
    const h = new SnapshotHistory(0);
    h.set(1);
    h.begin();
    h.set(2);
    h.set(3);
    h.commit();
    expect(h.value).toBe(3);
    expect(h.undo()).toBe(true);
    expect(h.value).toBe(1);
    expect(h.undo()).toBe(true);
    expect(h.value).toBe(0);
    expect(h.undo()).toBe(false);
    h.redo();
    h.redo();
    expect(h.value).toBe(3);
  });

  it('cancels a gesture, skips empty gestures and limits size', () => {
    const h = new SnapshotHistory(0, 2);
    h.begin();
    h.set(5);
    h.cancel();
    expect(h.value).toBe(0);
    h.begin();
    h.commit();
    expect(h.canUndo).toBe(false);
    for (let i = 1; i <= 4; i++) h.set(i);
    h.undo();
    h.undo();
    expect(h.undo()).toBe(false);
    expect(h.value).toBe(2);
    h.set(9);
    expect(h.canRedo).toBe(false);
  });
});

describe('wheel zoom', () => {
  it('zooms in proportion to the wheel movement, gently and within limits', () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.105, 3); // one mouse notch in
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.105, 3);
    expect(wheelZoomFactor(-4)).toBeCloseTo(1.004, 3); // a small touchpad step
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48), 6); // lines
    expect(wheelZoomFactor(-100000)).toBe(2);
    expect(wheelZoomFactor(100000)).toBe(0.5);
  });
});

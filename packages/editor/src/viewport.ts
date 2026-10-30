import type { Bounds, Point } from '@cablewire/core';

/** What part of the drawing is visible: `x`, `y` is the world point (mm) at the top-left corner. */
export interface Viewport {
  x: number;
  y: number;
  /** Screen pixels per millimetre. */
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 200;

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: vp.x + p.x / vp.scale, y: vp.y + p.y / vp.scale };
}

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) * vp.scale, y: (p.y - vp.y) * vp.scale };
}

/** Zooms by `factor` keeping the world point under `screenPoint` fixed. */
export function zoomAt(vp: Viewport, screenPoint: Point, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale * factor));
  const anchor = screenToWorld(vp, screenPoint);
  return { scale, x: anchor.x - screenPoint.x / scale, y: anchor.y - screenPoint.y / scale };
}

/** Zoom speed: scale change per pixel of wheel scrolling (≈10% per 100 px mouse notch). */
export const WHEEL_ZOOM_SPEED = 0.001;

/**
 * Zoom factor for a wheel event, proportional to how far the wheel moved, so a
 * touchpad's many small events zoom as smoothly as a mouse notch.
 * `deltaMode`: 0 pixels, 1 lines, 2 pages (as in WheelEvent).
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1);
  return Math.min(2, Math.max(0.5, Math.exp(-pixels * WHEEL_ZOOM_SPEED)));
}

/** Moves the view by a screen-pixel delta (dragging the drawing). */
export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x - dx / vp.scale, y: vp.y - dy / vp.scale };
}

/** Viewport showing `bounds` centred in `size`, with a margin in pixels. */
export function fitBounds(bounds: Bounds, size: Size, margin = 40): Viewport {
  const w = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const h = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const scale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min((size.width - 2 * margin) / w, (size.height - 2 * margin) / h)),
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, x: cx - size.width / 2 / scale, y: cy - size.height / 2 / scale };
}

/** The visible world rectangle, as an SVG viewBox. */
export function viewBoxOf(vp: Viewport, size: Size) {
  return { x: vp.x, y: vp.y, width: size.width / vp.scale, height: size.height / vp.scale };
}

import type { Bounds, Point, Rotation, SymbolDef } from '@cablewire/core';
import { buildElementNode } from './build.ts';
import type { SceneItem } from './scene.ts';

export interface SchematicOverlayOptions {
  /** Millimetres per screen pixel, to keep markers the same size at any zoom. */
  pixel: number;
  /** Symbol following the cursor while placing. */
  ghost?:
    | {
        symbol: SymbolDef;
        x: number;
        y: number;
        rotation: Rotation;
        mirrored: boolean;
        info?: Record<string, string> | undefined;
      }
    | undefined;
  marquee?: Bounds | undefined;
  /** Path of the wire being drawn or reconnected. */
  preview?: readonly Point[] | undefined;
  /** Terminal, junction or wire point the cursor would connect to. */
  hot?: Point | undefined;
  /** Handles of the selected wire. */
  handles?: readonly Point[] | undefined;
  /** Wires that automatic connection would create, drawn dashed. */
  autoLinks?: readonly (readonly [Point, Point])[] | undefined;
}

/** Editing aids drawn above a sheet scene, in the overlay layer. */
export function buildSchematicOverlay(options: SchematicOverlayOptions): SceneItem[] {
  const items: SceneItem[] = [];
  const { ghost, marquee, preview, hot, handles, autoLinks, pixel } = options;
  if (ghost) {
    items.push({
      key: 'ghost',
      layer: 'overlay',
      node: {
        kind: 'group',
        classes: ['ghost'],
        children: [
          buildElementNode(
            { ...ghost, info: ghost.info ?? ghost.symbol.defaultInfo },
            ghost.symbol,
          ),
        ],
      },
    });
  }
  if (autoLinks?.length) {
    items.push({
      key: 'auto-links',
      layer: 'overlay',
      node: {
        kind: 'path',
        d: autoLinks.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join(''),
        classes: ['preview'],
      },
    });
  }
  if (preview && preview.length > 1) {
    items.push({
      key: 'wire-preview',
      layer: 'overlay',
      node: {
        kind: 'path',
        d: preview.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(''),
        classes: ['wire-preview'],
      },
    });
  }
  if (hot) {
    items.push({
      key: 'hot',
      layer: 'overlay',
      node: { kind: 'circle', cx: hot.x, cy: hot.y, r: 5 * pixel, classes: ['hot'] },
    });
  }
  if (handles?.length) {
    const s = 3 * pixel;
    items.push({
      key: 'handles',
      layer: 'overlay',
      node: {
        kind: 'path',
        d: handles.map((h) => `M${h.x - s} ${h.y - s}h${2 * s}v${2 * s}h${-2 * s}Z`).join(''),
        classes: ['handle'],
      },
    });
  }
  if (marquee) {
    items.push({
      key: 'marquee',
      layer: 'overlay',
      node: {
        kind: 'path',
        d: `M${marquee.minX} ${marquee.minY}H${marquee.maxX}V${marquee.maxY}H${marquee.minX}Z`,
        classes: ['marquee'],
      },
    });
  }
  return items;
}

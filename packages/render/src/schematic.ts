import type { Bounds, Rotation, SymbolDef } from '@cablewire/core';
import { buildElementNode } from './build.ts';
import type { SceneItem } from './scene.ts';

export interface SchematicOverlayOptions {
  /** Symbol following the cursor while placing. */
  ghost?:
    { symbol: SymbolDef; x: number; y: number; rotation: Rotation; mirrored: boolean } | undefined;
  marquee?: Bounds | undefined;
}

/** Editing aids drawn above a sheet scene, in the overlay layer. */
export function buildSchematicOverlay(options: SchematicOverlayOptions): SceneItem[] {
  const items: SceneItem[] = [];
  const { ghost, marquee } = options;
  if (ghost) {
    items.push({
      key: 'ghost',
      layer: 'overlay',
      node: {
        kind: 'group',
        classes: ['ghost'],
        children: [buildElementNode({ ...ghost, info: ghost.symbol.defaultInfo }, ghost.symbol)],
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

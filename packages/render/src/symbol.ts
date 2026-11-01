import { readableText } from '@cablewire/core';
import type { Bounds, Point, Primitive, SymbolDef } from '@cablewire/core';
import { primitivePath } from './build.ts';
import type { Scene, SceneItem, SceneNode } from './scene.ts';

export interface SymbolSceneOptions {
  /** Millimetres per screen pixel, to keep editing aids the same size at any zoom. */
  pixel: number;
  /** Shapes of the drawing in progress. */
  preview?: readonly Primitive[];
  handles?: readonly Point[];
  marquee?: Bounds | undefined;
}

export const TERMINAL_RADIUS = 0.6;
const TERMINAL_TICK = 1.5;
const DIRECTION: Record<string, Point> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

/** A shape as drawn in the editors; texts show their raw content, placeholders included. */
export function shapeNode(p: Primitive, classes?: string[]): SceneNode {
  if (p.type === 'text') {
    const { angle, anchor } = readableText(p.rotation ?? 0, false, p.anchor ?? 'start');
    return {
      kind: 'text',
      x: p.x,
      y: p.y,
      text: p.text,
      size: p.size,
      anchor,
      ...(angle ? { angle } : {}),
      classes: classes ?? ['text'],
    };
  }
  const node = primitivePath(p);
  return classes ? { ...node, classes } : node;
}

/**
 * Scene for the symbol editor: one item per shape (`shape:<index>`) and terminal
 * (`terminal:<id>`), plus origin, preview, handles and marquee overlays.
 */
export function buildSymbolScene(symbol: SymbolDef, options: SymbolSceneOptions): Scene {
  const px = options.pixel;
  const items: SceneItem[] = [];
  const cross = 8 * px;
  items.push({
    key: 'origin',
    layer: 'frame',
    node: {
      kind: 'path',
      d: `M${-cross} 0H${cross}M0 ${-cross}V${cross}`,
      classes: ['origin'],
      screenOnly: true,
    },
  });

  // A title block's area, from its top-left corner (the origin).
  if (symbol.kind === 'titleblock' && symbol.titleBlock) {
    const { width, height } = symbol.titleBlock;
    items.push({
      key: 'title-block-area',
      layer: 'frame',
      node: {
        kind: 'path',
        d: `M0 0H${width}V${height}H0Z`,
        classes: ['preview'],
        screenOnly: true,
      },
    });
  }

  symbol.graphics.forEach((p, i) => {
    items.push({ key: `shape:${i}`, layer: 'elements', node: shapeNode(p) });
  });

  for (const t of symbol.terminals) {
    const d = DIRECTION[t.dir]!;
    // Name beside the tick: to the right of vertical ticks, above horizontal ones.
    const vertical = d.x === 0;
    const label = vertical
      ? { x: t.x + 0.8, y: t.y + (d.y * TERMINAL_TICK) / 2, anchor: 'start' as const }
      : { x: t.x + (d.x * TERMINAL_TICK) / 2, y: t.y - 1, anchor: 'middle' as const };
    items.push({
      key: `terminal:${t.id}`,
      layer: 'junctions',
      node: {
        kind: 'group',
        children: [
          { kind: 'circle', cx: t.x, cy: t.y, r: TERMINAL_RADIUS, classes: ['terminal'] },
          {
            kind: 'path',
            d: `M${t.x} ${t.y}l${d.x * TERMINAL_TICK} ${d.y * TERMINAL_TICK}`,
            classes: ['terminal'],
          },
          {
            kind: 'text',
            x: label.x,
            y: label.y,
            text: t.name,
            size: 1.5,
            anchor: label.anchor,
            classes: ['terminal-name'],
          },
        ],
      },
    });
  }

  if (options.preview?.length) {
    items.push({
      key: 'preview',
      layer: 'overlay',
      node: {
        kind: 'group',
        children: options.preview.map((p) =>
          shapeNode(p, p.type === 'text' ? ['preview-text'] : ['preview']),
        ),
      },
    });
  }
  if (options.handles?.length) {
    const s = 3 * px;
    items.push({
      key: 'handles',
      layer: 'overlay',
      node: {
        kind: 'path',
        d: options.handles
          .map((h) => `M${h.x - s} ${h.y - s}h${2 * s}v${2 * s}h${-2 * s}Z`)
          .join(''),
        classes: ['handle'],
      },
    });
  }
  if (options.marquee) {
    const m = options.marquee;
    items.push({
      key: 'marquee',
      layer: 'overlay',
      node: {
        kind: 'path',
        d: `M${m.minX} ${m.minY}H${m.maxX}V${m.maxY}H${m.minX}Z`,
        classes: ['marquee'],
      },
    });
  }
  return { width: 0, height: 0, items };
}

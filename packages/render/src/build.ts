import {
  endPosition,
  masterRef,
  referenceTarget,
  reportName,
  slaveLabel,
  textRotation,
  terminalLabel,
  transformPoint,
  drawingBounds,
  XREF_TEXT_SIZE,
  xrefLayout,
} from '@cablewire/core';
import type {
  Element,
  Junction,
  Point,
  Primitive,
  ProjectDoc,
  SheetId,
  SymbolDef,
  Wire,
  XrefLayout,
} from '@cablewire/core';
import type { Scene, SceneItem, SceneNode } from './scene.ts';
import { buildFrame, sheetLayout } from './sheet.ts';
import { fillPlaceholders, readableText } from './text.ts';

export const JUNCTION_RADIUS = 0.5;
export const TERMINAL_MARK = 0.75;
export const WIRE_NUMBER_SIZE = 2.5;
const WIRE_NUMBER_OFFSET = 1.5;

const cache = new WeakMap<ProjectDoc, Map<SheetId, Scene>>();

/** Scene of one sheet; memoized per document version. */
export function buildScene(doc: ProjectDoc, sheetId: SheetId): Scene {
  let perSheet = cache.get(doc);
  if (!perSheet) cache.set(doc, (perSheet = new Map()));
  let scene = perSheet.get(sheetId);
  if (!scene) perSheet.set(sheetId, (scene = computeScene(doc, sheetId)));
  return scene;
}

function computeScene(doc: ProjectDoc, sheetId: SheetId): Scene {
  const sheet = doc.sheets[sheetId];
  if (!sheet) throw new Error(`Sheet ${sheetId} not found`);
  const { width, height } = sheetLayout(sheet);
  const items: SceneItem[] = [{ key: 'frame', layer: 'frame', node: buildFrame(doc, sheet) }];

  for (const wire of Object.values(doc.wires)) {
    if (wire.sheetId !== sheetId) continue;
    const node = buildWire(doc, wire);
    if (node) items.push({ key: `wire:${wire.id}`, layer: 'wires', node });
  }
  for (const element of Object.values(doc.elements)) {
    if (element.sheetId !== sheetId) continue;
    const symbol = doc.symbols[element.symbolId];
    if (symbol) {
      items.push({
        key: `element:${element.id}`,
        layer: 'elements',
        node: buildElementNode(
          symbol.kind === 'report'
            ? { ...element, info: reportInfo(doc, element) }
            : symbol.kind === 'slave'
              ? { ...element, info: slaveInfo(doc, element) }
              : symbol.kind === 'terminal'
                ? { ...element, info: { ...element.info, label: terminalLabel(doc, element) } }
                : element,
          symbol,
        ),
      });
    }
  }
  for (const element of Object.values(doc.elements)) {
    if (element.sheetId !== sheetId) continue;
    const layout = xrefLayout(doc, element);
    if (layout)
      items.push({ key: `xref:${element.id}`, layer: 'elements', node: buildXref(layout) });
  }
  for (const junction of Object.values(doc.junctions)) {
    if (junction.sheetId !== sheetId) continue;
    items.push({
      key: `junction:${junction.id}`,
      layer: 'junctions',
      node: buildJunction(junction),
    });
  }
  return { width, height, items };
}

/**
 * Info of a sheet reference with the computed fields: `{ref_name}` (wire number or
 * N/C id) and `{ref_target}` (where the wire continues). `{label}` falls back to the
 * name, for symbols drawn before these fields existed.
 */
export function reportInfo(doc: ProjectDoc, element: Element): Record<string, string> {
  const name = reportName(doc, element);
  return {
    ...element.info,
    label: element.info['label'] || name,
    ref_name: name,
    ref_target: referenceTarget(doc, element),
  };
}

/** Info of a contact: its coil's label and `{master_ref}` (where the coil is). */
export function slaveInfo(doc: ProjectDoc, element: Element): Record<string, string> {
  return {
    ...element.info,
    label: slaveLabel(doc, element),
    master_ref: masterRef(doc, element),
  };
}

/** The contact table of a coil (see xrefLayout in core). */
export function buildXref(layout: XrefLayout): SceneNode {
  const d = layout.lines.map((l) => `M${l.x1} ${l.y1}L${l.x2} ${l.y2}`).join('');
  // Drawn contacts: their symbol's graphics (texts left out), scaled into place.
  const glyphs = layout.glyphs.flatMap((g): SceneNode[] => {
    const b = drawingBounds(g.symbol);
    if (!b) return [];
    const tx = round(g.x - b.minX * g.scale);
    const ty = round(g.y - b.minY * g.scale);
    return [
      {
        kind: 'group',
        transform: `translate(${tx} ${ty}) scale(${round(g.scale)})`,
        children: g.symbol.graphics.flatMap((p) => (p.type === 'text' ? [] : [primitivePath(p)])),
      },
    ];
  });
  return {
    kind: 'group',
    children: [
      ...(d ? [{ kind: 'path' as const, d, classes: ['stroke'] }] : []),
      ...glyphs,
      ...layout.texts.map((t): SceneNode => ({
        kind: 'text',
        x: round(t.x),
        y: round(t.y),
        text: t.text,
        size: XREF_TEXT_SIZE,
        anchor: t.anchor,
        ...(t.angle ? { angle: t.angle } : {}),
        classes: ['text'],
      })),
    ],
  };
}

export function primitivePath(p: Exclude<Primitive, { type: 'text' }>): SceneNode {
  switch (p.type) {
    case 'line':
      return { kind: 'path', d: `M${p.x1} ${p.y1}L${p.x2} ${p.y2}`, classes: ['stroke'] };
    case 'polyline': {
      const [first, ...rest] = p.points;
      const d = first
        ? `M${first.x} ${first.y}${rest.map((q) => `L${q.x} ${q.y}`).join('')}${p.closed ? 'Z' : ''}`
        : '';
      return { kind: 'path', d, filled: p.filled ?? false, classes: ['stroke'] };
    }
    case 'rect':
      return {
        kind: 'path',
        d: `M${p.x} ${p.y}h${p.width}v${p.height}h${-p.width}Z`,
        filled: p.filled ?? false,
        classes: ['stroke'],
      };
    case 'circle':
      return {
        kind: 'circle',
        cx: p.cx,
        cy: p.cy,
        r: p.r,
        filled: p.filled ?? false,
        classes: ['stroke'],
      };
    case 'arc': {
      if (Math.abs(p.sweep) >= 360) {
        return { kind: 'circle', cx: p.cx, cy: p.cy, r: p.r, classes: ['stroke'] };
      }
      const at = (deg: number) => {
        const rad = (deg * Math.PI) / 180;
        return { x: round(p.cx + p.r * Math.cos(rad)), y: round(p.cy + p.r * Math.sin(rad)) };
      };
      const a = at(p.start);
      const b = at(p.start + p.sweep);
      const large = Math.abs(p.sweep) > 180 ? 1 : 0;
      const clockwise = p.sweep > 0 ? 1 : 0;
      return {
        kind: 'path',
        d: `M${a.x} ${a.y}A${p.r} ${p.r} 0 ${large} ${clockwise} ${b.x} ${b.y}`,
        classes: ['stroke'],
      };
    }
  }
}

/** An element: rotated/mirrored graphics plus readable texts with placeholders filled. */
export function buildElementNode(
  element: Pick<Element, 'x' | 'y' | 'rotation' | 'mirrored' | 'info'>,
  symbol: SymbolDef,
): SceneNode {
  const { x, y, rotation, mirrored } = element;
  const shapes: SceneNode[] = [];
  const texts: SceneNode[] = [];

  for (const p of symbol.graphics) {
    if (p.type !== 'text') {
      shapes.push(primitivePath(p));
      continue;
    }
    const value = fillPlaceholders(p.text, element.info);
    if (!value) continue;
    // Texts are placed outside the rotated group so they stay readable.
    const at = transformPoint(p, rotation, mirrored);
    const turn = textRotation(p.rotation, rotation, mirrored);
    const { angle, anchor } = readableText(turn, mirrored, p.anchor ?? 'start');
    texts.push({
      kind: 'text',
      x: round(x + at.x),
      y: round(y + at.y),
      text: value,
      size: p.size,
      anchor,
      ...(angle && { angle }),
      classes: ['text'],
    });
  }

  for (const t of symbol.terminals) {
    const s = TERMINAL_MARK;
    shapes.push({
      kind: 'path',
      d: `M${t.x - s} ${t.y - s}L${t.x + s} ${t.y + s}M${t.x - s} ${t.y + s}L${t.x + s} ${t.y - s}`,
      classes: ['terminal-mark'],
      screenOnly: true,
    });
  }

  const transform = [
    `translate(${x} ${y})`,
    rotation ? `rotate(${rotation})` : '',
    mirrored ? 'scale(-1 1)' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    kind: 'group',
    children: [{ kind: 'group', transform, children: shapes }, ...texts],
  };
}

function buildWire(doc: ProjectDoc, wire: Wire): SceneNode | undefined {
  const start = endPosition(doc, wire.from);
  const end = endPosition(doc, wire.to);
  if (!start || !end) return undefined;
  const points = [start, ...wire.bends, end];
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join('');
  const children: SceneNode[] = [{ kind: 'path', d, classes: ['stroke', 'wire'] }];
  if (wire.props.number) children.push(wireNumber(points, wire.props.number));
  // Wider invisible stroke so thin wires are easy to click.
  children.push({ kind: 'path', d, classes: ['hit'], screenOnly: true });
  return { kind: 'group', children };
}

/** Wire number at the middle of the longest segment: above horizontal, left of vertical. */
export function wireNumber(points: Point[], number: string): SceneNode {
  let best = 0;
  let length = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > length) {
      length = l;
      best = i;
    }
  }
  const a = points[best]!;
  const b = points[best + 1]!;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  return {
    kind: 'text',
    x: round(vertical ? mid.x - WIRE_NUMBER_OFFSET : mid.x),
    y: round(vertical ? mid.y : mid.y - WIRE_NUMBER_OFFSET),
    text: number,
    size: WIRE_NUMBER_SIZE,
    anchor: 'middle',
    ...(vertical && { angle: 90 }),
    classes: ['text', 'wire-number'],
  };
}

function buildJunction(junction: Junction): SceneNode {
  return {
    kind: 'circle',
    cx: junction.x,
    cy: junction.y,
    r: JUNCTION_RADIUS,
    filled: true,
    classes: ['stroke'],
  };
}

/** Rounds to 1/1000 mm to keep the SVG compact and free of float noise. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

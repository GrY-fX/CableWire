import { DEFAULT_GRID_STEP, newId } from '@cablewire/core';
import type {
  Direction,
  Point,
  Primitive,
  SymbolDef,
  SymbolTerminal,
  TerminalId,
} from '@cablewire/core';
import { clean } from '../snap.ts';

/** Fine grid for shapes; terminals always stay on the schematic grid (DEFAULT_GRID_STEP). */
export const SHAPE_GRID = 0.5;
export const TERMINAL_GRID = DEFAULT_GRID_STEP;

/** Selection keys, the same used by the symbol scene: `shape:<index>`, `terminal:<id>`. */
export type ItemKey = string;
export const shapeKey = (index: number): ItemKey => `shape:${index}`;
export const terminalKey = (id: TerminalId): ItemKey => `terminal:${id}`;

export function parseKey(key: ItemKey): { shape: number } | { terminal: TerminalId } | undefined {
  if (key.startsWith('shape:')) return { shape: Number(key.slice(6)) };
  if (key.startsWith('terminal:')) return { terminal: key.slice(9) as TerminalId };
  return undefined;
}

export function newSymbol(): SymbolDef {
  return {
    id: newId(),
    name: 'Nuovo simbolo',
    category: '',
    kind: 'simple',
    graphics: [],
    terminals: [],
    bridges: [],
    defaultInfo: { label: '' },
    version: 1,
  };
}

const move = (p: Point, dx: number, dy: number): Point => ({
  x: clean(p.x + dx),
  y: clean(p.y + dy),
});

export function translatePrimitive(p: Primitive, dx: number, dy: number): Primitive {
  switch (p.type) {
    case 'line':
      return {
        ...p,
        x1: clean(p.x1 + dx),
        y1: clean(p.y1 + dy),
        x2: clean(p.x2 + dx),
        y2: clean(p.y2 + dy),
      };
    case 'polyline':
      return { ...p, points: p.points.map((q) => move(q, dx, dy)) };
    case 'arc':
    case 'circle':
      return { ...p, cx: clean(p.cx + dx), cy: clean(p.cy + dy) };
    case 'rect':
    case 'text':
      return { ...p, x: clean(p.x + dx), y: clean(p.y + dy) };
  }
}

export function addShape(symbol: SymbolDef, shape: Primitive): SymbolDef {
  return { ...symbol, graphics: [...symbol.graphics, shape] };
}

export function replaceShape(symbol: SymbolDef, index: number, shape: Primitive): SymbolDef {
  const graphics = [...symbol.graphics];
  graphics[index] = shape;
  return { ...symbol, graphics };
}

/** Next free numeric terminal name: 1, 2, 3 ... */
export function nextTerminalName(symbol: SymbolDef): string {
  const used = new Set(symbol.terminals.map((t) => t.name));
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}

/** Direction a terminal faces, from its position relative to the origin. */
export function directionFor(p: Point): Direction {
  if (Math.abs(p.y) >= Math.abs(p.x)) return p.y < 0 ? 'n' : 's';
  return p.x < 0 ? 'w' : 'e';
}

export function addTerminal(
  symbol: SymbolDef,
  at: Point,
  id: TerminalId = newId(),
): { symbol: SymbolDef; terminal: SymbolTerminal } {
  const terminal: SymbolTerminal = {
    id,
    name: nextTerminalName(symbol),
    x: at.x,
    y: at.y,
    dir: directionFor(at),
  };
  return { symbol: { ...symbol, terminals: [...symbol.terminals, terminal] }, terminal };
}

export function updateTerminal(
  symbol: SymbolDef,
  id: TerminalId,
  patch: Partial<Omit<SymbolTerminal, 'id'>>,
): SymbolDef {
  return {
    ...symbol,
    terminals: symbol.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

function splitKeys(keys: Iterable<ItemKey>) {
  const shapes = new Set<number>();
  const terminals = new Set<TerminalId>();
  for (const key of keys) {
    const k = parseKey(key);
    if (k && 'shape' in k) shapes.add(k.shape);
    else if (k) terminals.add(k.terminal);
  }
  return { shapes, terminals };
}

export function hasTerminals(keys: Iterable<ItemKey>): boolean {
  return splitKeys(keys).terminals.size > 0;
}

export function moveItems(
  symbol: SymbolDef,
  keys: Iterable<ItemKey>,
  dx: number,
  dy: number,
): SymbolDef {
  const { shapes, terminals } = splitKeys(keys);
  if ((dx === 0 && dy === 0) || (shapes.size === 0 && terminals.size === 0)) return symbol;
  return {
    ...symbol,
    graphics: symbol.graphics.map((p, i) => (shapes.has(i) ? translatePrimitive(p, dx, dy) : p)),
    terminals: symbol.terminals.map((t) =>
      terminals.has(t.id) ? { ...t, ...move(t, dx, dy) } : t,
    ),
  };
}

/** Removes shapes and terminals (and bridges to removed terminals). */
export function removeItems(symbol: SymbolDef, keys: Iterable<ItemKey>): SymbolDef {
  const { shapes, terminals } = splitKeys(keys);
  if (shapes.size === 0 && terminals.size === 0) return symbol;
  return {
    ...symbol,
    graphics: symbol.graphics.filter((_, i) => !shapes.has(i)),
    terminals: symbol.terminals.filter((t) => !terminals.has(t.id)),
    bridges: symbol.bridges.filter(([a, b]) => !terminals.has(a) && !terminals.has(b)),
  };
}

/** Copies items with an offset; returns the keys of the copies. */
export function duplicateItems(
  symbol: SymbolDef,
  keys: Iterable<ItemKey>,
  dx: number,
  dy: number,
): { symbol: SymbolDef; keys: ItemKey[] } {
  const { shapes, terminals } = splitKeys(keys);
  let result = symbol;
  const copies: ItemKey[] = [];
  for (const i of [...shapes].sort((a, b) => a - b)) {
    const shape = symbol.graphics[i];
    if (!shape) continue;
    result = addShape(result, translatePrimitive(shape, dx, dy));
    copies.push(shapeKey(result.graphics.length - 1));
  }
  for (const t of symbol.terminals) {
    if (!terminals.has(t.id)) continue;
    const added = addTerminal(result, move(t, dx, dy));
    result = updateTerminal(added.symbol, added.terminal.id, { dir: t.dir });
    copies.push(terminalKey(added.terminal.id));
  }
  return { symbol: result, keys: copies };
}

/** Shapes and terminals copied from a symbol, ready to paste into any symbol. */
export interface SymbolClip {
  shapes: Primitive[];
  terminals: SymbolTerminal[];
}

/** Copies the selected items (shapes in drawing order). */
export function copyItems(symbol: SymbolDef, keys: Iterable<ItemKey>): SymbolClip {
  const { shapes, terminals } = splitKeys(keys);
  return {
    shapes: symbol.graphics.filter((_, i) => shapes.has(i)),
    terminals: symbol.terminals.filter((t) => terminals.has(t.id)),
  };
}

/**
 * Pastes copied items moved by (dx, dy); returns the keys of the pasted items.
 * Terminals get new ids, and keep their name unless the symbol already uses it.
 */
export function pasteItems(
  symbol: SymbolDef,
  clip: SymbolClip,
  dx: number,
  dy: number,
): { symbol: SymbolDef; keys: ItemKey[] } {
  let result = symbol;
  const keys: ItemKey[] = [];
  for (const shape of clip.shapes) {
    result = addShape(result, translatePrimitive(shape, dx, dy));
    keys.push(shapeKey(result.graphics.length - 1));
  }
  for (const t of clip.terminals) {
    const added = addTerminal(result, move(t, dx, dy));
    const taken = result.terminals.some((x) => x.name === t.name);
    result = updateTerminal(added.symbol, added.terminal.id, {
      dir: t.dir,
      ...(taken ? {} : { name: t.name }),
    });
    keys.push(terminalKey(added.terminal.id));
  }
  return { symbol: result, keys };
}

export function toggleBridge(symbol: SymbolDef, a: TerminalId, b: TerminalId): SymbolDef {
  if (a === b) return symbol;
  const same = ([x, y]: [TerminalId, TerminalId]) => (x === a && y === b) || (x === b && y === a);
  const bridges = symbol.bridges.some(same)
    ? symbol.bridges.filter((pair) => !same(pair))
    : [...symbol.bridges, [a, b] as [TerminalId, TerminalId]];
  return { ...symbol, bridges };
}

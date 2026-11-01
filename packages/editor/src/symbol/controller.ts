import { primitiveBounds } from '@cablewire/core';
import type { Bounds, Point, Primitive, SymbolDef, TerminalId } from '@cablewire/core';
import { SnapshotHistory } from '../history.ts';
import { boundsInside, distanceToPrimitive, rectFromPoints } from '../hit.ts';
import { clean, snapPoint } from '../snap.ts';
import {
  SHAPE_GRID,
  TERMINAL_GRID,
  addShape,
  addTerminal,
  copyItems,
  duplicateItems,
  hasTerminals,
  moveItems,
  newSymbol,
  parseKey,
  pasteItems,
  removeItems,
  replaceShape,
  shapeKey,
  terminalKey,
} from './document.ts';
import type { ItemKey, SymbolClip } from './document.ts';
import { applyHandle, clockwiseSweep, handlesOf } from './handles.ts';

export type ToolName =
  'select' | 'line' | 'polyline' | 'rect' | 'circle' | 'arc' | 'text' | 'terminal';

/** Keyboard shortcuts for tools (no modifier). */
export const TOOL_KEYS: Record<string, ToolName> = {
  s: 'select',
  l: 'line',
  p: 'polyline',
  r: 'rect',
  c: 'circle',
  a: 'arc',
  t: 'text',
  m: 'terminal',
};

export interface Modifiers {
  shift?: boolean;
  ctrl?: boolean;
}

type Drag =
  | { kind: 'move'; origin: Point; base: SymbolDef; keys: ItemKey[] }
  | { kind: 'handle'; base: SymbolDef; shape: number; handle: number }
  | { kind: 'marquee'; origin: Point; additive: boolean };

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const angleOf = (c: Point, p: Point) =>
  clean(Math.round(((Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI) * 10) / 10);
const DEFAULT_TEXT_SIZE = 2.5;

/**
 * State and behaviour of the symbol editor, independent of the DOM: the UI forwards
 * pointer and keyboard events in millimetres and redraws when notified.
 */
export class SymbolEditor {
  /** Hit tolerance in millimetres; the UI keeps it at a few pixels for the current zoom. */
  tolerance = 1;

  private readonly history: SnapshotHistory<SymbolDef>;
  private selected = new Set<ItemKey>();
  /** Copied items; kept when another symbol is opened, to paste them there. */
  private clipboard: { clip: SymbolClip; pasted: number } | undefined;
  private currentTool: ToolName = 'select';
  /** Points clicked so far by a drawing tool. */
  private points: Point[] = [];
  private cursor: Point | undefined;
  private drag: Drag | undefined;
  private marqueeRect: Bounds | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(symbol: SymbolDef = newSymbol()) {
    this.history = new SnapshotHistory(symbol);
  }

  get symbol(): SymbolDef {
    return this.history.value;
  }
  get selection(): ReadonlySet<ItemKey> {
    return this.selected;
  }
  get tool(): ToolName {
    return this.currentTool;
  }
  get canUndo(): boolean {
    return this.history.canUndo;
  }
  get canRedo(): boolean {
    return this.history.canRedo;
  }
  get marquee(): Bounds | undefined {
    return this.marqueeRect;
  }
  /** Snapped cursor position, for the status bar. */
  get cursorPoint(): Point | undefined {
    return this.cursor;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Opens another symbol, clearing history and selection. */
  load(symbol: SymbolDef): void {
    this.history.reset(symbol);
    this.selected = new Set();
    this.resetDrawing();
    this.emit();
  }

  /**
   * Swaps in what was actually saved (new version or id) keeping the undo history,
   * so saving is not itself an undoable step.
   */
  replaceSymbol(symbol: SymbolDef): void {
    this.history.replace(symbol);
    this.pruneSelection();
    this.emit();
  }

  setTool(tool: ToolName): void {
    this.currentTool = tool;
    this.resetDrawing();
    this.emit();
  }

  select(keys: Iterable<ItemKey>): void {
    this.selected = new Set(keys);
    this.emit();
  }

  /** Records an edit made outside the canvas (e.g. in the properties panel). */
  update(next: SymbolDef): void {
    this.history.set(next);
    this.pruneSelection();
    this.emit();
  }

  undo(): void {
    this.cancelDrag();
    if (this.history.undo()) this.afterHistory();
  }

  redo(): void {
    this.cancelDrag();
    if (this.history.redo()) this.afterHistory();
  }

  /** Shapes of the drawing in progress, for the overlay. */
  get preview(): Primitive[] {
    const c = this.cursor;
    const [a, b] = this.points;
    if (!c) return [];
    switch (this.currentTool) {
      case 'line':
        return a ? [{ type: 'line', x1: a.x, y1: a.y, x2: c.x, y2: c.y }] : [];
      case 'polyline':
        return a ? [{ type: 'polyline', points: [...this.points, c], closed: false }] : [];
      case 'rect':
        return a ? [this.rectBetween(a, c)] : [];
      case 'circle':
        return a ? [{ type: 'circle', cx: a.x, cy: a.y, r: Math.hypot(c.x - a.x, c.y - a.y) }] : [];
      case 'arc':
        if (!a) return [];
        if (!b) return [{ type: 'line', x1: a.x, y1: a.y, x2: c.x, y2: c.y }];
        return [this.arcFrom(a, b, c)];
      case 'terminal': {
        const t = snapPoint(c, TERMINAL_GRID);
        return [{ type: 'circle', cx: t.x, cy: t.y, r: 0.6 }];
      }
      case 'text':
        return [
          { type: 'text', x: c.x, y: c.y, text: this.defaultText(), size: DEFAULT_TEXT_SIZE },
        ];
      case 'select':
        return [];
    }
  }

  /** Handles of the single selected shape. */
  get handles(): Point[] {
    if (this.currentTool !== 'select' || this.selected.size !== 1) return [];
    const key = parseKey([...this.selected][0]!);
    if (!key || !('shape' in key)) return [];
    const shape = this.symbol.graphics[key.shape];
    return shape ? handlesOf(shape) : [];
  }

  /** Topmost item under a point: terminals first, then shapes from the top. */
  hitTest(p: Point): ItemKey | undefined {
    const tol = this.tolerance;
    for (const t of this.symbol.terminals) {
      if (Math.hypot(p.x - t.x, p.y - t.y) <= Math.max(tol, 0.8)) return terminalKey(t.id);
    }
    const graphics = this.symbol.graphics;
    for (let i = graphics.length - 1; i >= 0; i--) {
      if (distanceToPrimitive(p, graphics[i]!) <= tol) return shapeKey(i);
    }
    return undefined;
  }

  pointerDown(raw: Point, mods: Modifiers = {}): void {
    const p = snapPoint(raw, SHAPE_GRID);
    this.cursor = p;
    const [a, b] = this.points;
    switch (this.currentTool) {
      case 'select':
        this.selectDown(raw, mods);
        break;
      case 'line':
        if (!a) this.points = [p];
        else if (!same(a, p))
          this.addAndSelect({ type: 'line', x1: a.x, y1: a.y, x2: p.x, y2: p.y });
        break;
      case 'polyline': {
        const last = this.points.at(-1);
        if (a && this.points.length >= 3 && same(a, p)) {
          this.addAndSelect({ type: 'polyline', points: this.points, closed: true });
        } else if (!last || !same(last, p)) {
          this.points = [...this.points, p];
        }
        break;
      }
      case 'rect':
        if (!a) this.points = [p];
        else this.finishRect(p);
        break;
      case 'circle':
        if (!a) this.points = [p];
        else if (!same(a, p)) {
          this.addAndSelect({
            type: 'circle',
            cx: a.x,
            cy: a.y,
            r: clean(Math.hypot(p.x - a.x, p.y - a.y)),
          });
        }
        break;
      case 'arc':
        if (!a) this.points = [p];
        else if (!b) {
          if (!same(a, p)) this.points = [a, p];
        } else if (!same(a, p)) {
          this.addAndSelect(this.arcFrom(a, b, p));
        }
        break;
      case 'text':
        this.addAndSelect({
          type: 'text',
          x: p.x,
          y: p.y,
          text: this.defaultText(),
          size: DEFAULT_TEXT_SIZE,
        });
        this.currentTool = 'select';
        break;
      case 'terminal': {
        const added = addTerminal(this.symbol, snapPoint(raw, TERMINAL_GRID));
        this.history.set(added.symbol);
        this.selected = new Set([terminalKey(added.terminal.id)]);
        break;
      }
    }
    this.emit();
  }

  pointerMove(raw: Point): void {
    const drag = this.drag;
    this.cursor = snapPoint(raw, SHAPE_GRID);
    if (drag?.kind === 'move') {
      const step = hasTerminals(drag.keys) ? TERMINAL_GRID : SHAPE_GRID;
      const delta = snapPoint({ x: raw.x - drag.origin.x, y: raw.y - drag.origin.y }, step);
      this.history.set(moveItems(drag.base, drag.keys, delta.x, delta.y));
    } else if (drag?.kind === 'handle') {
      const shape = drag.base.graphics[drag.shape]!;
      this.history.set(
        replaceShape(drag.base, drag.shape, applyHandle(shape, drag.handle, this.cursor)),
      );
    } else if (drag?.kind === 'marquee') {
      this.marqueeRect = rectFromPoints(drag.origin, raw);
    }
    this.emit();
  }

  pointerUp(raw: Point): void {
    const drag = this.drag;
    this.drag = undefined;
    if (drag?.kind === 'marquee') {
      const rect = rectFromPoints(drag.origin, raw);
      const keys = new Set(drag.additive ? this.selected : []);
      this.symbol.graphics.forEach((shape, i) => {
        if (boundsInside(primitiveBounds(shape), rect)) keys.add(shapeKey(i));
      });
      for (const t of this.symbol.terminals) {
        if (boundsInside({ minX: t.x, maxX: t.x, minY: t.y, maxY: t.y }, rect))
          keys.add(terminalKey(t.id));
      }
      this.selected = keys;
      this.marqueeRect = undefined;
    } else if (drag) {
      this.history.commit();
    } else if (this.currentTool === 'rect' && this.points.length === 1) {
      // Drag-to-draw; a plain click instead waits for the second corner.
      const p = snapPoint(raw, SHAPE_GRID);
      if (!same(this.points[0]!, p)) this.finishRect(p);
    }
    this.emit();
  }

  doubleClick(): void {
    if (this.currentTool === 'polyline') this.finishPolyline();
    this.emit();
  }

  /** Handles a key; returns true if it was used (so the UI can prevent the default). */
  key(key: string, mods: Modifiers = {}): boolean {
    const k = key.toLowerCase();
    if (mods.ctrl) {
      if (k === 'z' && !mods.shift) this.undo();
      else if (k === 'y' || (k === 'z' && mods.shift)) this.redo();
      else if (k === 'd') this.duplicate();
      else if (k === 'c') this.copy();
      else if (k === 'x') this.cut();
      else if (k === 'v') this.paste();
      else if (k === 'a') this.select(this.allKeys());
      else return false;
      return true;
    }
    switch (key) {
      case 'Escape':
        if (this.drag) this.cancelDrag();
        else if (this.points.length) this.resetDrawing();
        else if (this.currentTool !== 'select') this.currentTool = 'select';
        else this.selected = new Set();
        break;
      case 'Enter':
        if (this.currentTool !== 'polyline') return false;
        this.finishPolyline();
        break;
      case 'Delete':
      case 'Backspace':
        if (this.selected.size === 0) return false;
        this.history.set(removeItems(this.symbol, this.selected));
        this.selected = new Set();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (this.selected.size === 0) return false;
        const step = hasTerminals(this.selected) ? TERMINAL_GRID : SHAPE_GRID;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        this.history.set(moveItems(this.symbol, this.selected, dx, dy));
        break;
      }
      default: {
        const tool = TOOL_KEYS[k];
        if (!tool) return false;
        this.currentTool = tool;
        this.resetDrawing();
      }
    }
    this.emit();
    return true;
  }

  private selectDown(raw: Point, mods: Modifiers): void {
    const handle = this.handleAt(raw);
    if (handle) {
      this.history.begin();
      this.drag = { kind: 'handle', base: this.symbol, ...handle };
      return;
    }
    const hit = this.hitTest(raw);
    if (!hit) {
      if (!mods.shift) this.selected = new Set();
      this.drag = { kind: 'marquee', origin: raw, additive: !!mods.shift };
      this.marqueeRect = rectFromPoints(raw, raw);
      return;
    }
    if (mods.shift) {
      const next = new Set(this.selected);
      if (next.has(hit)) next.delete(hit);
      else next.add(hit);
      this.selected = next;
      return;
    }
    if (!this.selected.has(hit)) this.selected = new Set([hit]);
    this.history.begin();
    this.drag = { kind: 'move', origin: raw, base: this.symbol, keys: [...this.selected] };
  }

  private handleAt(raw: Point): { shape: number; handle: number } | undefined {
    const handles = this.handles;
    const index = handles.findIndex((h) => Math.hypot(raw.x - h.x, raw.y - h.y) <= this.tolerance);
    if (index < 0) return undefined;
    const key = parseKey([...this.selected][0]!) as { shape: number };
    return { shape: key.shape, handle: index };
  }

  private addAndSelect(shape: Primitive): void {
    this.history.set(addShape(this.symbol, shape));
    this.selected = new Set([shapeKey(this.symbol.graphics.length - 1)]);
    this.points = [];
  }

  private finishRect(p: Point): void {
    const a = this.points[0]!;
    if (a.x !== p.x && a.y !== p.y) this.addAndSelect(this.rectBetween(a, p));
  }

  private finishPolyline(): void {
    if (this.points.length >= 2) {
      this.addAndSelect({ type: 'polyline', points: this.points, closed: false });
    }
    this.points = [];
  }

  private rectBetween(a: Point, b: Point): Primitive {
    return {
      type: 'rect',
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: clean(Math.abs(b.x - a.x)),
      height: clean(Math.abs(b.y - a.y)),
    };
  }

  /** Arc around `center`, from the angle of `start` clockwise to the angle of `end`. */
  private arcFrom(center: Point, start: Point, end: Point): Primitive {
    const from = angleOf(center, start);
    return {
      type: 'arc',
      cx: center.x,
      cy: center.y,
      r: clean(Math.hypot(start.x - center.x, start.y - center.y)),
      start: from,
      sweep: clean(clockwiseSweep(from, angleOf(center, end))),
    };
  }

  private defaultText(): string {
    const hasLabel = this.symbol.graphics.some(
      (p) => p.type === 'text' && p.text.includes('{label}'),
    );
    return hasLabel ? 'Testo' : '{label}';
  }

  get canPaste(): boolean {
    return !!this.clipboard;
  }

  /** Copies the selection; nothing selected keeps the previous copy. */
  copy(): void {
    if (this.selected.size === 0) return;
    this.clipboard = { clip: copyItems(this.symbol, this.selected), pasted: 1 };
    this.emit();
  }

  cut(): void {
    if (this.selected.size === 0) return;
    this.copy();
    this.clipboard!.pasted = 0;
    this.history.set(removeItems(this.symbol, this.selected));
    this.selected = new Set();
    this.emit();
  }

  /**
   * Pastes the copied items, each paste a step further down and to the right of the
   * originals (after a cut the first one goes back where they were); the copies get
   * selected.
   */
  paste(): void {
    const clipboard = this.clipboard;
    if (!clipboard) return;
    const step = TERMINAL_GRID * clipboard.pasted;
    clipboard.pasted++;
    const result = pasteItems(this.symbol, clipboard.clip, step, step);
    this.history.set(result.symbol);
    this.selected = new Set(result.keys);
    this.emit();
  }

  private duplicate(): void {
    if (this.selected.size === 0) return;
    const copy = duplicateItems(this.symbol, this.selected, TERMINAL_GRID, TERMINAL_GRID);
    this.history.set(copy.symbol);
    this.selected = new Set(copy.keys);
  }

  private allKeys(): ItemKey[] {
    return [
      ...this.symbol.graphics.map((_, i) => shapeKey(i)),
      ...this.symbol.terminals.map((t) => terminalKey(t.id)),
    ];
  }

  private cancelDrag(): void {
    if (this.drag && this.drag.kind !== 'marquee') this.history.cancel();
    this.drag = undefined;
    this.marqueeRect = undefined;
  }

  private resetDrawing(): void {
    this.points = [];
    this.cancelDrag();
  }

  private afterHistory(): void {
    this.pruneSelection();
    this.emit();
  }

  /** Drops selected keys that no longer exist. */
  private pruneSelection(): void {
    const { graphics, terminals } = this.symbol;
    const ids = new Set<TerminalId>(terminals.map((t) => t.id));
    this.selected = new Set(
      [...this.selected].filter((key) => {
        const k = parseKey(key);
        return k && ('shape' in k ? k.shape < graphics.length : ids.has(k.terminal));
      }),
    );
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

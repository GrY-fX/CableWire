import {
  copyFragment,
  freshIds,
  importSymbol,
  isEmptyFragment,
  mirrorElements,
  moveItems,
  newId,
  pasteFragment,
  placeElement,
  removeItems,
  rotateElements,
} from '@cablewire/core';
import type {
  Bounds,
  Command,
  ElementId,
  Fragment,
  JunctionId,
  Point,
  ProjectDoc,
  Rotation,
  SheetId,
  Store,
  SymbolDef,
  WireId,
} from '@cablewire/core';
import { rectFromPoints } from '../hit.ts';
import { snapPoint } from '../snap.ts';
import { elementKey, hitSheet, itemsInside, junctionKey, parseItemKey, wireKey } from './hit.ts';

export type SchematicTool = 'select' | 'place';

export interface Modifiers {
  shift?: boolean;
  ctrl?: boolean;
}

/** The symbol following the cursor while placing. */
export interface Ghost {
  symbol: SymbolDef;
  x: number;
  y: number;
  rotation: Rotation;
  mirrored: boolean;
}

type Drag =
  | { kind: 'move'; origin: Point; applied: Point; keys: string[] }
  | { kind: 'marquee'; origin: Point; additive: boolean };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * State and behaviour of the schematic editor on one sheet. All edits go through
 * core's commands and store, so undo/redo and transactions come for free.
 */
export class SchematicEditor {
  /** Hit tolerance in millimetres; the UI keeps it at a few pixels for the current zoom. */
  tolerance = 1;
  /** Message of the last command that could not be applied, for the UI. */
  lastError: string | undefined;

  private sheet: SheetId;
  private selected = new Set<string>();
  private currentTool: SchematicTool = 'select';
  private placing: Omit<Ghost, 'x' | 'y'> | undefined;
  private cursor: Point | undefined;
  private drag: Drag | undefined;
  private marqueeRect: Bounds | undefined;
  private clipboard: { fragment: Fragment; sheet: SheetId; pasted: number } | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(readonly store: Store) {
    this.sheet = store.doc.sheetOrder[0]!;
    store.subscribe(() => {
      if (!store.doc.sheets[this.sheet]) this.sheet = store.doc.sheetOrder[0]!;
      this.pruneSelection();
      this.emit();
    });
  }

  get doc(): ProjectDoc {
    return this.store.doc;
  }
  get sheetId(): SheetId {
    return this.sheet;
  }
  get selection(): ReadonlySet<string> {
    return this.selected;
  }
  get tool(): SchematicTool {
    return this.currentTool;
  }
  get marquee(): Bounds | undefined {
    return this.marqueeRect;
  }
  get cursorPoint(): Point | undefined {
    return this.cursor;
  }
  get ghost(): Ghost | undefined {
    return this.placing && this.cursor ? { ...this.placing, ...this.cursor } : undefined;
  }
  get canPaste(): boolean {
    return !!this.clipboard;
  }
  private get grid(): number {
    return this.doc.settings.gridStep;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSheet(id: SheetId): void {
    if (!this.doc.sheets[id] || id === this.sheet) return;
    this.cancelDrag();
    this.sheet = id;
    this.selected = new Set();
    this.emit();
  }

  select(keys: Iterable<string>): void {
    this.selected = new Set(keys);
    this.emit();
  }

  /** Starts placing copies of `symbol` (the version to use: library or project copy). */
  startPlacing(symbol: SymbolDef): void {
    this.cancelDrag();
    this.currentTool = 'place';
    this.placing = { symbol, rotation: 0, mirrored: false };
    this.emit();
  }

  stopPlacing(): void {
    this.currentTool = 'select';
    this.placing = undefined;
    this.emit();
  }

  undo(): void {
    this.cancelDrag();
    this.store.undo();
  }

  redo(): void {
    this.cancelDrag();
    this.store.redo();
  }

  pointerDown(raw: Point, mods: Modifiers = {}): void {
    this.cursor = snapPoint(raw, this.grid);
    if (this.currentTool === 'place') {
      this.place(this.cursor);
      this.emit();
      return;
    }
    const hit = hitSheet(this.doc, this.sheet, raw, this.tolerance);
    if (!hit) {
      if (!mods.shift) this.selected = new Set();
      this.drag = { kind: 'marquee', origin: raw, additive: !!mods.shift };
      this.marqueeRect = rectFromPoints(raw, raw);
    } else if (mods.shift) {
      const next = new Set(this.selected);
      if (next.has(hit)) next.delete(hit);
      else next.add(hit);
      this.selected = next;
    } else {
      if (!this.selected.has(hit)) this.selected = new Set([hit]);
      this.store.begin('Sposta');
      this.drag = { kind: 'move', origin: raw, applied: { x: 0, y: 0 }, keys: [...this.selected] };
    }
    this.emit();
  }

  pointerMove(raw: Point): void {
    this.cursor = snapPoint(raw, this.grid);
    const drag = this.drag;
    if (drag?.kind === 'move') {
      const delta = snapPoint({ x: raw.x - drag.origin.x, y: raw.y - drag.origin.y }, this.grid);
      const dx = delta.x - drag.applied.x;
      const dy = delta.y - drag.applied.y;
      if (dx !== 0 || dy !== 0) {
        this.run(moveItems, { ...this.split(drag.keys), dx, dy });
        drag.applied = delta;
      }
    } else if (drag?.kind === 'marquee') {
      this.marqueeRect = rectFromPoints(drag.origin, raw);
    }
    this.emit();
  }

  pointerUp(raw: Point): void {
    const drag = this.drag;
    this.drag = undefined;
    if (drag?.kind === 'move') {
      this.store.commit();
    } else if (drag?.kind === 'marquee') {
      const inside = itemsInside(this.doc, this.sheet, rectFromPoints(drag.origin, raw));
      this.selected = new Set([...(drag.additive ? this.selected : []), ...inside]);
      this.marqueeRect = undefined;
    }
    this.emit();
  }

  /** Returns the element double-clicked, if any (the UI focuses its label). */
  doubleClick(raw: Point): string | undefined {
    const hit = hitSheet(this.doc, this.sheet, raw, this.tolerance);
    if (!hit?.startsWith('element:')) return undefined;
    this.select([hit]);
    return hit;
  }

  /** Handles a key; returns true if it was used. */
  key(key: string, mods: Modifiers = {}): boolean {
    const k = key.toLowerCase();
    if (mods.ctrl) {
      if (k === 'z' && !mods.shift) this.undo();
      else if (k === 'y' || (k === 'z' && mods.shift)) this.redo();
      else if (k === 'c') this.copy();
      else if (k === 'v') this.paste();
      else if (k === 'd') this.duplicate();
      else if (k === 'a') this.selectAll();
      else return false;
      return true;
    }
    switch (key) {
      case 'Escape':
        if (this.drag) this.cancelDrag();
        else if (this.currentTool === 'place') this.stopPlacing();
        else this.select([]);
        return true;
      case 'Delete':
      case 'Backspace':
        if (this.selected.size === 0) return false;
        this.run(removeItems, this.split(this.selected));
        return true;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (this.selected.size === 0) return false;
        const g = this.grid;
        const dx = key === 'ArrowLeft' ? -g : key === 'ArrowRight' ? g : 0;
        const dy = key === 'ArrowUp' ? -g : key === 'ArrowDown' ? g : 0;
        this.run(moveItems, { ...this.split(this.selected), dx, dy });
        return true;
      }
    }
    if (k === 'r') return this.rotate();
    if (k === 'm') return this.mirror();
    return false;
  }

  rotate(): boolean {
    if (this.placing) {
      this.placing = {
        ...this.placing,
        rotation: ((this.placing.rotation + 90) % 360) as Rotation,
      };
      this.emit();
      return true;
    }
    const { elements } = this.split(this.selected);
    if (!elements.length) return false;
    this.run(rotateElements, { ids: elements, by: 90 });
    return true;
  }

  mirror(): boolean {
    if (this.placing) {
      this.placing = { ...this.placing, mirrored: !this.placing.mirrored };
      this.emit();
      return true;
    }
    const { elements } = this.split(this.selected);
    if (!elements.length) return false;
    this.run(mirrorElements, { ids: elements });
    return true;
  }

  copy(): void {
    const { elements, junctions } = this.split(this.selected);
    const fragment = copyFragment(this.doc, { elements, junctions });
    if (!isEmptyFragment(fragment)) this.clipboard = { fragment, sheet: this.sheet, pasted: 0 };
    this.emit();
  }

  /** Pastes the clipboard: shifted on the same sheet, in place on another one. */
  paste(): void {
    const clip = this.clipboard;
    if (!clip) return;
    const step = clip.sheet === this.sheet ? 2 * this.grid * (clip.pasted + 1) : 0;
    const ids = freshIds(clip.fragment);
    if (
      this.run(pasteFragment, {
        fragment: clip.fragment,
        sheetId: this.sheet,
        dx: step,
        dy: step,
        ids,
      })
    ) {
      clip.pasted++;
      this.selected = new Set([
        ...clip.fragment.elements.map((e) => elementKey(ids[e.id]!)),
        ...clip.fragment.junctions.map((j) => junctionKey(ids[j.id]!)),
        ...clip.fragment.wires.map((w) => wireKey(ids[w.id]!)),
      ]);
      this.emit();
    }
  }

  duplicate(): void {
    const previous = this.clipboard;
    this.copy();
    if (this.clipboard !== previous) this.paste();
    this.clipboard = previous;
  }

  selectAll(): void {
    const onSheet = <T extends { sheetId: SheetId; id: string }>(rows: Record<string, T>) =>
      Object.values(rows).filter((r) => r.sheetId === this.sheet);
    this.select([
      ...onSheet(this.doc.elements).map((e) => elementKey(e.id)),
      ...onSheet(this.doc.wires).map((w) => wireKey(w.id)),
      ...onSheet(this.doc.junctions).map((j) => junctionKey(j.id)),
    ]);
  }

  private place(at: Point): void {
    const placing = this.placing!;
    const { symbol } = placing;
    const existing = this.doc.symbols[symbol.id];
    const id = newId<'element'>() as ElementId;
    this.store.begin(`Inserisci ${symbol.name}`);
    const ok =
      (existing && sameJson(existing, symbol) ? true : this.run(importSymbol, { symbol })) &&
      this.run(placeElement, {
        id,
        sheetId: this.sheet,
        symbolId: symbol.id,
        x: at.x,
        y: at.y,
        rotation: placing.rotation,
        mirrored: placing.mirrored,
      });
    if (ok) {
      this.store.commit();
      this.selected = new Set([elementKey(id)]);
    } else {
      this.store.rollback();
    }
  }

  /** Runs a command, recording its error for the UI; returns true on success. */
  private run<A>(command: Command<A>, args: A): boolean {
    const result = this.store.run(command, args);
    this.lastError = result.ok ? undefined : result.error.message;
    return result.ok;
  }

  private split(keys: Iterable<string>) {
    const elements: ElementId[] = [];
    const wires: WireId[] = [];
    const junctions: JunctionId[] = [];
    for (const key of keys) {
      const k = parseItemKey(key);
      if (k?.kind === 'element') elements.push(k.id as ElementId);
      else if (k?.kind === 'wire') wires.push(k.id as WireId);
      else if (k?.kind === 'junction') junctions.push(k.id as JunctionId);
    }
    return { elements, wires, junctions };
  }

  private cancelDrag(): void {
    if (this.drag?.kind === 'move' && this.store.inTransaction) this.store.rollback();
    this.drag = undefined;
    this.marqueeRect = undefined;
  }

  /** Keeps only keys of existing items on the current sheet. */
  private pruneSelection(): void {
    const doc = this.doc;
    const keep = [...this.selected].filter((key) => {
      const k = parseItemKey(key);
      const row =
        k?.kind === 'element'
          ? doc.elements[k.id as ElementId]
          : k?.kind === 'wire'
            ? doc.wires[k.id as WireId]
            : k
              ? doc.junctions[k.id as JunctionId]
              : undefined;
      return row?.sheetId === this.sheet;
    });
    if (keep.length !== this.selected.size) this.selected = new Set(keep);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

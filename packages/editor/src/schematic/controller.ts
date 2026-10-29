import {
  addWire,
  autoRoute,
  copyFragment,
  endDirection,
  endPosition,
  freshIds,
  getPotentials,
  importSymbol,
  isEmptyFragment,
  mirrorElements,
  moveItems,
  newId,
  pasteFragment,
  placeElement,
  reconnectWire,
  removeItems,
  rotateElements,
  routeOrthogonal,
  setWireBends,
  simplifyPath,
} from '@cablewire/core';
import type {
  Bounds,
  Command,
  Direction,
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
import {
  elementKey,
  hitSheet,
  itemsInside,
  junctionKey,
  parseItemKey,
  wireKey,
  wirePath,
} from './hit.ts';
import { anchorAt, resolveAnchor, sameAnchor, wiresAt } from './wiring.ts';
import type { Anchor } from './wiring.ts';

export type SchematicTool = 'select' | 'place' | 'wire';

/** Editable points of the selected wire: middle of inner segments, and the two ends. */
export interface WireHandle {
  kind: 'segment' | 'end';
  point: Point;
  /** Segment index in the wire path, or which end. */
  index: number;
}

/** The potential of the selected wire, for highlighting. */
export interface Highlight {
  /** Keys of wires and junctions on the current sheet. */
  keys: string[];
  wires: number;
  sheets: number;
}

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
  | { kind: 'marquee'; origin: Point; additive: boolean }
  | { kind: 'segment'; wire: WireId; index: number; base: Point[] }
  | { kind: 'wire-end'; wire: WireId; end: 'from' | 'to' };

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function startDir(anchor: Anchor): Direction | undefined {
  return anchor.kind === 'end' ? anchor.dir : undefined;
}

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
  private rawCursor: Point | undefined;
  /** Wire being drawn: where it starts and the points clicked so far. */
  private wiring: { start: Anchor; clicks: Point[]; fromSelect: boolean } | undefined;
  private wiringFromSelect = false;
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
  get isWiring(): boolean {
    return !!this.wiring;
  }
  private get grid(): number {
    return this.doc.settings.gridStep;
  }

  /** Terminal, junction or wire point the cursor would connect to (wire tool and wire ends). */
  get hot(): Anchor | undefined {
    const wantsAnchor =
      this.currentTool === 'wire' || this.drag?.kind === 'wire-end' || this.hoveringFreeTerminal();
    return wantsAnchor && this.rawCursor
      ? anchorAt(this.doc, this.sheet, this.rawCursor, this.tolerance)
      : undefined;
  }

  /** Path being drawn or dragged, for the overlay. */
  get preview(): Point[] | undefined {
    const target = this.hot?.point ?? this.cursor;
    if (this.wiring && target) {
      const hot = this.hot;
      return this.wiringPath(target, hot?.kind === 'end' ? hot.dir : undefined);
    }
    if (this.drag?.kind === 'wire-end' && target) {
      const wire = this.doc.wires[this.drag.wire];
      const fixed = wire && (this.drag.end === 'from' ? wire.to : wire.from);
      const from = fixed && endPosition(this.doc, fixed);
      return from ? [from, target] : undefined;
    }
    return undefined;
  }

  /** Handles of the single selected wire. */
  get wireHandles(): WireHandle[] {
    const wire = this.selectedWire();
    const path = wire && wirePath(this.doc, wire);
    if (!path || this.currentTool !== 'select') return [];
    const handles: WireHandle[] = [];
    for (let i = 1; i < path.length - 2; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      handles.push({
        kind: 'segment',
        index: i,
        point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      });
    }
    handles.push({ kind: 'end', index: 0, point: path[0]! });
    handles.push({ kind: 'end', index: 1, point: path.at(-1)! });
    return handles;
  }

  /** Potential of the single selected wire. */
  get highlight(): Highlight | undefined {
    const wire = this.selectedWire();
    if (!wire) return undefined;
    const potentials = getPotentials(this.doc);
    const p = potentials.potentialOfWire(wire.id);
    if (p === undefined) return undefined;
    const wires = potentials.wires(p).map((id) => this.doc.wires[id]!);
    const keys = wires.filter((w) => w.sheetId === this.sheet).map((w) => wireKey(w.id));
    for (const node of potentials.nodes(p)) {
      const junction = node.startsWith('j:')
        ? this.doc.junctions[node.slice(2) as JunctionId]
        : undefined;
      if (junction?.sheetId === this.sheet) keys.push(junctionKey(junction.id));
    }
    return { keys, wires: wires.length, sheets: new Set(wires.map((w) => w.sheetId)).size };
  }

  setTool(tool: 'select' | 'wire'): void {
    this.cancelDrag();
    this.wiring = undefined;
    this.placing = undefined;
    this.currentTool = tool;
    this.emit();
  }

  /** Replaces the selected wire's bends with a fresh automatic route. */
  rerouteSelectedWire(): void {
    const wire = this.selectedWire();
    const bends = wire && autoRoute(this.doc, wire.from, wire.to);
    if (wire && bends) this.run(setWireBends, { id: wire.id, bends });
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
    this.rawCursor = raw;
    if (this.currentTool === 'place') {
      this.place(this.cursor);
      this.emit();
      return;
    }
    if (this.currentTool === 'wire') {
      this.wireDown(raw);
      this.emit();
      return;
    }
    // Handles of the selected wire come first.
    const handle = this.wireHandles.find(
      (h) => Math.hypot(raw.x - h.point.x, raw.y - h.point.y) <= this.tolerance,
    );
    const wire = this.selectedWire();
    if (handle && wire) {
      this.store.begin(handle.kind === 'segment' ? 'Sposta tratto' : 'Ricollega filo');
      this.drag =
        handle.kind === 'segment'
          ? { kind: 'segment', wire: wire.id, index: handle.index, base: wire.bends }
          : { kind: 'wire-end', wire: wire.id, end: handle.index === 0 ? 'from' : 'to' };
      this.emit();
      return;
    }
    // A click on a free terminal starts a wire, as with the wire tool.
    if (!mods.shift && this.hoveringFreeTerminal()) {
      this.currentTool = 'wire';
      this.wiringFromSelect = true;
      this.wireDown(raw);
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
    this.rawCursor = raw;
    const drag = this.drag;
    if (drag?.kind === 'segment') {
      this.dragSegment(drag, this.cursor);
    } else if (drag?.kind === 'move') {
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
    if (drag?.kind === 'move' || drag?.kind === 'segment') {
      this.store.commit();
    } else if (drag?.kind === 'wire-end') {
      this.reconnect(drag, anchorAt(this.doc, this.sheet, raw, this.tolerance));
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
        else if (this.wiring) this.endWiring();
        else if (this.currentTool !== 'select') this.setTool('select');
        else this.select([]);
        this.emit();
        return true;
      case 'Delete':
      case 'Backspace':
        if (this.wiring) {
          // Undo the last click of the wire being drawn.
          this.wiring.clicks.pop();
          this.emit();
          return true;
        }
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
    if (k === 'w') {
      this.setTool('wire');
      return true;
    }
    if (k === 's') {
      this.setTool('select');
      return true;
    }
    return false;
  }

  private wireDown(raw: Point): void {
    const anchor = anchorAt(this.doc, this.sheet, raw, this.tolerance);
    const wiring = this.wiring;
    if (!wiring) {
      if (anchor) this.wiring = { start: anchor, clicks: [], fromSelect: this.wiringFromSelect };
      this.wiringFromSelect = false;
      return;
    }
    if (anchor && !sameAnchor(anchor, wiring.start)) {
      this.finishWire(anchor);
      return;
    }
    // A click on empty space fixes a point the wire must pass through.
    const p = snapPoint(raw, this.grid);
    if (!same(p, wiring.clicks.at(-1) ?? wiring.start.point)) wiring.clicks.push(p);
  }

  /** Orthogonal path from the wire's start, through the clicked points, to `target`. */
  private wiringPath(target: Point, targetDir: Direction | undefined): Point[] {
    const { start, clicks } = this.wiring!;
    const points = [start.point];
    let last = start.point;
    let lastDir = startDir(start);
    for (const c of clicks) {
      points.push(...routeOrthogonal(last, lastDir, c, undefined, this.grid), c);
      last = c;
      lastDir = undefined;
    }
    points.push(...routeOrthogonal(last, lastDir, target, targetDir, this.grid), target);
    return simplifyPath(points);
  }

  private finishWire(target: Anchor): void {
    const { start } = this.wiring!;
    const path = this.preview!;
    this.store.begin('Collega filo');
    const from = resolveAnchor(this.store, this.sheet, start);
    const to = from && resolveAnchor(this.store, this.sheet, target);
    const ok =
      !!from &&
      !!to &&
      this.run(addWire, {
        id: newId<'wire'>() as WireId,
        from,
        to,
        bends: path.slice(1, -1),
      });
    if (ok) this.store.commit();
    else {
      this.store.rollback();
      this.lastError ??= 'Impossibile collegare qui il filo.';
    }
    this.endWiring();
  }

  /** Ends the wire being drawn; back to Select if it was started from a free terminal. */
  private endWiring(): void {
    if (this.wiring?.fromSelect) this.currentTool = 'select';
    this.wiring = undefined;
  }

  private dragSegment(drag: Extract<Drag, { kind: 'segment' }>, p: Point): void {
    const wire = this.doc.wires[drag.wire];
    const path = wire && wirePath(this.doc, wire);
    if (!path) return;
    // Path index i is bend i-1: segment i runs between bends i-1 and i.
    const bends = drag.base.map((b) => ({ ...b }));
    const a = bends[drag.index - 1]!;
    const b = bends[drag.index]!;
    if (a.y === b.y) a.y = b.y = p.y;
    else a.x = b.x = p.x;
    this.run(setWireBends, { id: drag.wire, bends });
  }

  private reconnect(drag: Extract<Drag, { kind: 'wire-end' }>, anchor: Anchor | undefined): void {
    const wire = this.doc.wires[drag.wire];
    if (!wire || anchor?.kind !== 'end') {
      this.store.rollback();
      return;
    }
    const fixed = drag.end === 'from' ? wire.to : wire.from;
    const fixedPoint = endPosition(this.doc, fixed);
    const bends = fixedPoint
      ? routeOrthogonal(
          fixedPoint,
          endDirection(this.doc, fixed),
          anchor.point,
          anchor.dir,
          this.grid,
        )
      : [];
    const ok = this.run(reconnectWire, {
      id: wire.id,
      end: drag.end,
      target: anchor.end,
      bends: drag.end === 'from' ? [...bends].reverse() : bends,
    });
    if (ok) this.store.commit();
    else this.store.rollback();
  }

  private selectedWire() {
    if (this.selected.size !== 1) return undefined;
    const k = parseItemKey([...this.selected][0]!);
    return k?.kind === 'wire' ? this.doc.wires[k.id as WireId] : undefined;
  }

  private hoveringFreeTerminal(): boolean {
    if (this.currentTool !== 'select' || !this.rawCursor || this.drag) return false;
    const a = anchorAt(this.doc, this.sheet, this.rawCursor, this.tolerance / 1.5);
    return a?.kind === 'end' && 'element' in a.end && wiresAt(this.doc, a.end) === 0;
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

import { newId } from './ids.ts';
import type { ElementId, JunctionId, SheetId, SymbolId, TerminalId, WireId } from './ids.ts';

/** Coordinates are millimetres, origin top-left, Y pointing down (as in SVG). */
export interface Point {
  x: number;
  y: number;
}

export type Rotation = 0 | 90 | 180 | 270;
export type Direction = 'n' | 'e' | 's' | 'w';

export type SheetSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';

export interface Sheet {
  id: SheetId;
  title: string;
  size: SheetSize;
  orientation: 'landscape' | 'portrait';
  /** Grid used for cross references (columns 1..n, rows A..). */
  rows: number;
  cols: number;
}

export type Primitive =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'polyline'; points: Point[]; closed: boolean; filled?: boolean }
  /** Angles in degrees, clockwise from the positive X axis. */
  | { type: 'arc'; cx: number; cy: number; r: number; start: number; sweep: number }
  | { type: 'circle'; cx: number; cy: number; r: number; filled?: boolean }
  | { type: 'rect'; x: number; y: number; width: number; height: number; filled?: boolean }
  /**
   * (x, y) is the anchor point, vertically centred. `{field}` placeholders are replaced
   * with the element's info values when drawn.
   */
  | {
      type: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      anchor?: 'start' | 'middle' | 'end';
    };

export interface SymbolTerminal {
  id: TerminalId;
  name: string;
  /** Position relative to the symbol's insertion point. */
  x: number;
  y: number;
  /** Side the wire leaves from. */
  dir: Direction;
}

export type SymbolKind = 'simple' | 'master' | 'slave' | 'report' | 'terminal' | 'plc';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  category: string;
  kind: SymbolKind;
  graphics: Primitive[];
  terminals: SymbolTerminal[];
  /** Pairs of terminals that are internally the same potential (e.g. feed-through terminal). */
  bridges: [TerminalId, TerminalId][];
  defaultInfo: Record<string, string>;
  version: number;
}

export interface Element {
  id: ElementId;
  sheetId: SheetId;
  symbolId: SymbolId;
  x: number;
  y: number;
  rotation: Rotation;
  mirrored: boolean;
  /** Free fields: label, function, location, plc_address, ... */
  info: Record<string, string>;
  /** Partner element for sheet references and master/slave links. */
  link?: ElementId;
}

export interface Junction {
  id: JunctionId;
  sheetId: SheetId;
  x: number;
  y: number;
}

export type WireEnd = { element: ElementId; terminal: TerminalId } | { junction: JunctionId };

export interface WireProps {
  number?: string;
  numberLocked?: boolean;
  section?: string;
  color?: string;
}

export interface Wire {
  id: WireId;
  sheetId: SheetId;
  from: WireEnd;
  to: WireEnd;
  /** Intermediate bend points; the wire is drawn from → bends → to. */
  bends: Point[];
  props: WireProps;
}

export interface ProjectMeta {
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  /** Snap grid step in millimetres. */
  gridStep: number;
}

export interface ProjectDoc {
  formatVersion: 1;
  meta: ProjectMeta;
  settings: ProjectSettings;
  sheetOrder: SheetId[];
  sheets: Record<SheetId, Sheet>;
  symbols: Record<SymbolId, SymbolDef>;
  elements: Record<ElementId, Element>;
  wires: Record<WireId, Wire>;
  junctions: Record<JunctionId, Junction>;
}

export const DEFAULT_GRID_STEP = 2.5;

export function createSheet(title: string, id: SheetId = newId()): Sheet {
  return { id, title, size: 'A3', orientation: 'landscape', rows: 6, cols: 10 };
}

/** A new project with a single empty sheet. */
export function createEmptyProject(title = '', now = new Date().toISOString()): ProjectDoc {
  const sheet = createSheet('1');
  return {
    formatVersion: 1,
    meta: { title, author: '', createdAt: now, updatedAt: now },
    settings: { gridStep: DEFAULT_GRID_STEP },
    sheetOrder: [sheet.id],
    sheets: { [sheet.id]: sheet } as Record<SheetId, Sheet>,
    symbols: {},
    elements: {},
    wires: {},
    junctions: {},
  };
}

export function isJunctionEnd(end: WireEnd): end is { junction: JunctionId } {
  return 'junction' in end;
}

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
  author?: string;
  /** SPDX identifier, e.g. `CC0-1.0`. */
  license?: string;
  /** Sheet references (kind `report`): incoming or outgoing; links join one of each. */
  report?: 'in' | 'out';
  /** Contacts (kind `slave`): normally open, normally closed, changeover or power. */
  contact?: ContactType;
  /** Masters: a coil or a command device (breaker, switch...); coil when missing. */
  master?: MasterType;
}

export type ContactType = 'no' | 'nc' | 'changeover' | 'power';
export type MasterType = 'coil' | 'device';
/** How a master shows its contacts: an NA | NC table, or the contacts drawn small. */
export type XrefStyle = 'table' | 'contacts';

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
  /**
   * Masters: vertical shift of the contacts (table or drawn) from their default place,
   * in mm. A table always stays centred on the master's X axis.
   */
  xrefOffset?: number;
  /** Masters with drawn contacts: horizontal shift from their place on the right, in mm. */
  xrefOffsetX?: number;
  /** Masters: style of the contacts, instead of the project's for this kind of master. */
  xrefStyle?: XrefStyle;
  /** Terminals: id of their terminal strip (see ProjectSettings.terminalStrips). */
  strip?: string;
  /** Terminals: number within the strip (text: `PE` or `5a` are allowed). */
  terminalNo?: string;
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

/** Where a potential's number can come from, before falling back to the pattern. */
export type NumberSource = 'plc' | 'terminal' | 'label';

export interface NumberingSettings {
  /** Number new potentials as soon as they are drawn. */
  auto: boolean;
  /** E.g. `{foglio}.{n:2}`; must contain `{n}`. */
  pattern: string;
  /** First value of the counter. */
  start: number;
  /** Sources in priority order (empty: pattern only). */
  sources: NumberSource[];
  /** Terminal source: `number` takes what follows the last ":" of the label (X1:5 → 5). */
  terminalStyle?: 'number' | 'full';
  /**
   * PLC cards (symbols of kind `plc`): address of a wire on a numbered terminal, from the
   * card's byte (its PLC address field) and the terminal name, e.g. `{byte}.{morsetto}`.
   */
  plcPattern?: string;
}

export const DEFAULT_NUMBERING: NumberingSettings = {
  auto: true,
  pattern: '{foglio}.{n:2}',
  start: 1,
  sources: ['plc'],
  terminalStyle: 'number',
  plcPattern: '{byte}.{morsetto}',
};

/**
 * A terminal strip: named from the project's pattern on its sheet (`sheet`), or with
 * a name of its own usable on every sheet (`custom`).
 */
export interface TerminalStrip {
  id: string;
  mode: 'sheet' | 'custom';
  /** Custom strips: their name. */
  name?: string;
  /** Sheet strips: the sheet they belong to. */
  sheetId?: SheetId;
}

export interface ProjectSettings {
  /** Snap grid step in millimetres. */
  gridStep: number;
  /** Wire numbering; missing in older files, see getNumbering(). */
  numbering?: NumberingSettings;
  /**
   * Text next to a sheet reference telling where the wire continues, e.g.
   * `→ {foglio}.{colonna}`; see DEFAULT_REFERENCE_PATTERN.
   */
  referencePattern?: string;
  /**
   * Text next to a contact telling where its coil is, e.g. `/{foglio}.{colonna}`;
   * see DEFAULT_MASTER_REF_PATTERN.
   */
  masterRefPattern?: string;
  /** Contacts of masters (table or drawn); shown unless set to false. */
  showXref?: boolean;
  /** Style of the contacts per kind of master; see DEFAULT_XREF_STYLES. */
  xrefStyles?: Partial<Record<MasterType, XrefStyle>>;
  /** Terminal strips, in order of creation. */
  terminalStrips?: TerminalStrip[];
  /** Name of strips that belong to a sheet, e.g. `{foglio}X{n}`; see DEFAULT_STRIP_PATTERN. */
  stripPattern?: string;
}

export function getNumbering(doc: ProjectDoc): NumberingSettings {
  return { ...DEFAULT_NUMBERING, ...doc.settings.numbering };
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

/** Paper and reference grid of a sheet, without its identity. */
export type SheetFormat = Pick<Sheet, 'size' | 'orientation' | 'rows' | 'cols'>;

export const DEFAULT_SHEET_FORMAT: SheetFormat = {
  size: 'A4',
  orientation: 'landscape',
  rows: 6,
  cols: 10,
};

export function createSheet(
  title: string,
  id: SheetId = newId(),
  format: SheetFormat = DEFAULT_SHEET_FORMAT,
): Sheet {
  const { size, orientation, rows, cols } = format;
  return { id, title, size, orientation, rows, cols };
}

/** A new project with a single empty sheet. */
export function createEmptyProject(
  title = '',
  now = new Date().toISOString(),
  format: SheetFormat = DEFAULT_SHEET_FORMAT,
): ProjectDoc {
  const sheet = createSheet('1', undefined, format);
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

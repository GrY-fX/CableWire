import { parsePattern, formatPattern } from './autonumber/rule.ts';
import { endPosition } from './geometry.ts';
import type { CableId, SheetId, WireId } from './ids.ts';
import type { Cable, Conductor, Point, ProjectDoc, Wire } from './model.ts';

// Cables: several wires gathered in one cable, each in a conductor with a colour code
// or a number. Membership belongs to the single wire, not to its potential. The cable
// shows on every sheet where it has wires as a mark across them (see cableMarkLayout).

export const DEFAULT_CABLE_PATTERN = '{foglio}W{n}';
export const PE_CODE = 'GNYE';

export function getCablePattern(doc: ProjectDoc): string {
  return doc.settings.cablePattern ?? DEFAULT_CABLE_PATTERN;
}

/** The cable and conductor of every wire in a cable; memoized per document version. */
const membership = new WeakMap<ProjectDoc, Map<WireId, { cable: Cable; conductor: Conductor }>>();

export function cableOfWire(
  doc: ProjectDoc,
  wire: WireId,
): { cable: Cable; conductor: Conductor } | undefined {
  let map = membership.get(doc);
  if (!map) {
    map = new Map();
    for (const cable of Object.values(doc.cables)) {
      for (const conductor of cable.conductors) {
        if (conductor.wire) map.set(conductor.wire, { cable, conductor });
      }
    }
    membership.set(doc, map);
  }
  return map.get(wire);
}

/** A conductor without its wire (a spare). */
export function spareConductor(c: Conductor): Conductor {
  const next = { ...c };
  delete next.wire;
  return next;
}

/** E.g. 5G2,5 (with a green-yellow conductor) or 4x1,5; just the count without section. */
export function cableFormation(cable: Cable): string {
  const n = cable.conductors.length;
  if (n === 0) return '';
  const section = cable.section?.trim();
  if (!section) return `${n}`;
  const pe = cable.conductors.some((c) => c.code === PE_CODE);
  return `${n}${pe ? 'G' : 'x'}${section}`;
}

/**
 * Conductor codes for a new cable of n wires (CEI UNEL 00722 sequence), with the
 * protective conductor last when there is one; above five, numbered conductors.
 */
export function defaultConductorCodes(
  n: number,
  withPe: boolean,
): { codes: string[]; numbered: boolean } {
  const coloured: Record<number, [string[], string[]]> = {
    1: [['BN'], [PE_CODE]],
    2: [
      ['BU', 'BN'],
      ['BN', PE_CODE],
    ],
    3: [
      ['BN', 'BK', 'GY'],
      ['BU', 'BN', PE_CODE],
    ],
    4: [
      ['BU', 'BN', 'BK', 'GY'],
      ['BN', 'BK', 'GY', PE_CODE],
    ],
    5: [[], ['BU', 'BN', 'BK', 'GY', PE_CODE]],
  };
  const pick = coloured[n]?.[withPe ? 1 : 0];
  if (pick?.length) return { codes: [...pick], numbered: false };
  const count = withPe ? n - 1 : n;
  const codes = Array.from({ length: count }, (_, i) => String(i + 1));
  return { codes: withPe ? [...codes, PE_CODE] : codes, numbered: true };
}

/** The next code after the ones in use: next number, or a colour not used yet. */
export function nextConductorCode(cable: Cable): string {
  const used = new Set(cable.conductors.map((c) => c.code));
  if (cable.numbered) {
    let n = 1;
    while (used.has(String(n))) n++;
    return String(n);
  }
  return ['BU', 'BN', 'BK', 'GY', 'OG', 'VT', 'RD', 'WH'].find((c) => !used.has(c)) ?? '';
}

/** Sheet number of a cable: where its first wire is (for the label and reading order). */
export function cableSheet(doc: ProjectDoc, cable: Cable): SheetId | undefined {
  const sheets = cableSheets(doc, cable);
  return sheets[0];
}

/** Sheets where a cable has wires, in sheet order. */
export function cableSheets(doc: ProjectDoc, cable: Cable): SheetId[] {
  const on = new Set<SheetId>();
  for (const c of cable.conductors) {
    const wire = c.wire && doc.wires[c.wire];
    if (wire) on.add(wire.sheetId);
  }
  return doc.sheetOrder.filter((s) => on.has(s));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first free label of the cable pattern on a sheet. */
export function nextCableLabel(
  doc: ProjectDoc,
  sheetId: SheetId,
  taken: Iterable<string> = [],
): string {
  const parsed = parsePattern(getCablePattern(doc));
  const sheetNo = doc.sheetOrder.indexOf(sheetId) + 1;
  if (!parsed.ok) return `W${Object.keys(doc.cables).length + 1}`;
  const source = parsed.tokens
    .map((t) =>
      t.kind === 'text'
        ? escape(t.text)
        : t.kind === 'counter'
          ? '(\\d+)'
          : t.kind === 'sheet'
            ? String(sheetNo)
            : '\\d+',
    )
    .join('');
  const re = new RegExp(`^${source}$`);
  const used = new Set<number>();
  for (const label of [...Object.values(doc.cables).map((c) => c.label), ...taken]) {
    const m = re.exec(label);
    if (m?.[1]) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return formatPattern(parsed.tokens, { n, sheet: sheetNo, column: 1 });
}

/** Points of a wire, from one end through its bends to the other. */
export function wirePoints(doc: ProjectDoc, wire: Wire): Point[] | undefined {
  const a = endPosition(doc, wire.from);
  const b = endPosition(doc, wire.to);
  return a && b ? [a, ...wire.bends, b] : undefined;
}

export interface CableMarkLayout {
  cable: CableId;
  /** `y`: the wires run vertically and the mark is a horizontal line at y = at. */
  axis: 'x' | 'y';
  at: number;
  /** Where the mark crosses each wire, left to right (or top to bottom). */
  crossings: { wire: WireId; x: number; y: number }[];
  line: { x1: number; y1: number; x2: number; y2: number };
  /** Label and formation, e.g. "W1 5G2,5", after the end of the line. */
  label: { x: number; y: number; text: string };
}

type Run = { wire: WireId; across: number; from: number; to: number };

/** Straight runs of the cable's wires on a sheet, along one axis. */
function runs(doc: ProjectDoc, cable: Cable, sheetId: SheetId, axis: 'x' | 'y'): Run[] {
  const out: Run[] = [];
  for (const c of cable.conductors) {
    const wire = c.wire && doc.wires[c.wire];
    if (!wire || wire.sheetId !== sheetId) continue;
    const pts = wirePoints(doc, wire);
    if (!pts) continue;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      // axis y: vertical runs (same x), crossed by a horizontal mark.
      if (axis === 'y' && a.x === b.x && a.y !== b.y) {
        out.push({ wire: wire.id, across: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) });
      }
      if (axis === 'x' && a.y === b.y && a.x !== b.x) {
        out.push({ wire: wire.id, across: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) });
      }
    }
  }
  return out;
}

/**
 * Default place of a mark: a quarter along the span shared by the wires (the middle
 * is where wire numbers go), or the middle of all of them.
 */
function defaultAt(list: Run[]): number {
  const byWire = new Map<WireId, Run>();
  for (const r of list) {
    const best = byWire.get(r.wire);
    if (!best || r.to - r.from > best.to - best.from) byWire.set(r.wire, r);
  }
  const longest = [...byWire.values()];
  const from = Math.max(...longest.map((r) => r.from));
  const to = Math.min(...longest.map((r) => r.to));
  const at =
    from <= to
      ? from + (to - from) / 4
      : longest.reduce((s, r) => s + (r.from + r.to) / 2, 0) / longest.length;
  return Math.round(at / 2.5) * 2.5;
}

/** How a cable's mark is drawn on a sheet; undefined when it has no straight wire there. */
export function cableMarkLayout(
  doc: ProjectDoc,
  cable: Cable,
  sheetId: SheetId,
): CableMarkLayout | undefined {
  const vertical = runs(doc, cable, sheetId, 'y');
  const horizontal = runs(doc, cable, sheetId, 'x');
  const wiresOf = (list: Run[]) => new Set(list.map((r) => r.wire)).size;
  const longest = (list: Run[]) => Math.max(0, ...list.map((r) => r.to - r.from));
  // The direction most wires run in; on a tie, the one with the longest run.
  const byCount = wiresOf(vertical) - wiresOf(horizontal);
  const axis =
    byCount > 0 ? 'y' : byCount < 0 ? 'x' : longest(vertical) >= longest(horizontal) ? 'y' : 'x';
  const list = axis === 'y' ? vertical : horizontal;
  if (list.length === 0) return undefined;
  const at = cable.marks[sheetId]?.at ?? defaultAt(list);
  const crossings: CableMarkLayout['crossings'] = [];
  for (const r of list) {
    if (at < r.from || at > r.to || crossings.some((c) => c.wire === r.wire)) continue;
    crossings.push(
      axis === 'y' ? { wire: r.wire, x: r.across, y: at } : { wire: r.wire, x: at, y: r.across },
    );
  }
  if (crossings.length === 0) return undefined;
  crossings.sort((a, b) => (axis === 'y' ? a.x - b.x : a.y - b.y));
  const first = crossings[0]!;
  const last = crossings.at(-1)!;
  const formation = cableFormation(cable);
  const text = formation ? `${cable.label} ${formation}` : cable.label;
  const line =
    axis === 'y'
      ? { x1: first.x - 1.5, y1: at, x2: last.x + 1.5, y2: at }
      : { x1: at, y1: first.y - 1.5, x2: at, y2: last.y + 1.5 };
  const label =
    axis === 'y' ? { x: line.x2 + 1, y: at, text } : { x: at + 1, y: line.y2 + 2, text };
  return { cable: cable.id, axis, at, crossings, line, label };
}

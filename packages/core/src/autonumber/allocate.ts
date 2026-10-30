import { endPosition } from '../geometry.ts';
import type { SheetId, WireId } from '../ids.ts';
import type { Point, ProjectDoc, Wire } from '../model.ts';
import { getNumbering } from '../model.ts';
import { potentialNumberOps } from '../numbering.ts';
import type { Op } from '../ops.ts';
import { getPotentials } from '../potentials.ts';
import { columnAt } from '../sheet.ts';
import { formatPattern, parsePattern } from './rule.ts';
import { sourceValues } from './sources.ts';
import type { PatternContext, PatternToken } from './rule.ts';

/** A potential that has wires, with where it "starts" in reading order. */
export interface PotentialInfo {
  wires: Wire[];
  /** Wire used to address the potential in commands. */
  wire: WireId;
  number: string | undefined;
  locked: boolean;
  sheet: SheetId;
  /** Pattern context of the starting point (n is filled in later). */
  context: Omit<PatternContext, 'n'>;
}

type Key = [sheet: number, column: number, y: number, x: number];

const before = (a: Key, b: Key) => {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
};

/**
 * Potentials with at least one wire, in reading order: sheets in project order,
 * then by column of the reference grid, then top to bottom, then left to right.
 * A potential starts at its first point in that order.
 */
export function potentialsInReadingOrder(doc: ProjectDoc): PotentialInfo[] {
  const potentials = getPotentials(doc);
  const infos: { info: PotentialInfo; key: Key }[] = [];
  for (let p = 0; p < potentials.count; p++) {
    const wires = potentials.wires(p).map((id) => doc.wires[id]!);
    if (wires.length === 0) continue;
    let best: { key: Key; sheet: SheetId; point: Point } | undefined;
    for (const w of wires) {
      const sheet = doc.sheets[w.sheetId];
      if (!sheet) continue;
      const sheetIndex = doc.sheetOrder.indexOf(w.sheetId) + 1;
      const ends = [endPosition(doc, w.from), endPosition(doc, w.to)];
      for (const point of [...ends, ...w.bends]) {
        if (!point) continue;
        const key: Key = [sheetIndex, columnAt(sheet, point), point.y, point.x];
        if (!best || before(key, best.key)) best = { key, sheet: w.sheetId, point };
      }
    }
    if (!best) continue;
    const numbered = wires.find((w) => w.props.number);
    infos.push({
      key: best.key,
      info: {
        wires,
        wire: wires[0]!.id,
        number: numbered?.props.number,
        locked: wires.some((w) => w.props.numberLocked && w.props.number),
        sheet: best.sheet,
        context: { sheet: best.key[0], column: best.key[1] },
      },
    });
  }
  return infos
    .sort((a, b) => (before(a.key, b.key) ? -1 : before(b.key, a.key) ? 1 : 0))
    .map((i) => i.info);
}

/** First number from `start` that the pattern does not produce for an already used value. */
export function nextFreeNumber(
  tokens: readonly PatternToken[],
  context: Omit<PatternContext, 'n'>,
  start: number,
  used: ReadonlySet<string>,
): string {
  for (let n = start; n < start + 1_000_000; n++) {
    const value = formatPattern(tokens, { ...context, n });
    if (!used.has(value)) return value;
  }
  throw new Error('No free wire number');
}

function tokensOf(doc: ProjectDoc): PatternToken[] | undefined {
  const parsed = parsePattern(getNumbering(doc).pattern);
  return parsed.ok ? parsed.tokens : undefined;
}

/**
 * Ops numbering the potential of `wireId` if automatic numbering is on and the
 * potential has no number yet.
 */
export function autoNumberOps(doc: ProjectDoc, wireId: WireId): Op[] {
  const settings = getNumbering(doc);
  const tokens = tokensOf(doc);
  if (!settings.auto || !tokens) return [];
  const infos = potentialsInReadingOrder(doc);
  const info = infos.find((i) => i.wires.some((w) => w.id === wireId));
  if (!info || info.number) return [];
  // A source (PLC address, terminal...) wins over the counter; with several values the
  // first is used and the potential shows up as a conflict to resolve.
  const fromSource = sourceValues(doc, wireId)?.values[0]?.value;
  const used = new Set(infos.flatMap((i) => (i.number ? [i.number] : [])));
  const number = fromSource ?? nextFreeNumber(tokens, info.context, settings.start, used);
  return potentialNumberOps(doc, wireId, number, false);
}

/** Potentials with a locked number, on one sheet (where they start) or in the whole project. */
export function countLocked(doc: ProjectDoc, sheetId?: SheetId): number {
  return potentialsInReadingOrder(doc).filter(
    (i) => i.locked && (sheetId === undefined || i.sheet === sheetId),
  ).length;
}

/**
 * Ops renumbering potentials in reading order, on one sheet (the sheet where they
 * start) or on the whole project. Locked numbers stay and are never reused; the
 * others are packed, which closes the gaps left by deleted wires.
 */
export function renumberOps(doc: ProjectDoc, sheetId?: SheetId): Op[] {
  const tokens = tokensOf(doc);
  if (!tokens) return [];
  const { start } = getNumbering(doc);
  const infos = potentialsInReadingOrder(doc);
  const inScope = (i: PotentialInfo) => sheetId === undefined || i.sheet === sheetId;
  const used = new Set(
    infos.flatMap((i) => ((!inScope(i) || i.locked) && i.number ? [i.number] : [])),
  );
  const todo = infos.filter((i) => inScope(i) && !i.locked);
  // Source values first, so that the counter never produces one of them.
  const fromSource = new Map<PotentialInfo, string>();
  for (const info of todo) {
    const value = sourceValues(doc, info.wire)?.values[0]?.value;
    if (value) {
      fromSource.set(info, value);
      used.add(value);
    }
  }
  const ops: Op[] = [];
  for (const info of todo) {
    let number = fromSource.get(info);
    if (number === undefined) {
      number = nextFreeNumber(tokens, info.context, start, used);
      used.add(number);
    }
    ops.push(...potentialNumberOps(doc, info.wire, number, false));
  }
  return ops;
}

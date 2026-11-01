import { parsePattern } from './autonumber/rule.ts';
import type { PatternToken } from './autonumber/rule.ts';
import { formatPattern } from './autonumber/rule.ts';
import type { ElementId, SheetId } from './ids.ts';
import type { Element, Point, ProjectDoc, SymbolDef } from './model.ts';
import type { Op } from './ops.ts';
import { patch } from './ops.ts';
import { columnAt } from './sheet.ts';

// Automatic labels: a default field of a symbol may be a pattern such as
// `{foglio}K{n}`. Placing the symbol fills it with the first free number for that
// pattern on the sheet (1K1, 1K2... on sheet 1, 5K1 on sheet 5). The result is a
// plain value, editable by hand; "Ricalcola sigle" renumbers the values that still
// follow their pattern, in reading order.

/** Fields of a symbol whose default value is a numbering pattern (with `{n}`). */
export function labelPatterns(symbol: SymbolDef): { key: string; tokens: PatternToken[] }[] {
  return Object.entries(symbol.defaultInfo).flatMap(([key, value]) => {
    if (!/\{\s*n(?::\d)?\s*\}/.test(value)) return [];
    const parsed = parsePattern(value);
    return parsed.ok ? [{ key, tokens: parsed.tokens }] : [];
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regular expression matching values of a pattern; group 1 is the counter. */
function patternRegex(tokens: readonly PatternToken[], sheet?: number): RegExp {
  const source = tokens
    .map((t) => {
      switch (t.kind) {
        case 'text':
          return escape(t.text);
        case 'counter':
          return '(\\d+)';
        case 'sheet':
          return sheet === undefined ? '\\d+' : String(sheet);
        case 'column':
          return '\\d+';
      }
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/** Whether a value follows a pattern (on any sheet). */
export function followsPattern(value: string, tokens: readonly PatternToken[]): boolean {
  return patternRegex(tokens).test(value);
}

/**
 * The first free value of a pattern on a sheet, at a position (for `{colonna}`),
 * given the values already used there plus `taken`.
 */
export function nextLabel(
  doc: ProjectDoc,
  sheetId: SheetId,
  key: string,
  tokens: readonly PatternToken[],
  at: Point,
  taken: Iterable<string> = [],
): string {
  const sheet = doc.sheets[sheetId];
  const sheetNo = doc.sheetOrder.indexOf(sheetId) + 1;
  const re = patternRegex(tokens, sheetNo);
  const used = new Set<number>();
  const values = [
    ...Object.values(doc.elements)
      .filter((e) => e.sheetId === sheetId)
      .map((e) => e.info[key] ?? ''),
    ...taken,
  ];
  for (const value of values) {
    const m = re.exec(value);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  const column = sheet ? columnAt(sheet, at) : 1;
  return formatPattern(tokens, { n, sheet: sheetNo, column });
}

/**
 * Default info of a symbol for a new element on a sheet: numbering patterns get their
 * next value; `{foglio}` and `{colonna}` alone are filled in. Values in `taken` count
 * as used (several elements placed at once).
 */
export function resolveDefaultInfo(
  doc: ProjectDoc,
  sheetId: SheetId,
  symbol: SymbolDef,
  at: Point,
  taken: Record<string, string[]> = {},
): Record<string, string> {
  const info = { ...symbol.defaultInfo };
  const sheet = doc.sheets[sheetId];
  const sheetNo = String(doc.sheetOrder.indexOf(sheetId) + 1);
  const column = String(sheet ? columnAt(sheet, at) : 1);
  for (const [key, value] of Object.entries(info)) {
    if (!value.includes('{')) continue;
    info[key] = value.replace(/\{\s*foglio\s*\}/g, sheetNo).replace(/\{\s*colonna\s*\}/g, column);
  }
  for (const { key, tokens } of labelPatterns(symbol)) {
    info[key] = nextLabel(doc, sheetId, key, tokens, at, taken[key] ?? []);
  }
  return info;
}

/** Position of an element for numbering: sheet, column, then top to bottom. */
function numberingOrder(doc: ProjectDoc) {
  return (a: Element, b: Element) => {
    const sa = doc.sheets[a.sheetId];
    const sb = doc.sheets[b.sheetId];
    return (
      doc.sheetOrder.indexOf(a.sheetId) - doc.sheetOrder.indexOf(b.sheetId) ||
      (sa && sb ? columnAt(sa, a) - columnAt(sb, b) : 0) ||
      a.y - b.y ||
      a.x - b.x
    );
  };
}

/**
 * Ops renumbering, on one sheet or on all, the fields that still follow their
 * symbol's pattern (values written by hand are kept), in reading order: by sheet,
 * column, then top to bottom. Symbols with the same pattern share the counter.
 */
export function renumberLabelsOps(doc: ProjectDoc, sheetId?: SheetId): Op[] {
  const sheets = sheetId === undefined ? doc.sheetOrder : [sheetId];
  const ops: Op[] = [];
  const changed = new Map<ElementId, Record<string, string>>();
  for (const sheet of sheets) {
    const elements = Object.values(doc.elements)
      .filter((e) => e.sheetId === sheet)
      .sort(numberingOrder(doc));
    const counters = new Map<string, number>();
    const sheetNo = doc.sheetOrder.indexOf(sheet) + 1;
    const grid = doc.sheets[sheet];
    for (const element of elements) {
      const symbol = doc.symbols[element.symbolId];
      if (!symbol) continue;
      for (const { key, tokens } of labelPatterns(symbol)) {
        const value = element.info[key] ?? '';
        if (!followsPattern(value, tokens)) continue;
        const group = `${key}|${symbol.defaultInfo[key]}`;
        const n = (counters.get(group) ?? 0) + 1;
        counters.set(group, n);
        const column = grid ? columnAt(grid, element) : 1;
        const next = formatPattern(tokens, { n, sheet: sheetNo, column });
        if (next === value) continue;
        const info = changed.get(element.id) ?? { ...element.info };
        info[key] = next;
        changed.set(element.id, info);
      }
    }
  }
  for (const [id, info] of changed) ops.push(patch('elements', id, { info }));
  return ops;
}

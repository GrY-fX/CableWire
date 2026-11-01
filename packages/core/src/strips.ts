import type { ElementId } from './ids.ts';
import type { Element, ProjectDoc, TerminalStrip } from './model.ts';
import type { Op } from './ops.ts';
import { patch } from './ops.ts';
import { columnAt } from './sheet.ts';

// Terminal strips: every terminal (symbol of kind `terminal`) may belong to a strip of
// the project and have a number in it; it is then labelled `strip:number` (X1:1).
// A strip is named from the project's pattern on its sheet (1X1, 1X2 on sheet 1) or
// has a name of its own, usable on every sheet.

/** Name of strips that belong to a sheet. */
export const DEFAULT_STRIP_PATTERN = '{foglio}X{n}';

export function getStrips(doc: ProjectDoc): TerminalStrip[] {
  return doc.settings.terminalStrips ?? [];
}

export function getStripPattern(doc: ProjectDoc): string {
  return doc.settings.stripPattern ?? DEFAULT_STRIP_PATTERN;
}

export function findStrip(doc: ProjectDoc, id: string | undefined): TerminalStrip | undefined {
  return id === undefined ? undefined : getStrips(doc).find((s) => s.id === id);
}

/**
 * Name of a strip: its own, or from the pattern: `{foglio}` its sheet's number, `{n}`
 * its place among the sheet strips of that sheet (in order of creation).
 */
export function stripName(doc: ProjectDoc, strip: TerminalStrip): string {
  if (strip.mode === 'custom') return strip.name ?? '';
  const sheet = strip.sheetId === undefined ? -1 : doc.sheetOrder.indexOf(strip.sheetId);
  if (sheet < 0) return '?';
  const n =
    getStrips(doc)
      .filter((s) => s.mode === 'sheet' && s.sheetId === strip.sheetId)
      .indexOf(strip) + 1;
  return getStripPattern(doc)
    .replace(/\{\s*foglio\s*\}/g, String(sheet + 1))
    .replace(/\{\s*n(?::(\d))?\s*\}/g, (_, digits?: string) =>
      String(n).padStart(Number(digits ?? 1), '0'),
    );
}

export function isTerminal(doc: ProjectDoc, element: Element): boolean {
  return doc.symbols[element.symbolId]?.kind === 'terminal';
}

/** The strip of a terminal, if it has one that exists. */
export function stripOf(doc: ProjectDoc, element: Element): TerminalStrip | undefined {
  return isTerminal(doc, element) ? findStrip(doc, element.strip) : undefined;
}

/** Label of a terminal: `strip:number` when in a strip, else the label written by hand. */
export function terminalLabel(doc: ProjectDoc, element: Element): string {
  const strip = stripOf(doc, element);
  if (!strip) return element.info['label'] ?? '';
  return `${stripName(doc, strip)}:${element.terminalNo ?? '?'}`;
}

/** Position for numbering: sheet, column, then top to bottom. */
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

/** Terminals of a strip on every sheet, in reading order. */
export function terminalsOf(doc: ProjectDoc, stripId: string): Element[] {
  return Object.values(doc.elements)
    .filter((e) => e.strip === stripId && isTerminal(doc, e))
    .sort(numberingOrder(doc));
}

/** First free number of a strip (numbers written as text, like `PE`, do not count). */
export function nextTerminalNo(
  doc: ProjectDoc,
  stripId: string,
  taken: Iterable<string> = [],
): string {
  const used = new Set(
    [...terminalsOf(doc, stripId).map((e) => e.terminalNo ?? ''), ...taken].filter((n) =>
      /^\d+$/.test(n),
    ),
  );
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}

/**
 * Ops renumbering the terminals of one strip (or of all) 1, 2, 3… in reading order;
 * numbers that are not plain numbers (`PE`, `5a`) are kept.
 */
export function renumberTerminalsOps(doc: ProjectDoc, stripId?: string): Op[] {
  const strips =
    stripId === undefined ? getStrips(doc) : getStrips(doc).filter((s) => s.id === stripId);
  const ops: Op[] = [];
  for (const strip of strips) {
    let n = 0;
    for (const terminal of terminalsOf(doc, strip.id)) {
      const current = terminal.terminalNo;
      if (current !== undefined && !/^\d+$/.test(current)) continue;
      n++;
      if (current !== String(n)) {
        ops.push(patch('elements', terminal.id as ElementId, { terminalNo: String(n) }));
      }
    }
  }
  return ops;
}

/** A new id for a strip, not used in the project. */
export function newStripId(doc: ProjectDoc): string {
  const ids = new Set(getStrips(doc).map((s) => s.id));
  let n = ids.size + 1;
  while (ids.has(`strip-${n}`)) n++;
  return `strip-${n}`;
}

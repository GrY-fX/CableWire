import type { WireId } from './ids.ts';
import type { Element, ProjectDoc } from './model.ts';
import { getPotentials, terminalKey } from './potentials.ts';
import { columnAt, rowAt, rowLabel } from './sheet.ts';

// Sheet references (symbols of kind `report`) continue a wire on another sheet. An
// outgoing reference is linked to one incoming reference (1:1, `link` on both sides);
// linked references join their potentials, so both ends show the same wire number.

/** Text next to a reference telling where the wire continues. */
export const DEFAULT_REFERENCE_PATTERN = '→ {foglio}.{colonna}';
/** Placeholders accepted by the reference pattern. */
export const REFERENCE_PLACEHOLDERS = ['foglio', 'colonna', 'riga', 'titolo'] as const;
/** Prefix of the id of references whose wire has no number yet: N/C_1, N/C_2, ... */
export const REFERENCE_ID_PREFIX = 'N/C_';

export function getReferencePattern(doc: ProjectDoc): string {
  return doc.settings.referencePattern ?? DEFAULT_REFERENCE_PATTERN;
}

export function isReport(doc: ProjectDoc, element: Element): boolean {
  return doc.symbols[element.symbolId]?.kind === 'report';
}

/** Direction of a reference; undefined for symbols that don't say (older libraries). */
export function reportDirection(doc: ProjectDoc, element: Element): 'in' | 'out' | undefined {
  const symbol = doc.symbols[element.symbolId];
  return symbol?.kind === 'report' ? symbol.report : undefined;
}

/** The reference linked to `element`, if the link is mutual and both are references. */
export function linkedReport(doc: ProjectDoc, element: Element): Element | undefined {
  const partner = element.link && doc.elements[element.link];
  if (!partner || partner.link !== element.id) return undefined;
  return isReport(doc, element) && isReport(doc, partner) ? partner : undefined;
}

/** True if `a` and `b` may be linked: two distinct references, not both in or both out. */
export function canLink(doc: ProjectDoc, a: Element, b: Element): boolean {
  if (a.id === b.id || !isReport(doc, a) || !isReport(doc, b)) return false;
  const da = reportDirection(doc, a);
  const db = reportDirection(doc, b);
  return !da || !db || da !== db;
}

/** Position of an element in the project: sheet order, then top to bottom, left to right. */
function readingOrder(doc: ProjectDoc) {
  return (a: Element, b: Element) =>
    doc.sheetOrder.indexOf(a.sheetId) - doc.sheetOrder.indexOf(b.sheetId) || a.y - b.y || a.x - b.x;
}

/** References of the opposite direction that are not linked yet, in reading order. */
export function availablePartners(doc: ProjectDoc, element: Element): Element[] {
  return Object.values(doc.elements)
    .filter((e) => canLink(doc, element, e) && !linkedReport(doc, e))
    .sort(readingOrder(doc));
}

/** Next free id for a new reference (N/C_1, N/C_2, ...). */
export function nextReferenceId(doc: ProjectDoc, taken: Iterable<string> = []): string {
  let max = 0;
  const pattern = /^N\/C_(\d+)$/;
  const ids = [...Object.values(doc.elements).map((e) => e.info['ref_id'] ?? ''), ...taken];
  for (const id of ids) {
    const m = pattern.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${REFERENCE_ID_PREFIX}${max + 1}`;
}

/** Wires of the reference's potential (through linked references too). */
export function reportWires(doc: ProjectDoc, element: Element): WireId[] {
  const terminal = doc.symbols[element.symbolId]?.terminals[0];
  if (!terminal) return [];
  const potentials = getPotentials(doc);
  const p = potentials.potentialOf(terminalKey(element.id, terminal.id));
  return p === undefined ? [] : [...potentials.wires(p)];
}

/** Number of the wire connected to the reference (through its potential), if any. */
export function reportWireNumber(doc: ProjectDoc, element: Element): string | undefined {
  return reportWires(doc, element)
    .map((id) => doc.wires[id]?.props.number)
    .find((n) => !!n);
}

/** Name shown on a reference: its wire number, else its own id (N/C_n). */
export function reportName(doc: ProjectDoc, element: Element): string {
  return reportWireNumber(doc, element) ?? element.info['ref_id'] ?? '';
}

/** Values of the reference placeholders for the place where `element` sits. */
export function referenceValues(doc: ProjectDoc, element: Element): Record<string, string> {
  const sheet = doc.sheets[element.sheetId];
  if (!sheet) return {};
  return {
    foglio: String(doc.sheetOrder.indexOf(sheet.id) + 1),
    colonna: String(columnAt(sheet, element)),
    riga: rowLabel(rowAt(sheet, element)),
    titolo: sheet.title,
  };
}

/** Fills a reference pattern; unknown placeholders stay as written, missing values are "?". */
export function formatReference(pattern: string, values: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (all, name: string) =>
    (REFERENCE_PLACEHOLDERS as readonly string[]).includes(name) ? (values[name] ?? '?') : all,
  );
}

/** Text telling where the wire continues (the linked reference's place), "?" if unlinked. */
export function referenceTarget(doc: ProjectDoc, element: Element): string {
  const partner = linkedReport(doc, element);
  return formatReference(getReferencePattern(doc), partner ? referenceValues(doc, partner) : {});
}

/** References with no partner, for warnings. */
export function unlinkedReports(doc: ProjectDoc): Element[] {
  return Object.values(doc.elements)
    .filter((e) => isReport(doc, e) && !linkedReport(doc, e))
    .sort(readingOrder(doc));
}

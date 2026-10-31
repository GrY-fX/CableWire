import type { ContactType, Element, ProjectDoc } from './model.ts';
import { formatReference, referenceValues } from './references.ts';

// Coils and their contacts (symbols of kind `master` and `slave`). A contact points
// to its coil with `link`; the coil stores nothing, its contacts are those pointing
// to it, as many as needed. A linked contact shows the coil's label and where the
// coil is.

/** Text next to a contact telling where its coil is. */
export const DEFAULT_MASTER_REF_PATTERN = '/{foglio}.{colonna}';

export function getMasterRefPattern(doc: ProjectDoc): string {
  return doc.settings.masterRefPattern ?? DEFAULT_MASTER_REF_PATTERN;
}

export function isMaster(doc: ProjectDoc, element: Element): boolean {
  return doc.symbols[element.symbolId]?.kind === 'master';
}

export function isSlave(doc: ProjectDoc, element: Element): boolean {
  return doc.symbols[element.symbolId]?.kind === 'slave';
}

/** Kind of contact of a slave symbol; undefined for symbols that don't say. */
export function contactType(doc: ProjectDoc, element: Element): ContactType | undefined {
  const symbol = doc.symbols[element.symbolId];
  return symbol?.kind === 'slave' ? symbol.contact : undefined;
}

/** Position of an element in the project: sheet order, then top to bottom, left to right. */
function readingOrder(doc: ProjectDoc) {
  return (a: Element, b: Element) =>
    doc.sheetOrder.indexOf(a.sheetId) - doc.sheetOrder.indexOf(b.sheetId) || a.y - b.y || a.x - b.x;
}

/** The coil a contact is linked to, if the link leads to a coil. */
export function masterOf(doc: ProjectDoc, slave: Element): Element | undefined {
  const master = slave.link && doc.elements[slave.link];
  return master && isSlave(doc, slave) && isMaster(doc, master) ? master : undefined;
}

/** Contacts linked to a coil, in reading order. */
export function slavesOf(doc: ProjectDoc, master: Element): Element[] {
  return Object.values(doc.elements)
    .filter((e) => e.link === master.id && isSlave(doc, e))
    .sort(readingOrder(doc));
}

/** Every coil of the project, in reading order. */
export function allMasters(doc: ProjectDoc): Element[] {
  return Object.values(doc.elements)
    .filter((e) => isMaster(doc, e))
    .sort(readingOrder(doc));
}

/** Coils with the given label (trimmed, case sensitive as written on the drawing). */
export function mastersWithLabel(doc: ProjectDoc, label: string): Element[] {
  const wanted = label.trim();
  return wanted ? allMasters(doc).filter((m) => (m.info['label'] ?? '').trim() === wanted) : [];
}

/** Label shown on a contact: its coil's when linked, else its own. */
export function slaveLabel(doc: ProjectDoc, slave: Element): string {
  const master = masterOf(doc, slave);
  return (master ? master.info['label'] : slave.info['label']) ?? '';
}

/** Where the coil of a contact is (e.g. `/2.4`); empty when not linked. */
export function masterRef(doc: ProjectDoc, slave: Element): string {
  const master = masterOf(doc, slave);
  return master ? formatReference(getMasterRefPattern(doc), referenceValues(doc, master)) : '';
}

/** Contacts without a coil, for warnings. */
export function unlinkedSlaves(doc: ProjectDoc): Element[] {
  return Object.values(doc.elements)
    .filter((e) => isSlave(doc, e) && !masterOf(doc, e))
    .sort(readingOrder(doc));
}

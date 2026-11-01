import { defineCommand, fail, ok } from '../command.ts';
import type { ElementId, JunctionId, SheetId, TextId, WireId } from '../ids.ts';
import { newId } from '../ids.ts';
import type {
  Element,
  Junction,
  ProjectDoc,
  SheetText,
  SymbolDef,
  Wire,
  WireEnd,
} from '../model.ts';
import { isJunctionEnd } from '../model.ts';
import { withNumber } from '../numbering.ts';
import type { Op } from '../ops.ts';
import { put } from '../ops.ts';
import { followsPattern, labelPatterns, nextLabel } from '../labels.ts';
import { findStrip, nextTerminalNo } from '../strips.ts';
import { nextReferenceId } from '../references.ts';

/** A self-contained piece of a sheet, as copied to the clipboard. */
export interface Fragment {
  symbols: SymbolDef[];
  elements: Element[];
  wires: Wire[];
  junctions: Junction[];
  texts: SheetText[];
}

/**
 * Copies elements and junctions plus every wire whose two ends are both copied
 * (selected wires with an end outside the selection are left out: they would dangle).
 */
export function copyFragment(
  doc: ProjectDoc,
  selection: {
    elements?: readonly ElementId[];
    junctions?: readonly JunctionId[];
    texts?: readonly TextId[];
  },
): Fragment {
  const elements = (selection.elements ?? []).flatMap((id) => doc.elements[id] ?? []);
  const junctions = (selection.junctions ?? []).flatMap((id) => doc.junctions[id] ?? []);
  const elementIds = new Set<string>(elements.map((e) => e.id));
  const junctionIds = new Set<string>(junctions.map((j) => j.id));
  const inside = (end: WireEnd) =>
    isJunctionEnd(end) ? junctionIds.has(end.junction) : elementIds.has(end.element);
  const wires = Object.values(doc.wires).filter((w) => inside(w.from) && inside(w.to));
  const symbolIds = new Set(elements.map((e) => e.symbolId));
  const symbols = [...symbolIds].flatMap((id) => doc.symbols[id] ?? []);
  const texts = (selection.texts ?? []).flatMap((id) => doc.texts[id] ?? []);
  return { symbols, elements, wires, junctions, texts };
}

export function isEmptyFragment(f: Fragment): boolean {
  return f.elements.length === 0 && f.junctions.length === 0 && f.texts.length === 0;
}

/** New ids for everything in a fragment (old id → new id). */
export function freshIds(fragment: Fragment): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const item of [
    ...fragment.elements,
    ...fragment.wires,
    ...fragment.junctions,
    ...fragment.texts,
  ]) {
    ids[item.id] = newId();
  }
  return ids;
}

/**
 * Pastes a fragment on a sheet, moved by (dx, dy), using `ids` for the new objects.
 * Symbols missing from the project are imported; existing copies are kept.
 */
export const pasteFragment = defineCommand<{
  fragment: Fragment;
  sheetId: SheetId;
  dx: number;
  dy: number;
  ids: Record<string, string>;
}>('Incolla', (doc, { fragment, sheetId, dx, dy, ids }) => {
  if (!doc.sheets[sheetId]) return fail('not-found', 'Sheet not found');
  const ops: Op[] = [];
  const symbols = new Map<string, SymbolDef>(Object.entries(doc.symbols));
  for (const s of fragment.symbols) {
    if (!symbols.has(s.id)) {
      symbols.set(s.id, s);
      ops.push(put('symbols', s));
    }
  }
  const map = <T extends string>(id: string) => ids[id] as T;
  const refIds: string[] = [];
  const takenLabels: Record<string, string[]> = {};
  const takenNumbers: Record<string, string[]> = {};

  for (const e of fragment.elements) {
    const symbol = symbols.get(e.symbolId);
    if (!symbol) return fail('not-found', `Symbol ${e.symbolId} not available`);
    const element: Element = { ...e, id: map<ElementId>(e.id), sheetId, x: e.x + dx, y: e.y + dy };
    if (e.link !== undefined) {
      if (ids[e.link]) element.link = map<ElementId>(e.link);
      // A contact pasted without its coil stays linked to the same coil, if still there.
      else if (symbol.kind !== 'slave' || !doc.elements[e.link]) {
        delete element.link;
      }
    }
    if (symbol.kind === 'report') {
      // A pasted reference is a new one: it gets its own id.
      const refId = nextReferenceId(doc, refIds);
      refIds.push(refId);
      element.info = { ...e.info, ref_id: refId };
    }
    // Terminals stay in their strip with a new number; a strip not in this project is dropped.
    if (element.strip !== undefined) {
      if (findStrip(doc, element.strip)) {
        const taken = (takenNumbers[element.strip] ??= []);
        const no = nextTerminalNo(doc, element.strip, taken);
        taken.push(no);
        element.terminalNo = no;
      } else {
        delete element.strip;
        delete element.terminalNo;
      }
    }
    // Automatic labels (e.g. {foglio}K{n}) get the next free number on this sheet.
    for (const { key, tokens } of labelPatterns(symbol)) {
      if (!followsPattern(element.info[key] ?? '', tokens)) continue;
      const taken = (takenLabels[key] ??= []);
      const label = nextLabel(doc, sheetId, key, tokens, element, taken);
      taken.push(label);
      element.info = { ...element.info, [key]: label };
    }
    ops.push(put('elements', element));
  }
  for (const t of fragment.texts) {
    ops.push(put('texts', { ...t, id: map<TextId>(t.id), sheetId, x: t.x + dx, y: t.y + dy }));
  }
  for (const j of fragment.junctions) {
    ops.push(
      put('junctions', { ...j, id: map<JunctionId>(j.id), sheetId, x: j.x + dx, y: j.y + dy }),
    );
  }
  const end = (e: WireEnd): WireEnd | undefined => {
    if (isJunctionEnd(e))
      return ids[e.junction] ? { junction: map<JunctionId>(e.junction) } : undefined;
    const element = fragment.elements.find((x) => x.id === e.element);
    const symbol = element && symbols.get(element.symbolId);
    if (!ids[e.element] || !symbol?.terminals.some((t) => t.id === e.terminal)) return undefined;
    return { element: map<ElementId>(e.element), terminal: e.terminal };
  };
  for (const w of fragment.wires) {
    const from = end(w.from);
    const to = end(w.to);
    if (!from || !to) continue;
    ops.push(
      put('wires', {
        ...w,
        id: map<WireId>(w.id),
        sheetId,
        from,
        to,
        bends: w.bends.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        // Copies are new potentials: they get their own numbers, not the originals'.
        props: withNumber(w.props, undefined, false),
      }),
    );
  }
  return ok(ops);
});

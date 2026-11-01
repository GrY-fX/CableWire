import type { ElementId, TerminalId, WireId } from '../ids.ts';
import type { NumberingSettings, NumberSource, ProjectDoc } from '../model.ts';
import { DEFAULT_NUMBERING, getNumbering } from '../model.ts';
import { getPotentials } from '../potentials.ts';
import { terminalLabel } from '../strips.ts';
import { formatPlcAddress } from './rule.ts';

/** A candidate number found on an element reached by a potential. */
export interface SourceValue {
  value: string;
  element: ElementId;
  /** Human description, e.g. "KA3" or "X1:5". */
  from: string;
}

export interface SourceResult {
  source: NumberSource;
  /** Distinct values; more than one is a conflict. */
  values: SourceValue[];
}

export const SOURCE_NAMES: Record<NumberSource, string> = {
  plc: 'indirizzo PLC',
  terminal: 'morsetto',
  label: 'sigla',
};

/** Element terminals in the potential of `wireId`. */
export function terminalsOfPotential(
  doc: ProjectDoc,
  wireId: WireId,
): { element: ElementId; terminal: TerminalId }[] {
  const potentials = getPotentials(doc);
  const p = potentials.potentialOfWire(wireId);
  if (p === undefined) return [];
  return potentials
    .nodes(p)
    .filter((node) => node.startsWith('e:'))
    .map((node) => {
      const [, element, terminal] = node.split(':');
      return { element: element as ElementId, terminal: terminal as TerminalId };
    });
}

/** Elements with at least one terminal in the potential of `wireId`. */
export function elementsOfPotential(doc: ProjectDoc, wireId: WireId): ElementId[] {
  return [...new Set(terminalsOfPotential(doc, wireId).map((t) => t.element))];
}

const NUMERIC = /^\d+$/;

/**
 * Value of one element terminal for a source, or '' if it gives none. PLC cards
 * (kind `plc`) combine their byte with numbered terminals; other elements with a PLC
 * address give it as is, from any of their terminals.
 */
function valueAt(
  doc: ProjectDoc,
  at: { element: ElementId; terminal: TerminalId },
  source: NumberSource,
  settings: NumberingSettings,
): { value: string; from: string } | undefined {
  const element = doc.elements[at.element];
  const symbol = element && doc.symbols[element.symbolId];
  if (!element || !symbol) return undefined;
  const kind = symbol.kind;
  // Terminals in a strip are labelled strip:number (X1:5).
  const label = (
    kind === 'terminal' ? terminalLabel(doc, element) : (element.info.label ?? '')
  ).trim();
  if (source === 'plc') {
    const address = element.info.plc_address?.trim() ?? '';
    if (!address) return undefined;
    if (kind !== 'plc') return { value: address, from: label || address };
    const name = symbol.terminals.find((t) => t.id === at.terminal)?.name.trim() ?? '';
    if (!NUMERIC.test(name)) return undefined; // power terminals (L+, M...) give no address
    const pattern = settings.plcPattern ?? DEFAULT_NUMBERING.plcPattern!;
    return {
      value: formatPlcAddress(pattern, address, name),
      from: `${label || address} morsetto ${name}`,
    };
  }
  if (source === 'terminal' && kind === 'terminal' && label) {
    const value =
      settings.terminalStyle === 'full' ? label : label.slice(label.lastIndexOf(':') + 1);
    return { value, from: label };
  }
  if (source === 'label' && kind !== 'terminal' && kind !== 'report' && label) {
    return { value: label, from: label };
  }
  return undefined;
}

/**
 * The first enabled source (in priority order) that finds a value for the potential of
 * `wireId`, with all the distinct values it found; undefined if none finds anything.
 */
export function sourceValues(doc: ProjectDoc, wireId: WireId): SourceResult | undefined {
  const settings = getNumbering(doc);
  const terminals = terminalsOfPotential(doc, wireId);
  for (const source of settings.sources) {
    const found = new Map<string, SourceValue>();
    for (const at of terminals) {
      const v = valueAt(doc, at, source, settings);
      if (v?.value && !found.has(v.value)) found.set(v.value, { ...v, element: at.element });
    }
    if (found.size) return { source, values: [...found.values()] };
  }
  return undefined;
}

/** Where the current number of a wire comes from, if it matches a source value. */
export function numberOrigin(
  doc: ProjectDoc,
  wireId: WireId,
): { source: NumberSource; from: string } | undefined {
  const number = doc.wires[wireId]?.props.number;
  const result = number ? sourceValues(doc, wireId) : undefined;
  const match = result?.values.find((v) => v.value === number);
  return result && match ? { source: result.source, from: match.from } : undefined;
}

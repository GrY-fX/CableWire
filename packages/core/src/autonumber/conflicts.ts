import type { SheetId, WireId } from '../ids.ts';
import type { NumberSource, ProjectDoc } from '../model.ts';
import { potentialsInReadingOrder } from './allocate.ts';
import { sourceValues } from './sources.ts';

export interface NumberCandidate {
  value: string;
  /** Where it comes from, e.g. "KA3" for a PLC address, empty for a joined number. */
  from: string;
}

/**
 * A potential whose number is ambiguous:
 * - `sources`: the deciding source found different values (e.g. two PLC inputs);
 * - `join`: a wire joined potentials that already had different numbers.
 */
export interface NumberingConflict {
  kind: 'sources' | 'join';
  /** Wire addressing the potential. */
  wire: WireId;
  sheet: SheetId;
  current: string | undefined;
  source?: NumberSource;
  candidates: NumberCandidate[];
}

/**
 * Open conflicts in reading order. Choosing a number (which locks it) resolves a
 * `sources` conflict; giving the whole potential one number resolves a `join`.
 */
export function numberingConflicts(doc: ProjectDoc): NumberingConflict[] {
  const conflicts: NumberingConflict[] = [];
  for (const info of potentialsInReadingOrder(doc)) {
    const numbers = [
      ...new Set(info.wires.flatMap((w) => (w.props.number ? [w.props.number] : []))),
    ];
    const base = { wire: info.wire, sheet: info.sheet, current: info.number };
    if (numbers.length > 1) {
      conflicts.push({
        ...base,
        kind: 'join',
        candidates: numbers.map((value) => ({ value, from: '' })),
      });
      continue;
    }
    if (info.locked) continue;
    const result = sourceValues(doc, info.wire);
    if (result && result.values.length > 1) {
      conflicts.push({
        ...base,
        kind: 'sources',
        source: result.source,
        candidates: result.values.map(({ value, from }) => ({ value, from })),
      });
    }
  }
  return conflicts;
}

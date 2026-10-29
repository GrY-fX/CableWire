/** Numbers are rounded to 1/1000 (of a millimetre, for coordinates) to avoid float noise. */
export function roundNumber(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isScalar = (v: unknown) => v === null || typeof v !== 'object';

/** Small objects and arrays of scalars stay on one line, e.g. `{ "x": 1, "y": 2 }`. */
function isCompact(v: unknown): boolean {
  if (Array.isArray(v)) return v.length <= 4 && v.every(isScalar);
  if (isPlainObject(v)) {
    const values = Object.values(v);
    return values.length > 0 && values.length <= 4 && values.every(isScalar);
  }
  return true;
}

function scalar(v: unknown): string {
  return typeof v === 'number' ? JSON.stringify(roundNumber(v)) : JSON.stringify(v);
}

/**
 * Deterministic JSON for diff-friendly files: keys sorted (except `firstKeys`, kept
 * first at the top level), 2-space indentation, rounded numbers, `undefined` dropped.
 */
export function stableStringify(value: unknown, firstKeys: readonly string[] = []): string {
  return write(value, '', firstKeys) + '\n';
}

function orderedKeys(obj: Record<string, unknown>, firstKeys: readonly string[]): string[] {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const first = firstKeys.filter((k) => keys.includes(k));
  return [...first, ...keys.filter((k) => !first.includes(k)).sort()];
}

function write(v: unknown, indent: string, firstKeys: readonly string[] = []): string {
  if (isScalar(v)) return scalar(v);
  const inner = indent + '  ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (isCompact(v)) return `[${v.map(scalar).join(', ')}]`;
    return `[\n${v.map((item) => inner + write(item, inner)).join(',\n')}\n${indent}]`;
  }
  const obj = v as Record<string, unknown>;
  const keys = orderedKeys(obj, firstKeys);
  if (keys.length === 0) return '{}';
  if (isCompact(obj) && firstKeys.length === 0) {
    return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${scalar(obj[k])}`).join(', ')} }`;
  }
  const lines = keys.map((k) => `${inner}${JSON.stringify(k)}: ${write(obj[k], inner)}`);
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

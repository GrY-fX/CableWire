/** Pieces of a numbering pattern such as `{foglio}.{n:2}`. */
export type PatternToken =
  | { kind: 'text'; text: string }
  | { kind: 'counter'; digits: number }
  | { kind: 'sheet' }
  | { kind: 'column' };

export interface PatternContext {
  n: number;
  /** 1-based position of the sheet in the project. */
  sheet: number;
  /** 1-based column of the sheet's reference grid. */
  column: number;
}

export type ParsedPattern = { ok: true; tokens: PatternToken[] } | { ok: false; error: string };

/** Parses a pattern; `{n}` is required so that numbers never repeat. */
export function parsePattern(pattern: string): ParsedPattern {
  const tokens: PatternToken[] = [];
  let rest = pattern;
  let hasCounter = false;
  while (rest.length) {
    const open = rest.indexOf('{');
    const close = rest.indexOf('}');
    if (close !== -1 && (open === -1 || close < open)) {
      return { ok: false, error: 'Graffa chiusa "}" senza la sua apertura.' };
    }
    if (open === -1) {
      tokens.push({ kind: 'text', text: rest });
      break;
    }
    if (open > 0) tokens.push({ kind: 'text', text: rest.slice(0, open) });
    if (close === -1) return { ok: false, error: 'Graffa aperta "{" senza chiusura.' };
    const name = rest.slice(open + 1, close).trim();
    const counter = /^n(?::(\d))?$/.exec(name);
    if (counter) {
      hasCounter = true;
      tokens.push({ kind: 'counter', digits: Number(counter[1] ?? 1) });
    } else if (name === 'foglio') {
      tokens.push({ kind: 'sheet' });
    } else if (name === 'colonna') {
      tokens.push({ kind: 'column' });
    } else {
      return {
        ok: false,
        error: `Segnaposto sconosciuto {${name}}: usa {n}, {n:2}, {foglio}, {colonna}.`,
      };
    }
    rest = rest.slice(close + 1);
  }
  if (!hasCounter) return { ok: false, error: 'Il modello deve contenere {n}.' };
  return { ok: true, tokens };
}

/** Checks a PLC card pattern: only {byte} and {morsetto}, and {morsetto} is required. */
export function checkPlcPattern(pattern: string): string | undefined {
  const names = [...pattern.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!.trim());
  const unknown = names.find((n) => n !== 'byte' && n !== 'morsetto');
  if (unknown !== undefined) return `Segnaposto sconosciuto {${unknown}}: usa {byte} e {morsetto}.`;
  if (!names.includes('morsetto')) return 'Il formato della scheda PLC deve contenere {morsetto}.';
  if (/[{}]/.test(pattern.replace(/\{[^}]*\}/g, ''))) return 'Graffe non bilanciate.';
  return undefined;
}

/** Address of a PLC card terminal, e.g. `{byte}.{morsetto}` with I0 and 3 → I0.3. */
export function formatPlcAddress(pattern: string, byte: string, terminal: string): string {
  return pattern.replace(/\{\s*byte\s*\}/g, byte).replace(/\{\s*morsetto\s*\}/g, terminal);
}

export function formatPattern(tokens: readonly PatternToken[], ctx: PatternContext): string {
  return tokens
    .map((t) => {
      switch (t.kind) {
        case 'text':
          return t.text;
        case 'counter':
          return String(ctx.n).padStart(t.digits, '0');
        case 'sheet':
          return String(ctx.sheet);
        case 'column':
          return String(ctx.column);
      }
    })
    .join('');
}

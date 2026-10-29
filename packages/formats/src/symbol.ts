import * as v from 'valibot';
import type { SymbolDef } from '@cablewire/core';
import type { SerializeOptions } from './project.ts';
import type { Migration } from './migrations/index.ts';
import type { ParseResult } from './parse.ts';
import { parseEnvelope, parseError } from './parse.ts';
import { symbolSchema } from './schema.ts';
import { stableStringify } from './stable-json.ts';

export const SYMBOL_FORMAT = 'cablewire-symbol';
export const SYMBOL_EXTENSION = '.cwsym';
export const SYMBOL_FORMAT_VERSION = 1;
export const symbolMigrations: readonly Migration[] = [];

const symbolFileSchema = v.object({ formatVersion: v.literal(1), symbol: symbolSchema });

export function serializeSymbol(symbol: SymbolDef, options: SerializeOptions = {}): string {
  return stableStringify(
    {
      format: SYMBOL_FORMAT,
      formatVersion: SYMBOL_FORMAT_VERSION,
      app: options.app ?? 'CableWire',
      symbol,
    },
    ['format', 'formatVersion', 'app'],
  );
}

/** Reads a `.cwsym` file, also checking that terminals and bridges are consistent. */
export function parseSymbol(text: string): ParseResult<SymbolDef> {
  const parsed = parseEnvelope(text, {
    format: SYMBOL_FORMAT,
    noun: 'simbolo',
    version: SYMBOL_FORMAT_VERSION,
    migrations: symbolMigrations,
    schema: symbolFileSchema,
  });
  if (!parsed.ok) return parsed;
  const { symbol } = parsed.value;
  const ids = new Set(symbol.terminals.map((t) => t.id));
  const details: string[] = [];
  if (ids.size !== symbol.terminals.length) details.push('identificativi di terminale duplicati');
  if (symbol.bridges.some(([a, b]) => !ids.has(a) || !ids.has(b))) {
    details.push('un collegamento interno usa un terminale inesistente');
  }
  if (details.length > 0) {
    return parseError('integrity', 'Il simbolo contiene dati incoerenti.', details);
  }
  return { ok: true, value: symbol, warnings: parsed.warnings };
}

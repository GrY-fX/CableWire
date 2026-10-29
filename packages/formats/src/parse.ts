import * as v from 'valibot';
import type { Migration } from './migrations/index.ts';
import { migrate } from './migrations/index.ts';

export type ParseErrorCode = 'json' | 'format' | 'newer-version' | 'schema' | 'integrity';

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  /** One line per problem, e.g. `elements.<id>.x: atteso un numero`. */
  details: string[];
}

export type ParseResult<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; error: ParseError };

const MAX_DETAILS = 20;

export function parseError(code: ParseErrorCode, message: string, details: string[] = []) {
  return { ok: false as const, error: { code, message, details: details.slice(0, MAX_DETAILS) } };
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export interface EnvelopeSpec<S extends v.GenericSchema> {
  format: string;
  /** Name used in messages, e.g. "progetto". */
  noun: string;
  version: number;
  migrations: readonly Migration[];
  schema: S;
}

/**
 * Common reading pipeline: JSON → format check → version check and migrations →
 * schema. Returns the schema output plus warnings for unknown (dropped) properties.
 */
export function parseEnvelope<S extends v.GenericSchema>(
  text: string,
  spec: EnvelopeSpec<S>,
): ParseResult<v.InferOutput<S>> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return parseError(
      'json',
      `Il file non è un ${spec.noun} CableWire leggibile (JSON non valido).`,
      [String((e as Error).message)],
    );
  }
  if (!isObject(json) || json.format !== spec.format) {
    return parseError('format', `Il file non è un ${spec.noun} CableWire.`);
  }
  const version = json.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return parseError('format', 'Versione del formato mancante o non valida.');
  }
  if (version > spec.version) {
    return parseError(
      'newer-version',
      `Il ${spec.noun} è stato creato con una versione più nuova di CableWire (formato ${version}). Aggiorna l'applicazione per aprirlo.`,
    );
  }

  // Envelope fields are only for recognition and information, not part of the data.
  const body = { ...migrate(json, version, spec.version, spec.migrations) };
  delete body.format;
  delete body.app;
  const result = v.safeParse(spec.schema, body);
  if (!result.success) {
    return parseError(
      'schema',
      `Il ${spec.noun} contiene dati non validi.`,
      result.issues.map((issue) => `${v.getDotPath(issue) ?? '(radice)'}: ${issue.message}`),
    );
  }
  return { ok: true, value: result.output, warnings: unknownKeys(body, result.output) };
}

/** Paths present in the input but dropped by the schema. */
export function unknownKeys(input: unknown, output: unknown, path = ''): string[] {
  const at = (key: string | number) => (path ? `${path}.${key}` : String(key));
  if (Array.isArray(input) && Array.isArray(output)) {
    return input.flatMap((item, i) => unknownKeys(item, output[i], at(i)));
  }
  if (isObject(input) && isObject(output)) {
    return Object.keys(input).flatMap((key) =>
      key in output
        ? unknownKeys(input[key], output[key], at(key))
        : [`Proprietà sconosciuta ignorata: ${at(key)}`],
    );
  }
  return [];
}

import { validate } from '@cablewire/core';
import type { ProjectDoc } from '@cablewire/core';
import { PROJECT_FORMAT_VERSION, projectMigrations } from './migrations/index.ts';
import type { ParseResult } from './parse.ts';
import { parseEnvelope, parseError } from './parse.ts';
import { projectSchema } from './schema.ts';
import { stableStringify } from './stable-json.ts';

export const PROJECT_FORMAT = 'cablewire-project';
export const PROJECT_EXTENSION = '.cwp';

export interface SerializeOptions {
  /** Writer name stored in the file for information, e.g. "CableWire 0.1.0". */
  app?: string;
}

const FIRST_KEYS = ['format', 'formatVersion', 'app', 'meta', 'settings', 'sheetOrder'];

/** Deterministic `.cwp` text: saving the same document twice gives the same file. */
export function serializeProject(doc: ProjectDoc, options: SerializeOptions = {}): string {
  return stableStringify(
    { format: PROJECT_FORMAT, app: options.app ?? 'CableWire', ...doc },
    FIRST_KEYS,
  );
}

/** Reads a `.cwp` file: checks format and version, migrates, validates shape and integrity. */
export function parseProject(text: string): ParseResult<ProjectDoc> {
  const parsed = parseEnvelope(text, {
    format: PROJECT_FORMAT,
    noun: 'progetto',
    version: PROJECT_FORMAT_VERSION,
    migrations: projectMigrations,
    schema: projectSchema,
  });
  if (!parsed.ok) return parsed;
  const problems = validate(parsed.value);
  if (problems.length > 0) {
    return parseError(
      'integrity',
      'Il progetto contiene riferimenti incoerenti.',
      problems.map((p) => p.message),
    );
  }
  return parsed;
}

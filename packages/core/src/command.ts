import type { ProjectDoc } from './model.ts';
import type { Op } from './ops.ts';

export interface CommandError {
  code: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: CommandError };

/** A named, pure edit: computes the ops to apply without touching the document. */
export interface Command<A> {
  label: string;
  run(doc: ProjectDoc, args: A): Result<Op[]>;
}

export function defineCommand<A>(label: string, run: Command<A>['run']): Command<A> {
  return { label, run };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(code: string, message: string): { ok: false; error: CommandError } {
  return { ok: false, error: { code, message } };
}

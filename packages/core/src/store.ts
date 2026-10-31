import type { Command, Result } from './command.ts';
import { ok } from './command.ts';
import type { ProjectDoc } from './model.ts';
import type { Change, Op } from './ops.ts';
import { applyOps } from './ops.ts';
import { validate } from './validate.ts';

export type Listener = (doc: ProjectDoc, changes: Change[]) => void;

interface Entry {
  label: string;
  forward: Op[];
  inverse: Op[];
}

export interface StoreOptions {
  /** Maximum number of undo entries kept (default 200). */
  maxHistory?: number;
  /** Validate the document after every change and throw on problems (for tests and development). */
  checkInvariants?: boolean;
}

export interface Store {
  readonly doc: ProjectDoc;
  /** Runs a command; outside a transaction it becomes one undo entry. */
  run<A>(command: Command<A>, args: A): Result<void>;
  /**
   * Applies a command without an undo entry, for bookkeeping that is not an edit
   * (e.g. the save date). Not allowed inside a transaction.
   */
  runUnrecorded<A>(command: Command<A>, args: A): Result<void>;
  /** Opens a transaction: every command until commit() becomes a single undo entry. */
  begin(label: string): void;
  commit(): void;
  /** Undoes everything done since begin(). */
  rollback(): void;
  readonly inTransaction: boolean;
  undo(): boolean;
  redo(): boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  /** Replaces the document (e.g. after opening a file) and clears the history. */
  reset(doc: ProjectDoc): void;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: ProjectDoc, options: StoreOptions = {}): Store {
  const maxHistory = options.maxHistory ?? 200;
  let doc = initial;
  let undoStack: Entry[] = [];
  let redoStack: Entry[] = [];
  let pending: Entry | undefined;
  const listeners = new Set<Listener>();

  function apply(ops: readonly Op[]): Op[] {
    const result = applyOps(doc, ops);
    if (options.checkInvariants) {
      const problems = validate(result.doc);
      if (problems.length > 0) {
        throw new Error(`Invalid document: ${problems.map((p) => p.message).join('; ')}`);
      }
    }
    doc = result.doc;
    for (const listener of listeners) listener(doc, result.changes);
    return result.inverse;
  }

  function record(entry: Entry): void {
    undoStack.push(entry);
    if (undoStack.length > maxHistory) undoStack = undoStack.slice(-maxHistory);
    redoStack = [];
  }

  return {
    get doc() {
      return doc;
    },
    get inTransaction() {
      return pending !== undefined;
    },
    get undoLabel() {
      return undoStack.at(-1)?.label;
    },
    get redoLabel() {
      return redoStack.at(-1)?.label;
    },

    run(command, args) {
      const result = command.run(doc, args);
      if (!result.ok) return result;
      const ops = result.value;
      if (ops.length === 0) return ok(undefined);
      const inverse = apply(ops);
      if (pending) {
        pending.forward.push(...ops);
        pending.inverse = [...inverse, ...pending.inverse];
      } else {
        record({ label: command.label, forward: ops, inverse });
      }
      return ok(undefined);
    },

    runUnrecorded(command, args) {
      if (pending) throw new Error('Cannot run an unrecorded command during a transaction');
      const result = command.run(doc, args);
      if (!result.ok) return result;
      if (result.value.length > 0) apply(result.value);
      return ok(undefined);
    },

    begin(label) {
      if (pending) throw new Error('A transaction is already open');
      pending = { label, forward: [], inverse: [] };
    },
    commit() {
      if (!pending) throw new Error('No open transaction');
      if (pending.forward.length > 0) record(pending);
      pending = undefined;
    },
    rollback() {
      if (!pending) throw new Error('No open transaction');
      if (pending.inverse.length > 0) apply(pending.inverse);
      pending = undefined;
    },

    undo() {
      if (pending) throw new Error('Cannot undo during a transaction');
      const entry = undoStack.pop();
      if (!entry) return false;
      apply(entry.inverse);
      redoStack.push(entry);
      return true;
    },
    redo() {
      if (pending) throw new Error('Cannot redo during a transaction');
      const entry = redoStack.pop();
      if (!entry) return false;
      apply(entry.forward);
      undoStack.push(entry);
      return true;
    },

    reset(next) {
      pending = undefined;
      undoStack = [];
      redoStack = [];
      doc = next;
      for (const listener of listeners) listener(doc, [{ table: '*' }]);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

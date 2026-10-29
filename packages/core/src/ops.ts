import type { Element, Junction, ProjectDoc, Sheet, SymbolDef, Wire } from './model.ts';

export interface TableTypes {
  sheets: Sheet;
  symbols: SymbolDef;
  elements: Element;
  wires: Wire;
  junctions: Junction;
}

export type Table = keyof TableTypes;
export const TABLES: readonly Table[] = ['sheets', 'symbols', 'elements', 'wires', 'junctions'];

/** Field updates; a field set to `undefined` is removed. */
export type Patch<T> = { [K in Exclude<keyof T, 'id'>]?: T[K] | undefined };

export type MetaFields = Pick<ProjectDoc, 'meta' | 'settings' | 'sheetOrder'>;

export type Op =
  | { [T in Table]: { op: 'put'; table: T; value: TableTypes[T] } }[Table]
  | {
      [T in Table]: { op: 'patch'; table: T; id: TableTypes[T]['id']; set: Patch<TableTypes[T]> };
    }[Table]
  | { [T in Table]: { op: 'delete'; table: T; id: TableTypes[T]['id'] } }[Table]
  | { op: 'meta'; set: Partial<MetaFields> };

export function put<T extends Table>(table: T, value: TableTypes[T]): Op {
  return { op: 'put', table, value } as Op;
}

export function patch<T extends Table>(
  table: T,
  id: TableTypes[T]['id'],
  set: Patch<TableTypes[T]>,
): Op {
  return { op: 'patch', table, id, set } as Op;
}

export function del<T extends Table>(table: T, id: TableTypes[T]['id']): Op {
  return { op: 'delete', table, id } as Op;
}

export function meta(set: Partial<MetaFields>): Op {
  return { op: 'meta', set };
}

/** What an edit touched; `'*'` means the whole document was replaced. */
export type Change = { table: Table; id: string } | { table: 'meta' } | { table: '*' };

type Row = { id: string } & Record<string, unknown>;
type Rows = Record<string, Row>;

/**
 * Applies ops in order and returns the new document plus the ops that undo them
 * (already in the order they must be applied). The input document is not modified;
 * untouched tables and rows are shared with it.
 */
export function applyOps(
  doc: ProjectDoc,
  ops: readonly Op[],
): { doc: ProjectDoc; inverse: Op[]; changes: Change[] } {
  const draft: Record<string, unknown> = { ...doc };
  const copied = new Set<Table>();
  const rows = (table: Table): Rows => {
    if (!copied.has(table)) {
      draft[table] = { ...(doc[table] as unknown as Rows) };
      copied.add(table);
    }
    return draft[table] as Rows;
  };
  const inverse: Op[] = [];
  const changes: Change[] = [];

  for (const op of ops) {
    if (op.op === 'meta') {
      const prev: Partial<MetaFields> = {};
      for (const key of Object.keys(op.set) as (keyof MetaFields)[]) {
        (prev as Record<string, unknown>)[key] = draft[key];
        draft[key] = op.set[key];
      }
      inverse.push(meta(prev));
      changes.push({ table: 'meta' });
      continue;
    }

    const table = rows(op.table);
    if (op.op === 'put') {
      const value = op.value as unknown as Row;
      const prev = table[value.id];
      table[value.id] = value;
      inverse.push(
        prev
          ? ({ op: 'put', table: op.table, value: prev } as unknown as Op)
          : del(op.table, value.id as never),
      );
      changes.push({ table: op.table, id: value.id });
    } else if (op.op === 'patch') {
      const prev = table[op.id];
      if (!prev) throw new Error(`patch: ${op.table}/${op.id} does not exist`);
      const next: Row = { ...prev };
      const undo: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(op.set)) {
        undo[key] = prev[key];
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      table[op.id] = next;
      inverse.push({ op: 'patch', table: op.table, id: op.id, set: undo } as unknown as Op);
      changes.push({ table: op.table, id: op.id });
    } else {
      const prev = table[op.id];
      if (!prev) throw new Error(`delete: ${op.table}/${op.id} does not exist`);
      delete table[op.id];
      inverse.push({ op: 'put', table: op.table, value: prev } as unknown as Op);
      changes.push({ table: op.table, id: op.id });
    }
  }

  inverse.reverse();
  return { doc: draft as unknown as ProjectDoc, inverse, changes };
}

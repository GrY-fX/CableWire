import type { ProjectDoc, WireEnd } from './model.ts';
import { isJunctionEnd } from './model.ts';
import { TABLES } from './ops.ts';
import type { Table } from './ops.ts';

export interface Problem {
  code: string;
  message: string;
  table?: Table;
  id?: string;
}

/** Checks referential integrity; an empty list means the document is consistent. */
export function validate(doc: ProjectDoc): Problem[] {
  const problems: Problem[] = [];
  const report = (code: string, message: string, table?: Table, id?: string) =>
    problems.push({ code, message, ...(table && { table }), ...(id && { id }) });

  for (const table of TABLES) {
    for (const [key, row] of Object.entries(doc[table])) {
      if (row.id !== key) report('id-mismatch', `${table}/${key} has id ${row.id}`, table, key);
    }
  }

  const ordered = new Set<string>(doc.sheetOrder);
  if (ordered.size !== doc.sheetOrder.length) report('sheet-order', 'sheetOrder has duplicates');
  for (const id of doc.sheetOrder) {
    if (!doc.sheets[id]) report('sheet-order', `sheetOrder lists missing sheet ${id}`);
  }
  for (const id of Object.keys(doc.sheets)) {
    if (!ordered.has(id))
      report('sheet-order', `sheet ${id} missing from sheetOrder`, 'sheets', id);
  }

  for (const symbol of Object.values(doc.symbols)) {
    const ids = new Set(symbol.terminals.map((t) => t.id));
    if (ids.size !== symbol.terminals.length) {
      report(
        'symbol-terminals',
        `symbol ${symbol.name} has duplicate terminal ids`,
        'symbols',
        symbol.id,
      );
    }
    for (const [a, b] of symbol.bridges) {
      if (!ids.has(a) || !ids.has(b)) {
        report(
          'symbol-bridge',
          `symbol ${symbol.name} bridges a missing terminal`,
          'symbols',
          symbol.id,
        );
      }
    }
  }

  for (const element of Object.values(doc.elements)) {
    if (!doc.sheets[element.sheetId]) {
      report(
        'missing-sheet',
        `element ${element.id} is on a missing sheet`,
        'elements',
        element.id,
      );
    }
    if (!doc.symbols[element.symbolId]) {
      report(
        'missing-symbol',
        `element ${element.id} uses a missing symbol`,
        'elements',
        element.id,
      );
    }
    if (element.link !== undefined && !doc.elements[element.link]) {
      report(
        'missing-link',
        `element ${element.id} links a missing element`,
        'elements',
        element.id,
      );
    }
  }

  for (const junction of Object.values(doc.junctions)) {
    if (!doc.sheets[junction.sheetId]) {
      report(
        'missing-sheet',
        `junction ${junction.id} is on a missing sheet`,
        'junctions',
        junction.id,
      );
    }
  }

  for (const wire of Object.values(doc.wires)) {
    if (!doc.sheets[wire.sheetId]) {
      report('missing-sheet', `wire ${wire.id} is on a missing sheet`, 'wires', wire.id);
    }
    for (const end of [wire.from, wire.to]) {
      const problem = checkEnd(doc, end, wire.sheetId);
      if (problem) report('wire-end', `wire ${wire.id}: ${problem}`, 'wires', wire.id);
    }
    if (sameEnd(wire.from, wire.to)) {
      report('wire-loop', `wire ${wire.id} starts and ends on the same point`, 'wires', wire.id);
    }
  }

  return problems;
}

function checkEnd(doc: ProjectDoc, end: WireEnd, sheetId: string): string | undefined {
  if (isJunctionEnd(end)) {
    const junction = doc.junctions[end.junction];
    if (!junction) return `missing junction ${end.junction}`;
    if (junction.sheetId !== sheetId) return 'junction on another sheet';
    return undefined;
  }
  const element = doc.elements[end.element];
  if (!element) return `missing element ${end.element}`;
  if (element.sheetId !== sheetId) return 'element on another sheet';
  const symbol = doc.symbols[element.symbolId];
  if (symbol && !symbol.terminals.some((t) => t.id === end.terminal)) {
    return `missing terminal ${end.terminal}`;
  }
  return undefined;
}

export function sameEnd(a: WireEnd, b: WireEnd): boolean {
  if (isJunctionEnd(a) || isJunctionEnd(b)) {
    return isJunctionEnd(a) && isJunctionEnd(b) && a.junction === b.junction;
  }
  return a.element === b.element && a.terminal === b.terminal;
}

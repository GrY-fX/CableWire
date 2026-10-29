import { newSymbol } from '@cablewire/editor';
import type { SymbolDef, TerminalId } from '@cablewire/core';

/** A normally-open contact to try the editor with, until the base library arrives (step 4b). */
export function sampleContact(): SymbolDef {
  const t1 = 't1' as TerminalId;
  const t2 = 't2' as TerminalId;
  return {
    ...newSymbol(),
    name: 'Contatto NA (esempio)',
    category: 'Contatti',
    kind: 'slave',
    graphics: [
      { type: 'line', x1: 0, y1: -5, x2: 0, y2: -2.5 },
      { type: 'line', x1: 0, y1: 2.5, x2: 0, y2: 5 },
      { type: 'line', x1: 0, y1: 2.5, x2: -2.5, y2: -3 },
      { type: 'text', x: 2, y: 0, text: '{label}', size: 2.5 },
    ],
    terminals: [
      { id: t1, name: '13', x: 0, y: -5, dir: 'n' },
      { id: t2, name: '14', x: 0, y: 5, dir: 's' },
    ],
    defaultInfo: { label: 'K' },
  };
}

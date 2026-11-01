import { describe, expect, it } from 'vitest';
import type { SymbolDef, TerminalId } from '@cablewire/core';
import { checkSymbol } from './checks.ts';
import { SymbolEditor } from './controller.ts';
import {
  addTerminal,
  directionFor,
  duplicateItems,
  moveItems,
  newSymbol,
  removeItems,
  shapeKey,
  terminalKey,
  toggleBridge,
} from './document.ts';
import { applyHandle, clockwiseSweep, handlesOf } from './handles.ts';

const T1 = 't1' as TerminalId;
const T2 = 't2' as TerminalId;

function contact(): SymbolDef {
  return {
    ...newSymbol(),
    name: 'Contatto',
    category: 'Contatti',
    graphics: [
      { type: 'line', x1: 0, y1: -5, x2: 0, y2: -2.5 },
      { type: 'text', x: 2, y: 0, text: '{label}', size: 2.5 },
    ],
    terminals: [
      { id: T1, name: '1', x: 0, y: -5, dir: 'n' },
      { id: T2, name: '2', x: 0, y: 5, dir: 's' },
    ],
    bridges: [[T1, T2]],
  };
}

describe('symbol document', () => {
  it('moves, removes and duplicates shapes and terminals', () => {
    const s = contact();
    const moved = moveItems(s, [shapeKey(0), terminalKey(T1)], 2.5, 0);
    expect(moved.graphics[0]).toMatchObject({ x1: 2.5, x2: 2.5 });
    expect(moved.terminals[0]).toMatchObject({ x: 2.5, y: -5 });
    expect(moved.graphics[1]).toBe(s.graphics[1]);

    const removed = removeItems(s, [terminalKey(T1), shapeKey(1)]);
    expect(removed.terminals.map((t) => t.id)).toEqual([T2]);
    expect(removed.bridges).toEqual([]);
    expect(removed.graphics).toHaveLength(1);

    const dup = duplicateItems(s, [shapeKey(0), terminalKey(T2)], 2.5, 2.5);
    expect(dup.symbol.graphics).toHaveLength(3);
    expect(dup.symbol.terminals[2]).toMatchObject({ name: '3', x: 2.5, y: 7.5, dir: 's' });
    expect(dup.keys).toEqual([shapeKey(2), terminalKey(dup.symbol.terminals[2]!.id)]);
  });

  it('numbers new terminals and guesses their direction', () => {
    const s = removeItems(contact(), [terminalKey(T1)]);
    const { terminal } = addTerminal(s, { x: -5, y: 0 });
    expect(terminal).toMatchObject({ name: '1', dir: 'w' });
    expect(directionFor({ x: 0, y: -2.5 })).toBe('n');
    expect(directionFor({ x: 5, y: 2.5 })).toBe('e');
  });

  it('toggles bridges', () => {
    const s = contact();
    expect(toggleBridge(s, T2, T1).bridges).toEqual([]);
    expect(toggleBridge(toggleBridge(s, T1, T2), T1, T2).bridges).toEqual([[T1, T2]]);
  });
});

describe('handles', () => {
  it('edits rect corners keeping the opposite one fixed', () => {
    const rect = { type: 'rect', x: 0, y: 0, width: 4, height: 2 } as const;
    expect(handlesOf(rect)).toHaveLength(4);
    expect(applyHandle(rect, 2, { x: 6, y: 3 })).toMatchObject({ x: 0, y: 0, width: 6, height: 3 });
    expect(applyHandle(rect, 0, { x: 5, y: 1 })).toMatchObject({ x: 4, y: 1, width: 1, height: 1 });
  });

  it('edits arcs by start, end and radius', () => {
    const arc = { type: 'arc', cx: 0, cy: 0, r: 2, start: 0, sweep: 90 } as const;
    expect(applyHandle(arc, 1, { x: -3, y: 0 })).toMatchObject({ start: 0, sweep: 180 });
    expect(applyHandle(arc, 0, { x: 0, y: -2 })).toMatchObject({ start: -90, sweep: 180 });
    expect(applyHandle(arc, 2, { x: 0, y: 5 })).toMatchObject({ r: 5 });
    expect(clockwiseSweep(350, 10)).toBe(20);
    expect(clockwiseSweep(10, 10)).toBe(360);
  });
});

describe('checks', () => {
  it('reports errors and warnings', () => {
    expect(checkSymbol(contact())).toEqual({ errors: [], warnings: [] });
    const bad = { ...contact(), name: ' ', category: '', graphics: [] };
    bad.terminals = [{ ...bad.terminals[0]!, x: 1 }, bad.terminals[1]!];
    const result = checkSymbol(bad);
    expect(result.errors).toEqual([
      'Il simbolo non ha un nome.',
      'Il terminale 1 non è sulla griglia di 2.5 mm.',
    ]);
    expect(result.warnings).toHaveLength(2);
  });
});

describe('SymbolEditor', () => {
  const editor = (s: SymbolDef = newSymbol()) => {
    const e = new SymbolEditor(s);
    e.tolerance = 0.5;
    return e;
  };
  const click = (e: SymbolEditor, x: number, y: number, mods = {}) => {
    e.pointerDown({ x, y }, mods);
    e.pointerUp({ x, y });
  };

  it('draws a line with two snapped clicks and selects it', () => {
    const e = editor();
    e.setTool('line');
    click(e, 0.1, -5.2);
    e.pointerMove({ x: 0, y: 1 });
    expect(e.preview).toEqual([{ type: 'line', x1: 0, y1: -5, x2: 0, y2: 1 }]);
    click(e, 0.2, 2.4);
    expect(e.symbol.graphics).toEqual([{ type: 'line', x1: 0, y1: -5, x2: 0, y2: 2.5 }]);
    expect([...e.selection]).toEqual([shapeKey(0)]);
    expect(e.tool).toBe('line');
  });

  it('draws polylines, closing on the first point or with double click', () => {
    const e = editor();
    e.setTool('polyline');
    click(e, 0, 0);
    click(e, 4, 0);
    click(e, 4, 4);
    click(e, 0, 0);
    expect(e.symbol.graphics[0]).toMatchObject({ type: 'polyline', closed: true });
    click(e, 10, 0);
    click(e, 12, 0);
    click(e, 12, 0); // second click of a double click
    e.doubleClick();
    expect(e.symbol.graphics[1]).toMatchObject({
      closed: false,
      points: [
        { x: 10, y: 0 },
        { x: 12, y: 0 },
      ],
    });
  });

  it('draws rectangles by drag or two clicks, circles and arcs', () => {
    const e = editor();
    e.setTool('rect');
    e.pointerDown({ x: 3, y: 2 });
    e.pointerMove({ x: -3, y: -2 });
    e.pointerUp({ x: -3, y: -2 });
    click(e, 0, 0);
    click(e, 1, 1);
    expect(e.symbol.graphics).toEqual([
      { type: 'rect', x: -3, y: -2, width: 6, height: 4 },
      { type: 'rect', x: 0, y: 0, width: 1, height: 1 },
    ]);

    e.setTool('circle');
    click(e, 0, 0);
    click(e, 0, 1.5);
    expect(e.symbol.graphics[2]).toEqual({ type: 'circle', cx: 0, cy: 0, r: 1.5 });

    e.setTool('arc');
    click(e, 0, 0);
    click(e, 2, 0);
    click(e, 0, 2);
    expect(e.symbol.graphics[3]).toEqual({ type: 'arc', cx: 0, cy: 0, r: 2, start: 0, sweep: 90 });
  });

  it('places terminals on the 2.5 mm grid and texts with {label} first', () => {
    const e = editor();
    e.setTool('terminal');
    click(e, 0.4, -4.1);
    expect(e.symbol.terminals[0]).toMatchObject({ name: '1', x: 0, y: -5, dir: 'n' });
    e.setTool('text');
    click(e, 2, 0);
    expect(e.symbol.graphics[0]).toMatchObject({ type: 'text', text: '{label}' });
    expect(e.tool).toBe('select');
    e.setTool('text');
    click(e, 2, 3);
    expect(e.symbol.graphics[1]).toMatchObject({ text: 'Testo' });
  });

  it('selects, moves with one undo entry, and uses the terminal grid for terminals', () => {
    const e = editor(contact());
    e.pointerDown({ x: 0, y: -3 });
    e.pointerMove({ x: 0.3, y: -3 });
    e.pointerMove({ x: 1.1, y: -3 });
    e.pointerUp({ x: 1.1, y: -3 });
    expect([...e.selection]).toEqual([shapeKey(0)]);
    expect(e.symbol.graphics[0]).toMatchObject({ x1: 1, x2: 1 });
    e.undo();
    expect(e.symbol.graphics[0]).toMatchObject({ x1: 0, x2: 0 });

    e.pointerDown({ x: 0, y: 5 }); // terminal 2
    e.pointerMove({ x: 1.1, y: 5 });
    expect(e.symbol.terminals[1]).toMatchObject({ x: 0 }); // 1.1 rounds to 0 on the 2.5 grid
    e.pointerMove({ x: 2, y: 5 });
    e.pointerUp({ x: 2, y: 5 });
    expect(e.symbol.terminals[1]).toMatchObject({ x: 2.5 });
  });

  it('edits a shape through its handles', () => {
    const e = editor(contact());
    click(e, 0, -3);
    expect(e.handles).toEqual([
      { x: 0, y: -5 },
      { x: 0, y: -2.5 },
    ]);
    e.pointerDown({ x: 0, y: -2.5 });
    e.pointerMove({ x: 0, y: -1.1 });
    e.pointerUp({ x: 0, y: -1.1 });
    expect(e.symbol.graphics[0]).toMatchObject({ y1: -5, y2: -1 });
  });

  it('selects with a marquee and shift-click', () => {
    const e = editor(contact());
    e.pointerDown({ x: -1, y: -6 });
    e.pointerMove({ x: 1, y: -2 });
    expect(e.marquee).toEqual({ minX: -1, minY: -6, maxX: 1, maxY: -2 });
    e.pointerUp({ x: 1, y: -2 });
    expect(new Set(e.selection)).toEqual(new Set([shapeKey(0), terminalKey(T1)]));
    click(e, 0, 5, { shift: true });
    expect(e.selection.size).toBe(3);
    click(e, 0, 5, { shift: true });
    expect(e.selection.size).toBe(2);
  });

  it('handles keyboard: delete, arrows, duplicate, undo/redo, tools, escape', () => {
    const e = editor(contact());
    e.select([shapeKey(0)]);
    expect(e.key('ArrowRight')).toBe(true);
    expect(e.symbol.graphics[0]).toMatchObject({ x1: 0.5 });
    e.key('d', { ctrl: true });
    expect(e.symbol.graphics).toHaveLength(3);
    e.key('Delete');
    expect(e.symbol.graphics).toHaveLength(2);
    e.key('z', { ctrl: true });
    expect(e.symbol.graphics).toHaveLength(3);
    e.key('y', { ctrl: true });
    expect(e.symbol.graphics).toHaveLength(2);
    expect(e.key('l')).toBe(true);
    expect(e.tool).toBe('line');
    click(e, 0, 0);
    e.key('Escape');
    expect(e.preview).toEqual([]);
    e.key('Escape');
    expect(e.tool).toBe('select');
    expect(e.key('q')).toBe(false);
  });

  it('keeps the selection valid after undo and panel edits', () => {
    const e = editor(contact());
    e.setTool('terminal');
    click(e, 5, 0);
    e.undo();
    expect(e.selection.size).toBe(0);
    e.select([shapeKey(1)]);
    e.update({ ...e.symbol, graphics: [e.symbol.graphics[0]!] });
    expect(e.selection.size).toBe(0);
  });
});

describe('symbol clipboard', () => {
  it('copies and pastes with Ctrl+C / Ctrl+V, each paste a step further', () => {
    const editor = new SymbolEditor(contact());
    editor.select([shapeKey(0), terminalKey(T1)]);
    expect(editor.key('c', { ctrl: true })).toBe(true);
    expect(editor.canPaste).toBe(true);
    editor.key('v', { ctrl: true });
    editor.key('v', { ctrl: true });
    const s = editor.symbol;
    expect(s.graphics).toHaveLength(4);
    expect(s.graphics[2]).toEqual({ type: 'line', x1: 2.5, y1: -2.5, x2: 2.5, y2: 0 });
    expect(s.graphics[3]).toEqual({ type: 'line', x1: 5, y1: 0, x2: 5, y2: 2.5 });
    // Pasted terminals get new ids; their name is kept only when free.
    const names = s.terminals.map((t) => t.name);
    expect(new Set(s.terminals.map((t) => t.id)).size).toBe(4);
    expect(new Set(names).size).toBe(4);
    expect(editor.selection.size).toBe(2);
  });

  it('cuts, then pastes back in place, also into another symbol', () => {
    const editor = new SymbolEditor(contact());
    editor.select([shapeKey(1)]);
    editor.key('x', { ctrl: true });
    expect(editor.symbol.graphics).toHaveLength(1);
    editor.load(newSymbol());
    editor.key('v', { ctrl: true });
    expect(editor.symbol.graphics).toEqual([
      { type: 'text', x: 2, y: 0, text: '{label}', size: 2.5 },
    ]);
  });
});

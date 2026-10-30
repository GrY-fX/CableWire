import { describe, expect, it } from 'vitest';
import { createEmptyProject, createStore, getPotentials, placeElement } from '@cablewire/core';
import type { ElementId, SymbolDef, SymbolId, TerminalId, Wire } from '@cablewire/core';
import { SchematicEditor } from './controller.ts';
import { projectOnPath } from './wiring.ts';

const T1 = 't1' as TerminalId;
const T2 = 't2' as TerminalId;
const CONTACT: SymbolDef = {
  id: 'c' as SymbolId,
  name: 'Contatto',
  category: '',
  kind: 'simple',
  graphics: [{ type: 'line', x1: 0, y1: -5, x2: 0, y2: 5 }],
  terminals: [
    { id: T1, name: '1', x: 0, y: -5, dir: 'n' },
    { id: T2, name: '2', x: 0, y: 5, dir: 's' },
  ],
  bridges: [],
  defaultInfo: { label: '' },
  version: 1,
};
const p = (x: number, y: number) => ({ x, y });

/** A at (10,10): T1 (10,5), T2 (10,15). B at (40,40): T1 (40,35), T2 (40,45). */
function setup() {
  const store = createStore(createEmptyProject('t'), { checkInvariants: true });
  const editor = new SchematicEditor(store);
  editor.tolerance = 0.6;
  editor.startPlacing(CONTACT);
  for (const [x, y] of [
    [10, 10],
    [40, 40],
  ]) {
    editor.pointerDown(p(x!, y!));
    editor.pointerUp(p(x!, y!));
  }
  editor.setTool('select');
  editor.select([]);
  const [a, b] = Object.keys(store.doc.elements) as ElementId[];
  return { store, editor, a: a!, b: b! };
}

const click = (e: SchematicEditor, x: number, y: number) => {
  e.pointerMove(p(x, y));
  e.pointerDown(p(x, y));
  e.pointerUp(p(x, y));
};
const wires = (e: SchematicEditor): Wire[] => Object.values(e.doc.wires);

describe('drawing wires', () => {
  it('proposes an orthogonal route and connects two terminals', () => {
    const { editor, store, a, b } = setup();
    editor.setTool('wire');
    click(editor, 10.3, 15.2); // near A.T2
    editor.pointerMove(p(40.2, 35.3)); // near B.T1
    expect(editor.hot?.point).toEqual(p(40, 35));
    expect(editor.preview).toEqual([p(10, 15), p(10, 25), p(40, 25), p(40, 35)]);
    click(editor, 40.2, 35.3);
    expect(wires(editor)).toEqual([
      expect.objectContaining({
        from: { element: a, terminal: T2 },
        to: { element: b, terminal: T1 },
        bends: [p(10, 25), p(40, 25)],
      }),
    ]);
    expect(store.undoLabel).toBe('Collega filo');
    expect(editor.tool).toBe('wire');
  });

  it('fixes bends on clicks in empty space', () => {
    const { editor } = setup();
    editor.setTool('wire');
    click(editor, 10, 15);
    click(editor, 30, 20);
    click(editor, 40, 35);
    expect(wires(editor)[0]!.bends).toEqual([p(10, 20), p(40, 20)]);
  });

  it('removes the last bend with Backspace and cancels with Escape', () => {
    const { editor } = setup();
    editor.setTool('wire');
    click(editor, 10, 15);
    click(editor, 30, 20);
    editor.key('Backspace');
    editor.pointerMove(p(40, 35));
    expect(editor.preview).toEqual([p(10, 15), p(10, 25), p(40, 25), p(40, 35)]);
    editor.key('Escape');
    expect(editor.isWiring).toBe(false);
    expect(editor.tool).toBe('wire');
    editor.key('Escape');
    expect(editor.tool).toBe('select');
    expect(wires(editor)).toEqual([]);
  });

  it('branches from an existing wire with a junction', () => {
    const { editor, store } = setup();
    editor.setTool('wire');
    click(editor, 10, 15);
    click(editor, 40, 35);
    store.run(placeElement, {
      id: 'c' as ElementId,
      sheetId: editor.sheetId,
      symbolId: CONTACT.id,
      x: 70,
      y: 10,
    });
    click(editor, 70, 15);
    click(editor, 25.4, 25.2); // on the middle segment of the first wire
    expect(Object.values(editor.doc.junctions)).toEqual([
      expect.objectContaining({ x: 25, y: 25 }),
    ]);
    expect(wires(editor)).toHaveLength(3);
    const potentials = getPotentials(editor.doc);
    expect(new Set(wires(editor).map((w) => potentials.potentialOfWire(w.id))).size).toBe(1);
    store.undo();
    expect(wires(editor)).toHaveLength(1);
    expect(editor.doc.junctions).toEqual({});
  });

  it('starts a wire from a free terminal with the select tool, then returns to select', () => {
    const { editor } = setup();
    editor.pointerMove(p(10, 5));
    editor.pointerDown(p(10, 5));
    editor.pointerUp(p(10, 5));
    expect(editor.isWiring).toBe(true);
    click(editor, 40, 45);
    expect(wires(editor)).toHaveLength(1);
    expect(editor.tool).toBe('select');
  });

  it('projects points on wires onto the grid', () => {
    expect(projectOnPath(p(14, 1), [p(0, 0), p(20, 0), p(20, 10)], 2.5)).toEqual(p(15, 0));
    expect(projectOnPath(p(30, 7.4), [p(0, 0), p(20, 0), p(20, 10)], 2.5)).toEqual(p(20, 7.5));
  });
});

describe('editing wires', () => {
  function wired() {
    const ctx = setup();
    ctx.editor.setTool('wire');
    click(ctx.editor, 10, 15);
    click(ctx.editor, 40, 35);
    ctx.editor.setTool('select');
    const wire = wires(ctx.editor)[0]!;
    ctx.editor.select([`wire:${wire.id}`]);
    return { ...ctx, wire };
  }

  it('drags a segment parallel to itself as one undo entry', () => {
    const { editor, store } = wired();
    expect(editor.wireHandles.map((h) => h.kind)).toEqual(['segment', 'end', 'end']);
    const handle = editor.wireHandles[0]!;
    expect(handle.point).toEqual(p(25, 25));
    editor.pointerDown(handle.point);
    editor.pointerMove(p(25, 28));
    editor.pointerMove(p(26, 30.1));
    editor.pointerUp(p(26, 30.1));
    expect(wires(editor)[0]!.bends).toEqual([p(10, 30), p(40, 30)]);
    expect(store.undoLabel).toBe('Sposta tratto');
    store.undo();
    expect(wires(editor)[0]!.bends).toEqual([p(10, 25), p(40, 25)]);
  });

  it('reconnects a wire end to another terminal', () => {
    const { editor, b } = wired();
    editor.pointerDown(p(40, 35));
    editor.pointerMove(p(40, 45));
    expect(editor.preview?.at(-1)).toEqual(p(40, 45));
    editor.pointerUp(p(40, 45));
    expect(wires(editor)[0]!.to).toEqual({ element: b, terminal: T2 });
  });

  it('highlights the potential and stretches wires when elements move', () => {
    const { editor, a, wire } = wired();
    expect(editor.highlight).toEqual({ keys: [`wire:${wire.id}`], wires: 1, sheets: 1 });
    editor.select([`element:${a}`]);
    editor.key('ArrowRight');
    expect(wires(editor)[0]!.bends).toEqual([p(12.5, 25), p(40, 25)]);
    editor.rerouteSelectedWire(); // nothing selected as wire: no change
    editor.select([`wire:${wire.id}`]);
    editor.rerouteSelectedWire();
    expect(wires(editor)[0]!.bends).toEqual([p(12.5, 25), p(40, 25)]);
  });
});

describe('automatic numbering while drawing', () => {
  it('numbers new potentials in the same undo entry, and pasted ones anew', () => {
    const { editor, store } = setup();
    editor.setTool('wire');
    click(editor, 10, 15);
    click(editor, 40, 35);
    expect(wires(editor)[0]!.props.number).toBe('1.01');
    store.undo();
    expect(wires(editor)).toEqual([]);
    store.redo();

    editor.setTool('select');
    editor.key('a', { ctrl: true });
    editor.key('c', { ctrl: true });
    editor.key('v', { ctrl: true });
    expect(
      wires(editor)
        .map((w) => w.props.number)
        .sort(),
    ).toEqual(['1.01', '1.02']);
    expect(store.undoLabel).toBe('Incolla');
  });
});

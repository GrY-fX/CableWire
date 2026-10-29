import { describe, expect, it } from 'vitest';
import { addSheet, addWire, createEmptyProject, createStore } from '@cablewire/core';
import type { ElementId, SheetId, SymbolDef, SymbolId, TerminalId } from '@cablewire/core';
import { SchematicEditor } from './controller.ts';
import { elementBounds, hitSheet, parseItemKey } from './hit.ts';

const T1 = 't1' as TerminalId;
const T2 = 't2' as TerminalId;
const COIL: SymbolDef = {
  id: 'coil' as SymbolId,
  name: 'Bobina',
  category: 'Bobine',
  kind: 'master',
  graphics: [{ type: 'rect', x: -3, y: -2.5, width: 6, height: 5 }],
  terminals: [
    { id: T1, name: 'A1', x: 0, y: -5, dir: 'n' },
    { id: T2, name: 'A2', x: 0, y: 5, dir: 's' },
  ],
  bridges: [],
  defaultInfo: { label: 'K' },
  version: 1,
};

function setup() {
  const store = createStore(createEmptyProject('t'), { checkInvariants: true });
  const editor = new SchematicEditor(store);
  editor.tolerance = 0.5;
  return { store, editor };
}

const click = (e: SchematicEditor, x: number, y: number, mods = {}) => {
  e.pointerDown({ x, y }, mods);
  e.pointerUp({ x, y });
};

const elementIds = (e: SchematicEditor) => Object.keys(e.doc.elements) as ElementId[];

describe('SchematicEditor', () => {
  it('places symbols on the grid, importing the symbol once, with one undo each', () => {
    const { editor, store } = setup();
    editor.startPlacing(COIL);
    editor.pointerMove({ x: 51.2, y: 49.1 });
    expect(editor.ghost).toMatchObject({ x: 50, y: 50, rotation: 0 });
    editor.key('r');
    expect(editor.ghost?.rotation).toBe(90);
    click(editor, 51.2, 49.1);
    click(editor, 70, 50);
    expect(Object.keys(editor.doc.symbols)).toEqual(['coil']);
    const [a, b] = elementIds(editor).map((id) => editor.doc.elements[id]!);
    expect(a).toMatchObject({ x: 50, y: 50, rotation: 90, info: { label: 'K' } });
    expect(b).toMatchObject({ x: 70, y: 50 });
    expect(store.undoLabel).toBe('Inserisci Bobina');
    expect(editor.tool).toBe('place');
    editor.key('Escape');
    expect(editor.tool).toBe('select');
    store.undo();
    store.undo();
    expect(editor.doc.elements).toEqual({});
    expect(editor.doc.symbols).toEqual({});
  });

  it('updates the project copy when placing a changed symbol', () => {
    const { editor } = setup();
    editor.startPlacing(COIL);
    click(editor, 0, 0);
    editor.startPlacing({ ...COIL, name: 'Bobina 2', version: 2 });
    click(editor, 20, 0);
    expect(editor.doc.symbols['coil' as SymbolId]!.version).toBe(2);

    // A version that drops a wired terminal cannot replace the project copy.
    const [a, b] = elementIds(editor);
    editor.store.run(addWire, {
      from: { element: a!, terminal: T2 },
      to: { element: b!, terminal: T2 },
    });
    editor.startPlacing({ ...COIL, terminals: [COIL.terminals[0]!], version: 3 });
    click(editor, 40, 0);
    expect(editor.lastError).toBeDefined();
    expect(elementIds(editor)).toHaveLength(2);
  });

  it('selects, moves by grid steps as one undo entry, and marquee-selects', () => {
    const { editor, store } = setup();
    editor.startPlacing(COIL);
    click(editor, 10, 10);
    click(editor, 30, 10);
    editor.stopPlacing();
    const [a, b] = elementIds(editor);

    editor.pointerDown({ x: 10, y: 10 });
    editor.pointerMove({ x: 11, y: 10 });
    editor.pointerMove({ x: 14, y: 11 });
    editor.pointerUp({ x: 14, y: 11 });
    expect(editor.doc.elements[a!]).toMatchObject({ x: 15, y: 10 });
    store.undo();
    expect(editor.doc.elements[a!]).toMatchObject({ x: 10, y: 10 });

    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 40, y: 20 });
    expect(editor.marquee).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 20 });
    editor.pointerUp({ x: 40, y: 20 });
    expect(new Set(editor.selection)).toEqual(new Set([`element:${a}`, `element:${b}`]));
    click(editor, 30, 10, { shift: true });
    expect([...editor.selection]).toEqual([`element:${a}`]);
  });

  it('rotates, mirrors, moves with arrows and deletes the selection', () => {
    const { editor } = setup();
    editor.startPlacing(COIL);
    click(editor, 10, 10);
    editor.stopPlacing();
    const [a] = elementIds(editor);
    expect(editor.key('r')).toBe(true);
    expect(editor.key('m')).toBe(true);
    editor.key('ArrowRight');
    expect(editor.doc.elements[a!]).toMatchObject({ rotation: 90, mirrored: true, x: 12.5 });
    editor.key('Delete');
    expect(editor.doc.elements).toEqual({});
    expect(editor.selection.size).toBe(0);
    editor.key('z', { ctrl: true });
    expect(editor.doc.elements[a!]).toBeDefined();
  });

  it('copies and pastes with an offset, also on another sheet', () => {
    const { editor, store } = setup();
    editor.startPlacing(COIL);
    click(editor, 10, 10);
    click(editor, 30, 10);
    editor.stopPlacing();
    const [a, b] = elementIds(editor);
    store.run(addWire, { from: { element: a!, terminal: T1 }, to: { element: b!, terminal: T1 } });
    editor.key('a', { ctrl: true });
    expect(editor.selection.size).toBe(3);
    editor.key('c', { ctrl: true });
    editor.key('v', { ctrl: true });
    expect(elementIds(editor)).toHaveLength(4);
    expect(Object.keys(editor.doc.wires)).toHaveLength(2);
    const pasted = [...editor.selection].map(parseItemKey).filter((k) => k?.kind === 'element');
    expect(editor.doc.elements[pasted[0]!.id as ElementId]).toMatchObject({ x: 15, y: 15 });

    store.run(addSheet, { id: 's2' as SheetId });
    editor.setSheet('s2' as SheetId);
    editor.key('v', { ctrl: true });
    const onS2 = Object.values(editor.doc.elements).filter((e) => e.sheetId === 's2');
    expect(onS2.map((e) => e.x).sort()).toEqual([10, 30]);

    editor.key('d', { ctrl: true });
    expect(Object.values(editor.doc.elements).filter((e) => e.sheetId === 's2')).toHaveLength(4);
  });

  it('keeps the selection on the current sheet and existing items', () => {
    const { editor, store } = setup();
    editor.startPlacing(COIL);
    click(editor, 10, 10);
    expect(editor.selection.size).toBe(1);
    store.undo();
    expect(editor.selection.size).toBe(0);
    expect(editor.doubleClick({ x: 10, y: 10 })).toBeUndefined();
  });
});

describe('sheet hit testing', () => {
  it('finds elements by their rotated bounds and wires by distance', () => {
    const { editor, store } = setup();
    editor.startPlacing(COIL);
    click(editor, 10, 10);
    click(editor, 40, 10);
    const [a, b] = elementIds(editor);
    const element = editor.doc.elements[a!]!;
    expect(elementBounds({ ...element, rotation: 90 }, COIL)).toEqual({
      minX: 5,
      minY: 7,
      maxX: 15,
      maxY: 13,
    });
    store.run(addWire, {
      from: { element: a!, terminal: T1 },
      to: { element: b!, terminal: T1 },
      bends: [
        { x: 10, y: 0 },
        { x: 40, y: 0 },
      ],
    });
    const sheet = editor.sheetId;
    expect(hitSheet(editor.doc, sheet, { x: 25, y: 0.3 }, 0.5)).toMatch(/^wire:/);
    expect(hitSheet(editor.doc, sheet, { x: 41, y: 12 }, 0.5)).toBe(`element:${b}`);
    expect(hitSheet(editor.doc, sheet, { x: 25, y: 20 }, 0.5)).toBeUndefined();
  });
});

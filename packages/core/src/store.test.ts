import { describe, expect, it, vi } from 'vitest';
import type { ElementId } from './ids.ts';
import { createEmptyProject } from './model.ts';
import { createStore } from './store.ts';
import { moveItems, placeElement } from './commands/elements.ts';
import { updateProjectMeta } from './commands/project.ts';
import { CONTACT, must, setup } from './test-utils.ts';

const E = 'e1' as ElementId;

describe('store', () => {
  it('undoes and redoes a command, exposing labels', () => {
    const { store, sheet } = setup();
    const before = store.doc;
    must(store, placeElement, { id: E, sheetId: sheet, symbolId: CONTACT.id, x: 0, y: 0 });
    expect(store.undoLabel).toBe('Inserisci elemento');

    expect(store.undo()).toBe(true);
    expect(store.doc).toEqual(before);
    expect(store.redoLabel).toBe('Inserisci elemento');

    expect(store.redo()).toBe(true);
    expect(store.doc.elements[E]).toBeDefined();
  });

  it('merges a transaction into a single undo entry', () => {
    const { store, sheet } = setup();
    must(store, placeElement, { id: E, sheetId: sheet, symbolId: CONTACT.id, x: 0, y: 0 });
    const placed = store.doc;
    store.begin('Sposta');
    for (let i = 0; i < 5; i++) must(store, moveItems, { elements: [E], dx: 2.5, dy: 0 });
    store.commit();
    expect(store.doc.elements[E]!.x).toBe(12.5);

    store.undo();
    expect(store.doc).toEqual(placed);
    expect(store.undoLabel).toBe('Inserisci elemento');
  });

  it('rolls back an open transaction', () => {
    const { store, sheet } = setup();
    const before = store.doc;
    store.begin('Prova');
    must(store, placeElement, { id: E, sheetId: sheet, symbolId: CONTACT.id, x: 0, y: 0 });
    store.rollback();
    expect(store.doc).toEqual(before);
    expect(store.inTransaction).toBe(false);
  });

  it('leaves the document untouched when a command fails', () => {
    const { store, sheet } = setup();
    const before = store.doc;
    const result = store.run(placeElement, {
      sheetId: sheet,
      symbolId: 'nope' as never,
      x: 0,
      y: 0,
    });
    expect(result.ok).toBe(false);
    expect(store.doc).toBe(before);
    expect(store.undoLabel).toBe('Importa simbolo');
  });

  it('clears redo after a new command and limits history', () => {
    const store = createStore(createEmptyProject(), { maxHistory: 3 });
    for (let i = 0; i < 5; i++) must(store, updateProjectMeta, { set: { title: `t${i}` } });
    let undos = 0;
    while (store.undo()) undos++;
    expect(undos).toBe(3);
    expect(store.doc.meta.title).toBe('t1');

    must(store, updateProjectMeta, { set: { title: 'x' } });
    expect(store.redo()).toBe(false);
  });

  it('notifies subscribers with the changed rows', () => {
    const { store, sheet } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    must(store, placeElement, { id: E, sheetId: sheet, symbolId: CONTACT.id, x: 0, y: 0 });
    expect(listener).toHaveBeenCalledWith(store.doc, [{ table: 'elements', id: E }]);
    unsubscribe();
    store.undo();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reset replaces the document and clears history', () => {
    const { store, sheet } = setup();
    must(store, placeElement, { id: E, sheetId: sheet, symbolId: CONTACT.id, x: 0, y: 0 });
    const fresh = createEmptyProject('nuovo');
    store.reset(fresh);
    expect(store.doc).toBe(fresh);
    expect(store.undo()).toBe(false);
  });

  it('refuses undo during a transaction', () => {
    const { store } = setup();
    store.begin('x');
    expect(() => store.undo()).toThrow();
  });
});

describe('unrecorded commands', () => {
  it('apply without an undo entry and keep the history intact', () => {
    const { store, sheet } = setup();
    must(store, placeElement, { id: E, sheetId: sheet, symbolId: CONTACT.id, x: 0, y: 0 });
    const result = store.runUnrecorded(updateProjectMeta, { set: { updatedAt: '2030-01-01' } });
    expect(result.ok).toBe(true);
    expect(store.doc.meta.updatedAt).toBe('2030-01-01');
    expect(store.undoLabel).toBe('Inserisci elemento');
    store.begin('x');
    expect(() => store.runUnrecorded(updateProjectMeta, { set: {} })).toThrow();
  });
});

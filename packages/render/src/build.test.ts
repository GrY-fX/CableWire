import { describe, expect, it } from 'vitest';
import type { Element, ProjectDoc, Sheet, SymbolDef } from '@cablewire/core';
import { buildElementNode, buildScene, primitivePath, wireNumber } from './build.ts';
import type { SceneNode } from './scene.ts';
import { rowLabel, sheetLayout } from './sheet.ts';
import { fillPlaceholders, readableText } from './text.ts';
import { fixture, J1, K1, K2, W1 } from './fixture.test-utils.ts';

function texts(node: SceneNode): Extract<SceneNode, { kind: 'text' }>[] {
  if (node.kind === 'text') return [node];
  if (node.kind === 'group') return node.children.flatMap(texts);
  return [];
}

describe('sheet layout', () => {
  it('uses ISO sizes, orientation and margins', () => {
    const sheet = { size: 'A3', orientation: 'landscape', rows: 6, cols: 10 } as Sheet;
    expect(sheetLayout(sheet)).toMatchObject({
      width: 420,
      height: 297,
      frame: { x: 10, y: 10, width: 400, height: 277 },
      titleBlock: { x: 290, y: 267, width: 120, height: 20 },
    });
    const a4 = sheetLayout({ ...sheet, size: 'A4', orientation: 'portrait' });
    expect(a4).toMatchObject({ width: 210, height: 297, frame: { x: 5 } });
  });

  it('labels rows A..Z, AA..', () => {
    expect([0, 25, 26, 27].map(rowLabel)).toEqual(['A', 'Z', 'AA', 'AB']);
  });
});

describe('texts', () => {
  it('fills placeholders', () => {
    expect(fillPlaceholders('{label} {missing}-{function}', { label: 'KM1', function: 'M' })).toBe(
      'KM1 -M',
    );
  });

  it('keeps texts readable from the bottom or the right', () => {
    expect(readableText(0, false, 'start')).toEqual({ angle: 0, anchor: 'start' });
    expect(readableText(90, false, 'start')).toEqual({ angle: 90, anchor: 'start' });
    expect(readableText(180, false, 'start')).toEqual({ angle: 0, anchor: 'end' });
    expect(readableText(270, false, 'end')).toEqual({ angle: 90, anchor: 'start' });
    expect(readableText(0, true, 'start')).toEqual({ angle: 0, anchor: 'end' });
    expect(readableText(180, true, 'middle')).toEqual({ angle: 0, anchor: 'middle' });
  });
});

describe('buildScene', () => {
  it('builds frame, wires, elements and junctions in layer order', () => {
    const { store, sheet, split } = fixture();
    split();
    const scene = buildScene(store.doc, sheet);
    expect(scene).toMatchObject({ width: 420, height: 297 });
    expect(scene.items.map((i) => i.key)).toEqual([
      'frame',
      `wire:${W1}`,
      expect.stringMatching(/^wire:/),
      `element:${K1}`,
      `element:${K2}`,
      `junction:${J1}`,
    ]);
  });

  it('writes the title block', () => {
    const { store, sheet } = fixture();
    const frame = buildScene(store.doc, sheet).items[0]!.node;
    const values = texts(frame).map((t) => t.text);
    expect(values).toEqual(
      expect.arrayContaining(['Impianto', '1', 'G.', '2026-10-29', 'Foglio 1 / 1']),
    );
  });

  it('places element texts outside the rotation, readable', () => {
    const { store, sheet } = fixture();
    const scene = buildScene(store.doc, sheet);
    const k2 = scene.items.find((i) => i.key === `element:${K2}`)!.node;
    // Text at (4.5, 0) rotated 180° around (80,80) → (75.5, 80), anchor swapped.
    expect(texts(k2)).toEqual([
      expect.objectContaining({ text: 'KM2', x: 75.5, y: 80, anchor: 'end' }),
    ]);
    expect(k2.kind === 'group' && k2.children[0]).toMatchObject({
      kind: 'group',
      transform: 'translate(80 80) rotate(180)',
    });
  });

  it('draws wires through their bends with the number on the longest segment', () => {
    const { store, sheet } = fixture();
    const wire = buildScene(store.doc, sheet).items.find((i) => i.key === `wire:${W1}`)!.node;
    // K1.A2 = (50,55); K2 rotated 180 → A2 = (80,75)
    expect(wire.kind === 'group' && wire.children[0]).toMatchObject({
      d: 'M50 55L50 75L80 75L80 75',
    });
    expect(texts(wire)).toEqual([
      expect.objectContaining({ text: '12', x: 65, y: 73.5, anchor: 'middle' }),
    ]);
  });

  it('puts vertical wire numbers left of the wire, rotated', () => {
    const node = wireNumber(
      [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 10, y: 40 },
      ],
      '7',
    );
    expect(node).toMatchObject({ x: -1.5, y: 20, angle: 90 });
  });

  it('turns arcs into SVG arcs', () => {
    expect(primitivePath({ type: 'arc', cx: 0, cy: 0, r: 2, start: 0, sweep: 90 })).toMatchObject({
      d: 'M2 0A2 2 0 0 1 0 2',
    });
    expect(primitivePath({ type: 'arc', cx: 1, cy: 1, r: 2, start: 0, sweep: 360 })).toMatchObject({
      kind: 'circle',
    });
  });

  it('is memoized per document version and sheet', () => {
    const { store, sheet } = fixture();
    expect(buildScene(store.doc, sheet)).toBe(buildScene(store.doc, sheet));
  });
});

describe('sheet references', () => {
  it('draw the wire number (or N/C id) and where the wire continues', () => {
    const { store, sheet } = fixture();
    const doc = store.doc;
    const report = {
      id: 'rep',
      name: 'out',
      category: 't',
      kind: 'report',
      report: 'out',
      graphics: [
        { type: 'text', x: 9, y: 0, text: '{ref_name}', size: 2.5 },
        { type: 'text', x: 9, y: 3, text: '{ref_target}', size: 2 },
      ],
      terminals: [{ id: 't1', name: '1', x: 0, y: 0, dir: 'w' }],
      bridges: [],
      defaultInfo: {},
      version: 1,
    } as unknown as SymbolDef;
    const element = {
      id: 'r1',
      sheetId: sheet,
      symbolId: 'rep',
      x: 200,
      y: 100,
      rotation: 0,
      mirrored: false,
      info: { ref_id: 'N/C_3' },
    } as unknown as Element;
    const withReport: ProjectDoc = {
      ...doc,
      symbols: { ...doc.symbols, [report.id]: report },
      elements: { ...doc.elements, [element.id]: element },
    };
    const item = buildScene(withReport, sheet).items.find((i) => i.key === 'element:r1')!;
    expect(texts(item.node).map((t) => t.text)).toEqual(['N/C_3', '→ ?.?']);
  });
});

describe('contacts', () => {
  it('draw the label of their coil and where the coil is', () => {
    const { store, sheet } = fixture();
    const doc = store.doc;
    const contact = {
      id: 'no',
      name: 'NA',
      category: 't',
      kind: 'slave',
      contact: 'no',
      graphics: [
        { type: 'text', x: 2, y: 0, text: '{label}', size: 2.5 },
        { type: 'text', x: 2, y: 3, text: '{master_ref}', size: 2 },
      ],
      terminals: [],
      bridges: [],
      defaultInfo: {},
      version: 1,
    } as unknown as SymbolDef;
    const coil = { ...doc.symbols[doc.elements[K1]!.symbolId]!, kind: 'master' } as SymbolDef;
    const element = {
      id: 'c1',
      sheetId: sheet,
      symbolId: 'no',
      x: 300,
      y: 100,
      rotation: 0,
      mirrored: false,
      info: { label: 'K' },
      link: K1,
    } as unknown as Element;
    const withContact: ProjectDoc = {
      ...doc,
      symbols: { ...doc.symbols, [coil.id]: coil, [contact.id]: contact },
      elements: { ...doc.elements, [element.id]: element },
    };
    const item = buildScene(withContact, sheet).items.find((i) => i.key === 'element:c1')!;
    // K1 is KM1 at (50, 50): sheet 1, column 1 of the A3 frame.
    expect(texts(item.node).map((t) => t.text)).toEqual(['KM1', '/1.1']);
  });
});

describe('rotated symbol texts', () => {
  it('turn with the element and stay readable', () => {
    const symbol = {
      id: 's',
      name: 's',
      category: 't',
      kind: 'simple',
      graphics: [{ type: 'text', x: 2, y: 0, text: 'K', size: 2.5, rotation: 90 }],
      terminals: [],
      bridges: [],
      defaultInfo: {},
      version: 1,
    } as unknown as SymbolDef;
    const at = (rotation: 0 | 90) =>
      texts(buildElementNode({ x: 0, y: 0, rotation, mirrored: false, info: {} }, symbol))[0]!;
    expect(at(0)).toMatchObject({ angle: 90, anchor: 'start' });
    // 90° of its own plus 90° of the element: horizontal again, anchored on the other side.
    expect(at(90).angle).toBeUndefined();
    expect(at(90).anchor).toBe('end');
  });
});

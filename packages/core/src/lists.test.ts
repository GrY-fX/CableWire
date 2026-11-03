import { describe, expect, it } from 'vitest';
import { createCable, updateCable } from './commands/cables.ts';
import { placeElement, setElementInfo } from './commands/elements.ts';
import { addStrip, setTerminalNo, setTerminalStrip } from './commands/strips.ts';
import { addWire, setPotentialNumber, setWireProps } from './commands/wires.ts';
import { deviceFieldKey, projectLists } from './lists.ts';
import { updateSettings } from './commands/project.ts';
import { CONTACT, T1, T2, TERMINAL, must, setup } from './test-utils.ts';

const id = (s: string) => s as never;

/** Q1 (top) → terminal X1:1 → M1 (bottom), the lower wire in cable W1. */
function project() {
  const ctx = setup();
  const place = (name: string, symbolId: string, y: number, label: string) => {
    must(ctx.store, placeElement, {
      id: id(name),
      sheetId: ctx.sheet,
      symbolId: id(symbolId),
      x: 50,
      y,
    });
    must(ctx.store, setElementInfo, { id: id(name), set: { label } });
  };
  place('q', CONTACT.id, 20, '1Q1');
  place('x', TERMINAL.id, 50, '');
  place('m', CONTACT.id, 80, '1M1');
  must(ctx.store, setElementInfo, { id: id('q'), set: { function: 'Generale' } });
  must(ctx.store, addStrip, { id: 'X1', mode: 'custom', name: 'X1' });
  must(ctx.store, setTerminalStrip, { id: id('x'), strip: 'X1' });
  must(ctx.store, setTerminalNo, { id: id('x'), no: '1' });
  must(ctx.store, addWire, {
    id: id('w1'),
    from: { element: id('q'), terminal: T2 },
    to: { element: id('x'), terminal: T1 },
  });
  must(ctx.store, addWire, {
    id: id('w2'),
    from: { element: id('m'), terminal: T1 },
    to: { element: id('x'), terminal: T2 },
  });
  must(ctx.store, setPotentialNumber, { id: id('w1'), number: '1.01' });
  must(ctx.store, setWireProps, { id: id('w2'), set: { section: '1,5' } });
  must(ctx.store, createCable, { id: id('c'), wires: [id('w2')] });
  must(ctx.store, updateCable, {
    id: id('c'),
    set: { type: 'FG16OR16', section: '1,5', length: 12.5 },
  });
  return ctx;
}

describe('project lists', () => {
  it('list each wire with its ends, colour, section and cable', () => {
    const [wires] = projectLists(project().store.doc, ['wires']);
    expect(wires!.columns).toEqual(['Numero', 'Da', 'A', 'Colore', 'Sezione', 'Cavo', 'Foglio']);
    expect(wires!.rows).toEqual([
      ['1.01', '1Q1:2', 'X1:1', '', '', '', '1.1'],
      ['1.01', '1M1:1', 'X1:1', 'BN', '1,5', '1W1 / BN', '1.1'],
    ]);
  });

  it('list devices by label, without terminals', () => {
    const ctx = project();
    must(ctx.store, setElementInfo, {
      id: id('q'),
      set: { costruttore: 'ABB', codice_prodotto: 'S201-C16' },
    });
    const [devices] = projectLists(ctx.store.doc, ['devices']);
    expect(devices!.rows).toEqual([
      ['1M1', 'contact', '', '', '', '', '1.1', ''],
      ['1Q1', 'contact', 'Generale', '', 'ABB', 'S201-C16', '1.1', ''],
    ]);
  });

  it('add the project properties marked for the tables as columns', () => {
    const ctx = project();
    const doc = ctx.store.doc;
    expect(deviceFieldKey(doc, 'Tensione nominale')).toBe('tensione_nominale');
    expect(deviceFieldKey(doc, 'Costruttore')).toBe('costruttore_2');
    must(ctx.store, updateSettings, {
      set: {
        deviceFields: [
          { key: 'tensione', label: 'Tensione', inTables: true },
          { key: 'note', label: 'Note' },
        ],
      },
    });
    must(ctx.store, setElementInfo, { id: id('q'), set: { tensione: '400 V', note: 'x' } });
    const [devices] = projectLists(ctx.store.doc, ['devices']);
    expect(devices!.columns).toContain('Tensione');
    expect(devices!.columns).not.toContain('Note');
    expect(devices!.rows[1]).toContain('400 V');
    expect(devices!.rows[1]).not.toContain('x');
  });

  it('list cables with the devices at their two sides', () => {
    const [cables] = projectLists(project().store.doc, ['cables']);
    // The terminal is above the motor: it is the "from" side.
    expect(cables!.rows).toEqual([['1W1', 'FG16OR16', '1x1,5', '12,5 m', 'X1:1', '1M1', '1']]);
  });

  it('list each strip with what is wired above and below its terminals', () => {
    const [strip] = projectLists(project().store.doc, ['strips']);
    expect(strip!.title).toBe('Morsettiera X1');
    expect(strip!.rows).toEqual([['X1:1', '1.01', '1Q1:2', '1M1:1', '1W1 / BN']]);
  });
});

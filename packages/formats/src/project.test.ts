import { describe, expect, it } from 'vitest';
import { moveItems, createStore } from '@cablewire/core';
import type { ElementId } from '@cablewire/core';
import { migrate } from './migrations/index.ts';
import { parseProject, serializeProject } from './project.ts';
import { parseSymbol, serializeSymbol } from './symbol.ts';
import { RICH_SYMBOL, sampleProject } from './fixture.test-utils.ts';
// Committed file: must keep opening even after the format moves to newer versions.
import sampleV1 from '../fixtures/sample-v1.cwp?raw';

const ok = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('project files', () => {
  it('writes the sample project file (fixture for future versions)', async () => {
    await expect(serializeProject(sampleProject(), { app: 'CableWire test' })).toMatchFileSnapshot(
      '../fixtures/sample-v1.cwp',
    );
  });

  it('still opens the version 1 sample file', () => {
    const doc = ok(parseProject(sampleV1));
    expect(doc.meta.title).toBe('Quadro pompa');
    expect(Object.keys(doc.wires)).toHaveLength(3);
  });

  it('round-trips and is stable', () => {
    const doc = sampleProject();
    const text = serializeProject(doc);
    const parsed = parseProject(text);
    const back = ok(parsed);
    expect(parsed.ok && parsed.warnings).toEqual([]);
    expect(serializeProject(back)).toBe(text);
    expect(back.elements['x1' as ElementId]).toEqual(doc.elements['x1' as ElementId]);
    expect(back.elements['x2' as ElementId]!.x).toBe(20.3);
  });

  it('starts with the envelope and keeps small objects on one line', () => {
    const text = serializeProject(sampleProject());
    expect(text.split('\n').slice(0, 4)).toEqual([
      '{',
      '  "format": "cablewire-project",',
      '  "formatVersion": 1,',
      '  "app": "CableWire",',
    ]);
    expect(text).toContain('"bends": [\n');
    expect(text).toContain('{ "x": 20, "y": 30 }');
  });

  it('changes only the lines of what was edited', () => {
    const store = createStore(sampleProject());
    const before = serializeProject(store.doc).split('\n');
    store.run(moveItems, { elements: ['x3' as ElementId], dx: 5, dy: 0 });
    const after = serializeProject(store.doc).split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed).toEqual(['      "x": 45,']);
  });
});

describe('reading errors', () => {
  const text = () => JSON.parse(serializeProject(sampleProject())) as Record<string, unknown>;
  const errorOf = (json: unknown) => {
    const result = parseProject(typeof json === 'string' ? json : JSON.stringify(json));
    if (result.ok) throw new Error('expected an error');
    return result.error;
  };

  it('rejects broken JSON and other formats', () => {
    expect(errorOf('{ not json').code).toBe('json');
    expect(errorOf({ ...text(), format: 'qet' }).code).toBe('format');
    expect(errorOf([1, 2]).code).toBe('format');
    expect(errorOf({ ...text(), formatVersion: 'uno' }).code).toBe('format');
  });

  it('refuses files from a newer version', () => {
    const error = errorOf({ ...text(), formatVersion: 99 });
    expect(error.code).toBe('newer-version');
    expect(error.message).toContain('versione più nuova');
  });

  it('reports wrong fields with their path', () => {
    const json = text();
    (json.elements as Record<string, Record<string, unknown>>).x1!.x = 'venti';
    (json.sheets as Record<string, Record<string, unknown>>)['sheet-1']!.size = 'A9';
    const error = errorOf(json);
    expect(error.code).toBe('schema');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^elements\.x1\.x: /),
        expect.stringMatching(/^sheets\.sheet-1\.size: /),
      ]),
    );
  });

  it('reports broken references', () => {
    const json = text();
    delete (json.elements as Record<string, unknown>).x3;
    const error = errorOf(json);
    expect(error.code).toBe('integrity');
    expect(error.details.join(' ')).toContain('missing element x3');
  });

  it('drops unknown properties with a warning', () => {
    const json = text();
    json.extra = 1;
    (json.wires as Record<string, Record<string, unknown>>).w3!.style = 'dashed';
    const result = parseProject(JSON.stringify(json));
    expect(result.ok && result.warnings).toEqual([
      'Proprietà sconosciuta ignorata: wires.w3.style',
      'Proprietà sconosciuta ignorata: extra',
    ]);
  });
});

describe('migrations', () => {
  it('applies the chain in order and updates the version', () => {
    const steps = [
      { from: 1, migrate: (j: Record<string, unknown>) => ({ ...j, a: 1 }) },
      { from: 2, migrate: (j: Record<string, unknown>) => ({ ...j, b: (j.a as number) + 1 }) },
    ];
    expect(migrate({ formatVersion: 1 }, 1, 3, steps)).toEqual({ formatVersion: 3, a: 1, b: 2 });
    expect(() => migrate({}, 1, 3, steps.slice(0, 1))).toThrow();
  });
});

describe('symbol files', () => {
  it('round-trips a symbol', () => {
    const text = serializeSymbol(RICH_SYMBOL);
    expect(text.startsWith('{\n  "format": "cablewire-symbol",')).toBe(true);
    expect(ok(parseSymbol(text))).toEqual(RICH_SYMBOL);
  });

  it('rejects inconsistent symbols and project files', () => {
    const json = JSON.parse(serializeSymbol(RICH_SYMBOL)) as { symbol: { bridges: string[][] } };
    json.symbol.bridges = [['t1', 'zz']];
    const result = parseSymbol(JSON.stringify(json));
    expect(!result.ok && result.error.code).toBe('integrity');
    const asProject = parseSymbol(serializeProject(sampleProject()));
    expect(!asProject.ok && asProject.error.code).toBe('format');
  });
});

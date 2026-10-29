import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '@cablewire/core';
import { ProjectAutosave } from './autosave.ts';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ProjectAutosave', () => {
  it('saves after a delay, merging changes, and loads back through the parser', async () => {
    const autosave = await ProjectAutosave.open(`test-${Math.random()}`);
    expect(await autosave.load()).toBeUndefined();

    const first = createEmptyProject('Primo', '2026-01-01T00:00:00.000Z');
    const second = { ...first, meta: { ...first.meta, title: 'Secondo' } };
    const save = vi.spyOn(autosave, 'save');
    autosave.schedule(first, 20);
    autosave.schedule(second, 20);
    await wait(80);
    expect(save).toHaveBeenCalledTimes(1);

    const loaded = await autosave.load();
    expect(loaded?.ok && loaded.value.meta.title).toBe('Secondo');
    autosave.close();
  });

  it('flushes a pending save immediately', async () => {
    const autosave = await ProjectAutosave.open(`test-${Math.random()}`);
    autosave.schedule(createEmptyProject('Subito'), 60_000);
    await autosave.flush();
    const loaded = await autosave.load();
    expect(loaded?.ok && loaded.value.meta.title).toBe('Subito');
    autosave.close();
  });
});

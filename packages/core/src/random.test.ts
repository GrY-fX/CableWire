import { describe, expect, it } from 'vitest';
import type { Command } from './command.ts';
import type { ElementId, SheetId, WireId } from './ids.ts';
import { isJunctionEnd } from './model.ts';
import type { ProjectDoc, WireEnd } from './model.ts';
import { mirrorElements, moveItems, placeElement, rotateElements } from './commands/elements.ts';
import { removeItems } from './commands/remove.ts';
import { addSheet, removeSheet } from './commands/sheets.ts';
import { addWire, setWireProps, splitWire } from './commands/wires.ts';
import { endPosition } from './geometry.ts';
import { validate } from './validate.ts';
import { CONTACT, T1, T2, TERMINAL, setup } from './test-utils.ts';

/** Small deterministic PRNG (mulberry32), so failures are reproducible from the seed. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Step = [Command<never>, unknown];

function randomStep(doc: ProjectDoc, random: () => number): Step | undefined {
  const pick = <T>(items: T[]): T | undefined => items[Math.floor(random() * items.length)];
  const elements = Object.keys(doc.elements) as ElementId[];
  const wires = Object.keys(doc.wires) as WireId[];
  const sheet = pick(doc.sheetOrder)!;
  const grid = () => Math.round(random() * 40) * 2.5;
  const endOn = (sheetId: SheetId): WireEnd | undefined => {
    const onSheet = elements.filter((e) => doc.elements[e]!.sheetId === sheetId);
    const ends: WireEnd[] = [
      ...onSheet.map((element) => ({ element, terminal: random() < 0.5 ? T1 : T2 })),
      ...Object.values(doc.junctions)
        .filter((j) => j.sheetId === sheetId)
        .map((j) => ({ junction: j.id })),
    ];
    return pick(ends);
  };

  const step = <A>(command: Command<A>, args: A): Step => [command as Command<never>, args];
  switch (Math.floor(random() * 10)) {
    case 0:
    case 1:
      return step(placeElement, {
        sheetId: sheet,
        symbolId: random() < 0.7 ? CONTACT.id : TERMINAL.id,
        x: grid(),
        y: grid(),
      });
    case 2:
    case 3: {
      const from = endOn(sheet);
      const to = endOn(sheet);
      return from && to ? step(addWire, { from, to }) : undefined;
    }
    case 4: {
      const id = pick(wires);
      if (!id) return undefined;
      const wire = doc.wires[id]!;
      const a = endPosition(doc, wire.from);
      const b = endPosition(doc, wire.to);
      return a && b
        ? step(splitWire, { id, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } })
        : undefined;
    }
    case 5:
      return step(moveItems, { elements: elements.filter(() => random() < 0.3), dx: 2.5, dy: -5 });
    case 6:
      return elements.length
        ? step(random() < 0.5 ? rotateElements : mirrorElements, {
            ids: elements.filter(() => random() < 0.3),
            by: 90,
          } as never)
        : undefined;
    case 7: {
      const id = pick(wires);
      return id
        ? step(setWireProps, { id, set: { number: String(Math.floor(random() * 100)) } })
        : undefined;
    }
    case 8:
      return step(removeItems, {
        elements: elements.filter(() => random() < 0.1),
        wires: wires.filter(() => random() < 0.1),
      });
    case 9:
      return random() < 0.7 ? step(addSheet, {}) : step(removeSheet, { id: sheet });
  }
  return undefined;
}

describe('random command sequences', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`keeps the document valid and fully undoable (seed ${seed})`, () => {
      const random = rng(seed);
      const { store } = setup({ maxHistory: 1000 }); // also validates after every change
      const initial = store.doc;
      let applied = 0;
      for (let i = 0; i < 300; i++) {
        const step = randomStep(store.doc, random);
        if (!step) continue;
        const before = store.doc;
        const result = store.run(step[0], step[1] as never);
        if (result.ok && store.doc !== before) applied++;
      }
      expect(applied).toBeGreaterThan(100);
      expect(validate(store.doc)).toEqual([]);
      for (const wire of Object.values(store.doc.wires)) {
        for (const end of [wire.from, wire.to]) {
          if (isJunctionEnd(end)) expect(store.doc.junctions[end.junction]).toBeDefined();
        }
      }

      const final = store.doc;
      while (store.undoLabel !== 'Importa simbolo') store.undo();
      expect(store.doc).toEqual(initial);
      while (store.redo());
      expect(store.doc).toEqual(final);
    });
  }
});

import { defineCommand, ok } from '../command.ts';
import type { ElementId, JunctionId, WireId } from '../ids.ts';
import type { ProjectDoc } from '../model.ts';
import { isJunctionEnd } from '../model.ts';
import type { Op } from '../ops.ts';
import { del, patch } from '../ops.ts';

export interface RemoveArgs {
  elements?: readonly ElementId[];
  wires?: readonly WireId[];
  junctions?: readonly JunctionId[];
}

/**
 * Ops that delete the given items plus everything that would be left dangling:
 * wires attached to removed elements/junctions, junctions left without wires,
 * links pointing to removed elements.
 */
export function removeOps(doc: ProjectDoc, args: RemoveArgs): Op[] {
  const elements = new Set(args.elements?.filter((id) => doc.elements[id]));
  const junctions = new Set(args.junctions?.filter((id) => doc.junctions[id]));
  const wires = new Set(args.wires?.filter((id) => doc.wires[id]));

  const removedEnd = (end: (typeof doc.wires)[WireId]['from']) =>
    isJunctionEnd(end) ? junctions.has(end.junction) : elements.has(end.element);
  for (const wire of Object.values(doc.wires)) {
    if (removedEnd(wire.from) || removedEnd(wire.to)) wires.add(wire.id);
  }

  const remainingWiresAt = new Map<JunctionId, number>();
  for (const wire of Object.values(doc.wires)) {
    if (wires.has(wire.id)) continue;
    for (const end of [wire.from, wire.to]) {
      if (isJunctionEnd(end)) {
        remainingWiresAt.set(end.junction, (remainingWiresAt.get(end.junction) ?? 0) + 1);
      }
    }
  }
  for (const id of Object.keys(doc.junctions) as JunctionId[]) {
    if (!remainingWiresAt.has(id)) junctions.add(id);
  }

  const ops: Op[] = [];
  for (const element of Object.values(doc.elements)) {
    if (!elements.has(element.id) && element.link && elements.has(element.link)) {
      ops.push(patch('elements', element.id, { link: undefined }));
    }
  }
  for (const id of wires) ops.push(del('wires', id));
  for (const id of junctions) ops.push(del('junctions', id));
  for (const id of elements) ops.push(del('elements', id));
  return ops;
}

export const removeItems = defineCommand<RemoveArgs>('Elimina', (doc, args) =>
  ok(removeOps(doc, args)),
);

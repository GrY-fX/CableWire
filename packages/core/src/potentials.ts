import type { ElementId, TerminalId, WireId } from './ids.ts';
import type { ProjectDoc, WireEnd } from './model.ts';
import { isJunctionEnd } from './model.ts';

/** Graph node: `e:<elementId>:<terminalId>` for a terminal, `j:<junctionId>` for a junction. */
export type NodeKey = string;
/** Index of a potential; valid only for the document it was computed from. */
export type PotentialId = number;

export function nodeKey(end: WireEnd): NodeKey {
  return isJunctionEnd(end) ? `j:${end.junction}` : terminalKey(end.element, end.terminal);
}

export function terminalKey(element: ElementId, terminal: TerminalId): NodeKey {
  return `e:${element}:${terminal}`;
}

export interface Potentials {
  readonly count: number;
  potentialOf(node: NodeKey): PotentialId | undefined;
  potentialOfWire(wire: WireId): PotentialId | undefined;
  nodes(potential: PotentialId): readonly NodeKey[];
  wires(potential: PotentialId): readonly WireId[];
}

const cache = new WeakMap<ProjectDoc, Potentials>();

/** Potentials of the whole project; memoized per document version. */
export function getPotentials(doc: ProjectDoc): Potentials {
  let result = cache.get(doc);
  if (!result) {
    result = computePotentials(doc);
    cache.set(doc, result);
  }
  return result;
}

function computePotentials(doc: ProjectDoc): Potentials {
  const index = new Map<NodeKey, number>();
  const keys: NodeKey[] = [];
  const parent: number[] = [];

  const add = (key: NodeKey): number => {
    let i = index.get(key);
    if (i === undefined) {
      i = keys.length;
      index.set(key, i);
      keys.push(key);
      parent.push(i);
    }
    return i;
  };
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (const element of Object.values(doc.elements)) {
    const symbol = doc.symbols[element.symbolId];
    if (!symbol) continue;
    for (const t of symbol.terminals) add(terminalKey(element.id, t.id));
    for (const [a, b] of symbol.bridges) {
      union(add(terminalKey(element.id, a)), add(terminalKey(element.id, b)));
    }
  }
  for (const id of Object.keys(doc.junctions)) add(`j:${id}`);
  const wireIds = Object.keys(doc.wires) as WireId[];
  for (const id of wireIds) {
    const wire = doc.wires[id]!;
    union(add(nodeKey(wire.from)), add(nodeKey(wire.to)));
  }

  // Number potentials in order of their first node, so ids are deterministic.
  const potentialOfRoot = new Map<number, PotentialId>();
  const nodeLists: NodeKey[][] = [];
  const potentialOfNode = new Map<NodeKey, PotentialId>();
  keys.forEach((key, i) => {
    const root = find(i);
    let p = potentialOfRoot.get(root);
    if (p === undefined) {
      p = nodeLists.length;
      potentialOfRoot.set(root, p);
      nodeLists.push([]);
    }
    nodeLists[p]!.push(key);
    potentialOfNode.set(key, p);
  });

  const wireLists: WireId[][] = nodeLists.map(() => []);
  const potentialOfWire = new Map<WireId, PotentialId>();
  for (const id of wireIds) {
    const p = potentialOfNode.get(nodeKey(doc.wires[id]!.from))!;
    wireLists[p]!.push(id);
    potentialOfWire.set(id, p);
  }

  return {
    count: nodeLists.length,
    potentialOf: (node) => potentialOfNode.get(node),
    potentialOfWire: (wire) => potentialOfWire.get(wire),
    nodes: (p) => nodeLists[p] ?? [],
    wires: (p) => wireLists[p] ?? [],
  };
}

import {
  cableMarkLayout,
  cableSheet,
  defaultConductorCodes,
  getCablePattern,
  nextCableLabel,
  nextConductorCode,
  PE_CODE,
  spareConductor,
  wirePoints,
} from '../cables.ts';
import { parsePattern } from '../autonumber/rule.ts';
import { defineCommand, fail, ok } from '../command.ts';
import type { CableId, SheetId, WireId } from '../ids.ts';
import { newId } from '../ids.ts';
import type { Cable, Conductor, ProjectDoc } from '../model.ts';
import type { Op, Patch } from '../ops.ts';
import { del, patch, put } from '../ops.ts';
import { columnAt } from '../sheet.ts';

/** Ops taking wires out of the cables they are in (their conductors become spare). */
function releaseOps(doc: ProjectDoc, wires: ReadonlySet<WireId>, except?: CableId): Op[] {
  const ops: Op[] = [];
  for (const cable of Object.values(doc.cables)) {
    if (cable.id === except || !cable.conductors.some((c) => c.wire && wires.has(c.wire))) continue;
    const conductors = cable.conductors.map((c) =>
      c.wire && wires.has(c.wire) ? spareConductor(c) : c,
    );
    ops.push(patch('cables', cable.id, { conductors }));
  }
  return ops;
}

/** Wires in reading order across the cable: left to right, else top to bottom. */
function sortAcross(doc: ProjectDoc, ids: WireId[]): WireId[] {
  const key = (id: WireId) => {
    const pts = doc.wires[id] && wirePoints(doc, doc.wires[id]);
    if (!pts) return [0, 0];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return [Math.min(...xs) + Math.max(...xs), Math.min(...ys) + Math.max(...ys)];
  };
  return [...ids].sort((a, b) => {
    const [ax, ay] = key(a);
    const [bx, by] = key(b);
    return ax! - bx! || ay! - by!;
  });
}

const isPe = (doc: ProjectDoc, id: WireId) => doc.wires[id]?.props.color?.toUpperCase() === PE_CODE;

/**
 * A new cable with the given wires, each in a conductor of the standard colour
 * sequence (the protective wire, coloured GNYE, in the green-yellow conductor).
 * Wires already in another cable leave it.
 */
export const createCable = defineCommand<{
  id?: CableId;
  wires: readonly WireId[];
  label?: string;
}>('Raggruppa in cavo', (doc, { id = newId<'cable'>() as CableId, wires, label }) => {
  const ids = [...new Set(wires)].filter((w) => doc.wires[w]);
  if (ids.length === 0) return fail('empty', 'Select the wires of the cable');
  if (doc.cables[id]) return fail('exists', 'A cable with this id already exists');
  const ordered = sortAcross(doc, ids);
  const pe = ordered.filter((w) => isPe(doc, w));
  const others = ordered.filter((w) => !isPe(doc, w));
  const withPe = pe.length > 0;
  const { codes, numbered } = defaultConductorCodes(ordered.length, withPe);
  const peCodes = codes.filter((c) => c === PE_CODE);
  const plain = codes.filter((c) => c !== PE_CODE);
  // A second protective wire takes an ordinary code.
  const queue = [...others, ...pe.slice(peCodes.length)];
  const conductors: Conductor[] = [
    ...queue.map((wire, i) => ({ id: newId(), code: plain[i] ?? String(i + 1), wire })),
    ...pe.slice(0, peCodes.length).map((wire) => ({ id: newId(), code: PE_CODE, wire })),
  ];
  const sheet = doc.wires[ordered[0]!]!.sheetId;
  const cable: Cable = {
    id,
    label: label?.trim() || nextCableLabel(doc, sheet),
    conductors,
    marks: {},
    ...(numbered && { numbered: true }),
  };
  return ok([...releaseOps(doc, new Set(ids)), put('cables', cable)]);
});

/** Sets cable fields (label, type, section, length, numbered); undefined removes them. */
export const updateCable = defineCommand<{
  id: CableId;
  set: Patch<Pick<Cable, 'label' | 'type' | 'section' | 'length' | 'numbered'>>;
}>('Modifica cavo', (doc, { id, set }) => {
  if (!doc.cables[id]) return fail('not-found', 'Cable not found');
  if (set.label !== undefined && !set.label.trim())
    return fail('invalid', 'Il cavo deve avere una sigla');
  return ok([patch('cables', id, set)]);
});

/** Changes the code of a conductor, or the wire in it (`null` makes it spare). */
export const setConductor = defineCommand<{
  cable: CableId;
  conductor: string;
  code?: string;
  wire?: WireId | null;
}>('Conduttore', (doc, { cable: cableId, conductor, code, wire }) => {
  const cable = doc.cables[cableId];
  const target = cable?.conductors.find((c) => c.id === conductor);
  if (!cable || !target) return fail('not-found', 'Conductor not found');
  if (wire && !doc.wires[wire]) return fail('not-found', 'Wire not found');
  const ops: Op[] = [];
  let conductors = cable.conductors;
  if (wire) {
    ops.push(...releaseOps(doc, new Set([wire]), cable.id));
    conductors = conductors.map((c) => (c.wire === wire ? spareConductor(c) : c));
  }
  conductors = conductors.map((c) => {
    if (c.id !== conductor) return c;
    let next: Conductor = code !== undefined ? { ...c, code: code.trim() } : c;
    if (wire === null) next = spareConductor(next);
    else if (wire) next = { ...next, wire };
    return next;
  });
  return ok([...ops, patch('cables', cable.id, { conductors })]);
});

/** Puts wires in a cable: spare conductors first, then new ones. */
export const addWiresToCable = defineCommand<{ cable: CableId; wires: readonly WireId[] }>(
  'Aggiungi al cavo',
  (doc, { cable: cableId, wires }) => {
    const cable = doc.cables[cableId];
    if (!cable) return fail('not-found', 'Cable not found');
    const inCable = new Set(cable.conductors.flatMap((c) => c.wire ?? []));
    const ids = sortAcross(
      doc,
      [...new Set(wires)].filter((w) => doc.wires[w] && !inCable.has(w)),
    );
    if (ids.length === 0) return ok([]);
    const conductors = cable.conductors.map((c) => ({ ...c }));
    for (const wire of ids) {
      const pe = isPe(doc, wire);
      const spare =
        conductors.find((c) => !c.wire && (c.code === PE_CODE) === pe) ??
        conductors.find((c) => !c.wire);
      if (spare) spare.wire = wire;
      else {
        const code =
          pe && !conductors.some((c) => c.code === PE_CODE)
            ? PE_CODE
            : nextConductorCode({ ...cable, conductors });
        conductors.push({ id: newId(), code, wire });
      }
    }
    return ok([
      ...releaseOps(doc, new Set(ids), cable.id),
      patch('cables', cable.id, { conductors }),
    ]);
  },
);

/** Adds a spare conductor (next number or colour). */
export const addConductor = defineCommand<{ cable: CableId; code?: string }>(
  'Aggiungi conduttore',
  (doc, { cable: cableId, code }) => {
    const cable = doc.cables[cableId];
    if (!cable) return fail('not-found', 'Cable not found');
    const conductor: Conductor = { id: newId(), code: code?.trim() || nextConductorCode(cable) };
    return ok([patch('cables', cable.id, { conductors: [...cable.conductors, conductor] })]);
  },
);

/** Removes a conductor; its wire leaves the cable. */
export const removeConductor = defineCommand<{ cable: CableId; conductor: string }>(
  'Togli conduttore',
  (doc, { cable: cableId, conductor }) => {
    const cable = doc.cables[cableId];
    if (!cable) return fail('not-found', 'Cable not found');
    return ok([
      patch('cables', cable.id, { conductors: cable.conductors.filter((c) => c.id !== conductor) }),
    ]);
  },
);

/** Takes a wire out of its cable, keeping the conductor as a spare. */
export const releaseWire = defineCommand<{ wire: WireId }>('Togli dal cavo', (doc, { wire }) =>
  ok(releaseOps(doc, new Set([wire]))),
);

/** Moves the mark of a cable on a sheet along its wires. */
export const moveCableMark = defineCommand<{ id: CableId; sheetId: SheetId; at: number }>(
  'Sposta segno del cavo',
  (doc, { id, sheetId, at }) => {
    const cable = doc.cables[id];
    if (!cable) return fail('not-found', 'Cable not found');
    return ok([patch('cables', id, { marks: { ...cable.marks, [sheetId]: { at } } })]);
  },
);

/** Deletes cables; their wires stay. */
export const removeCables = defineCommand<{ ids: readonly CableId[] }>(
  'Elimina cavo',
  (doc, { ids }) => ok(ids.filter((id) => doc.cables[id]).map((id) => del('cables', id))),
);

/**
 * Ops renumbering the cable labels that still follow the pattern, in reading order:
 * sheet, column and height of the mark. Labels written by hand stay.
 */
export function renumberCablesOps(doc: ProjectDoc): Op[] {
  const parsed = parsePattern(getCablePattern(doc));
  if (!parsed.ok) return [];
  const re = new RegExp(
    `^${parsed.tokens
      .map((t) => (t.kind === 'text' ? t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\\d+'))
      .join('')}$`,
  );
  const place = (cable: Cable) => {
    const sheet = cableSheet(doc, cable);
    const layout = sheet && cableMarkLayout(doc, cable, sheet);
    const at = layout ? { x: layout.crossings[0]!.x, y: layout.crossings[0]!.y } : { x: 0, y: 0 };
    const s = sheet && doc.sheets[sheet];
    return {
      sheet: sheet ? doc.sheetOrder.indexOf(sheet) : Infinity,
      column: s ? columnAt(s, at) : 0,
      ...at,
    };
  };
  const cables = Object.values(doc.cables)
    .filter((c) => re.test(c.label) && cableSheet(doc, c))
    .map((c) => ({ c, p: place(c) }))
    .sort(
      (a, b) => a.p.sheet - b.p.sheet || a.p.column - b.p.column || a.p.y - b.p.y || a.p.x - b.p.x,
    );
  // Start from a document without these labels, so numbers are free again.
  let draft: ProjectDoc = { ...doc, cables: { ...doc.cables } };
  for (const { c } of cables) draft.cables[c.id] = { ...c, label: '' };
  const ops: Op[] = [];
  for (const { c } of cables) {
    const label = nextCableLabel(draft, cableSheet(doc, c)!);
    draft = { ...draft, cables: { ...draft.cables, [c.id]: { ...c, label } } };
    if (label !== c.label) ops.push(patch('cables', c.id, { label }));
  }
  return ops;
}

export const renumberCables = defineCommand<Record<string, never>>('Ricalcola sigle cavi', (doc) =>
  ok(renumberCablesOps(doc)),
);

import {
  cableFormation,
  cableMarkLayout,
  cableOfWire,
  cableSheet,
  cableSheets,
  wirePoints,
} from './cables.ts';
import { endPosition } from './geometry.ts';
import type { ElementId, SheetId, TerminalId } from './ids.ts';
import { contactType, slaveLabel, slavesOf } from './masters.ts';
import type {
  ContactType,
  DeviceField,
  Element,
  Point,
  ProjectDoc,
  Wire,
  WireEnd,
} from './model.ts';
import { isJunctionEnd } from './model.ts';
import { columnAt } from './sheet.ts';
import { getStrips, stripName, terminalLabel, terminalsOf } from './strips.ts';

// Lists of a project for printing (wires, devices, cables, terminal strips), as plain
// tables computed from the schematic. The renderer lays them out on pages.

export type ListKind = 'wires' | 'devices' | 'cables' | 'strips';

export const LIST_NAMES: Record<ListKind, string> = {
  wires: 'Lista fili',
  devices: 'Lista dispositivi',
  cables: 'Lista cavi',
  strips: 'Morsettiere',
};

/** Standard fields of a device, in the panel and in the device list. */
export const DEVICE_INFO_FIELDS: readonly { key: string; label: string }[] = [
  { key: 'label', label: 'Sigla' },
  { key: 'function', label: 'Funzione' },
  { key: 'location', label: 'Posizione (+)' },
  { key: 'costruttore', label: 'Costruttore' },
  { key: 'codice_prodotto', label: 'Codice prodotto' },
  { key: 'plc_address', label: 'Indirizzo PLC' },
];

export function getDeviceFields(doc: ProjectDoc): DeviceField[] {
  return doc.settings.deviceFields ?? [];
}

/** A key for a new project property from its name: lowercase, unique, not a standard one. */
export function deviceFieldKey(doc: ProjectDoc, label: string): string {
  const base =
    label
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'campo';
  const taken = new Set([
    ...DEVICE_INFO_FIELDS.map((f) => f.key),
    ...getDeviceFields(doc).map((f) => f.key),
  ]);
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
}

export interface ListTable {
  kind: ListKind;
  title: string;
  columns: string[];
  rows: string[][];
}

const natural = (a: string, b: string) =>
  a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' });

/** Label of an element as shown on the sheet (terminals and contacts computed). */
export function shownLabel(doc: ProjectDoc, element: Element): string {
  const symbol = doc.symbols[element.symbolId];
  if (symbol?.kind === 'terminal') return terminalLabel(doc, element);
  if (symbol?.kind === 'slave') return slaveLabel(doc, element);
  return element.info['label'] ?? '';
}

/** "sheet.column" of a point, e.g. 2.4. */
export function sheetColumn(doc: ProjectDoc, sheetId: SheetId, p: Point): string {
  const sheet = doc.sheets[sheetId];
  return `${doc.sheetOrder.indexOf(sheetId) + 1}.${sheet ? columnAt(sheet, p) : 1}`;
}

/** What is at a wire's end: `label:terminal` of a device, or the junction's place. */
export function endLabel(doc: ProjectDoc, end: WireEnd): string {
  if (isJunctionEnd(end)) {
    const j = doc.junctions[end.junction];
    return j ? `giunzione ${sheetColumn(doc, j.sheetId, j)}` : '';
  }
  const element = doc.elements[end.element];
  const symbol = element && doc.symbols[element.symbolId];
  if (!element || !symbol) return '';
  const terminal = symbol.terminals.find((t) => t.id === end.terminal)?.name ?? '';
  const label = shownLabel(doc, element) || symbol.name;
  // A terminal's label already says where it is (X1:3).
  return symbol.kind === 'terminal' || !terminal ? label : `${label}:${terminal}`;
}

const cableText = (doc: ProjectDoc, wire: Wire) => {
  const c = cableOfWire(doc, wire.id);
  return c ? `${c.cable.label} / ${c.conductor.code}` : '';
};

function wireList(doc: ProjectDoc): ListTable {
  const rows = Object.values(doc.wires)
    .map((w) => {
      const pts = wirePoints(doc, w);
      const where = pts ? sheetColumn(doc, w.sheetId, pts[0]!) : '';
      const conductor = cableOfWire(doc, w.id)?.conductor.code;
      return {
        sort: [
          w.props.number ?? '',
          String(doc.sheetOrder.indexOf(w.sheetId)).padStart(4, '0'),
          where,
        ],
        row: [
          w.props.number ?? '',
          endLabel(doc, w.from),
          endLabel(doc, w.to),
          conductor ?? w.props.color ?? '',
          w.props.section ?? '',
          cableText(doc, w),
          where,
        ],
      };
    })
    .sort((a, b) => {
      // Numbered wires first, by number; then by sheet and place.
      const [na, sa, pa] = a.sort as [string, string, string];
      const [nb, sb, pb] = b.sort as [string, string, string];
      return (!na ? 1 : 0) - (!nb ? 1 : 0) || natural(na, nb) || natural(sa, sb) || natural(pa, pb);
    });
  return {
    kind: 'wires',
    title: LIST_NAMES.wires,
    columns: ['Numero', 'Da', 'A', 'Colore', 'Sezione', 'Cavo', 'Foglio'],
    rows: rows.map((r) => r.row),
  };
}

const CONTACT_NAMES: Record<ContactType, string> = {
  no: 'NA',
  nc: 'NC',
  changeover: 'scambio',
  power: 'potenza',
};

function deviceList(doc: ProjectDoc): ListTable {
  const extra = getDeviceFields(doc).filter((f) => f.inTables);
  const rows = Object.values(doc.elements)
    .filter((e) => {
      const s = doc.symbols[e.symbolId];
      return s && ['simple', 'master', 'plc'].includes(s.kind) && s.category !== 'Alimentazioni';
    })
    .map((e) => {
      const symbol = doc.symbols[e.symbolId]!;
      const counts = new Map<string, number>();
      for (const slave of slavesOf(doc, e)) {
        const type = contactType(doc, slave);
        if (type) counts.set(CONTACT_NAMES[type], (counts.get(CONTACT_NAMES[type]) ?? 0) + 1);
      }
      const contacts = [...counts].map(([name, n]) => `${n} ${name}`).join(', ');
      const info = (key: string) => e.info[key] ?? '';
      return [
        info('label'),
        symbol.name,
        info('function'),
        info('location'),
        info('costruttore'),
        info('codice_prodotto'),
        ...extra.map((f) => info(f.key)),
        sheetColumn(doc, e.sheetId, e),
        contacts,
      ];
    })
    .sort(
      (a, b) =>
        (!a[0] ? 1 : 0) - (!b[0] ? 1 : 0) || natural(a[0]!, b[0]!) || natural(a.at(-2)!, b.at(-2)!),
    );
  return {
    kind: 'devices',
    title: LIST_NAMES.devices,
    columns: [
      'Sigla',
      'Descrizione',
      'Funzione',
      'Posizione',
      'Costruttore',
      'Codice prodotto',
      ...extra.map((f) => f.label),
      'Foglio',
      'Contatti',
    ],
    rows,
  };
}

/** Devices at the two sides of a cable: before and after its mark along the wires. */
function cableEnds(doc: ProjectDoc, cableId: string): [string, string] {
  const cable = doc.cables[cableId as never];
  const from = new Set<string>();
  const to = new Set<string>();
  if (!cable) return ['', ''];
  const sheet = cableSheet(doc, cable);
  const axis = (sheet && cableMarkLayout(doc, cable, sheet)?.axis) ?? 'y';
  for (const c of cable.conductors) {
    const wire = c.wire && doc.wires[c.wire];
    const a = wire && endPosition(doc, wire.from);
    const b = wire && endPosition(doc, wire.to);
    if (!wire || !a || !b) continue;
    const aFirst = axis === 'y' ? a.y <= b.y : a.x <= b.x;
    const [first, second] = aFirst ? [wire.from, wire.to] : [wire.to, wire.from];
    const device = (end: WireEnd) => {
      if (isJunctionEnd(end)) return '';
      const element = doc.elements[end.element];
      return element ? shownLabel(doc, element) : '';
    };
    const d1 = device(first);
    const d2 = device(second);
    if (d1) from.add(d1);
    if (d2) to.add(d2);
  }
  const join = (s: Set<string>) => [...s].sort(natural).join(', ');
  return [join(from), join(to)];
}

function cableList(doc: ProjectDoc): ListTable {
  const rows = Object.values(doc.cables)
    .map((c) => {
      const [from, to] = cableEnds(doc, c.id);
      const sheets = cableSheets(doc, c).map((s) => doc.sheetOrder.indexOf(s) + 1);
      return [
        c.label,
        c.type ?? '',
        cableFormation(c),
        c.length !== undefined ? `${String(c.length).replace('.', ',')} m` : '',
        from,
        to,
        sheets.join(', '),
      ];
    })
    .sort((a, b) => natural(a[0]!, b[0]!));
  return {
    kind: 'cables',
    title: LIST_NAMES.cables,
    columns: ['Sigla', 'Tipo', 'Formazione', 'Lunghezza', 'Da', 'A', 'Fogli'],
    rows,
  };
}

/** One table per terminal strip: each terminal with what is wired above and below it. */
function stripLists(doc: ProjectDoc): ListTable[] {
  return getStrips(doc).flatMap((strip) => {
    const terminals = [...terminalsOf(doc, strip.id)].sort((a, b) =>
      natural(a.terminalNo ?? '', b.terminalNo ?? ''),
    );
    if (terminals.length === 0) return [];
    const rows = terminals.map((t) => {
      const symbol = doc.symbols[t.symbolId];
      // Its terminals from top to bottom, as placed on the sheet.
      const sides = (symbol?.terminals ?? [])
        .map((term) => ({
          id: term.id,
          at: endPosition(doc, { element: t.id, terminal: term.id }),
        }))
        .sort((a, b) => (a.at?.y ?? 0) - (b.at?.y ?? 0));
      const wiresAt = (terminal: TerminalId) =>
        Object.values(doc.wires).filter((w) =>
          [w.from, w.to].some(
            (e) => !isJunctionEnd(e) && e.element === t.id && e.terminal === terminal,
          ),
        );
      const farEnd = (w: Wire) => {
        const near = (e: WireEnd) => !isJunctionEnd(e) && e.element === (t.id as ElementId);
        return endLabel(doc, near(w.from) ? w.to : w.from);
      };
      const top = sides[0] ? wiresAt(sides[0].id) : [];
      const bottom = sides.length > 1 ? wiresAt(sides.at(-1)!.id) : [];
      const number = [...top, ...bottom].find((w) => w.props.number)?.props.number ?? '';
      return [
        terminalLabel(doc, t),
        number,
        top.map(farEnd).join(', '),
        bottom.map(farEnd).join(', '),
        bottom
          .map((w) => cableText(doc, w))
          .filter(Boolean)
          .join(', '),
      ];
    });
    return [
      {
        kind: 'strips' as const,
        title: `Morsettiera ${stripName(doc, strip)}`,
        columns: ['Morsetto', 'Filo', 'Interno (sopra)', 'Esterno (sotto)', 'Cavo'],
        rows,
      },
    ];
  });
}

/** The chosen lists, in the order wires, devices, cables, strips. */
export function projectLists(doc: ProjectDoc, kinds: readonly ListKind[]): ListTable[] {
  const out: ListTable[] = [];
  if (kinds.includes('wires')) out.push(wireList(doc));
  if (kinds.includes('devices')) out.push(deviceList(doc));
  if (kinds.includes('cables')) out.push(cableList(doc));
  if (kinds.includes('strips')) out.push(...stripLists(doc));
  return out;
}

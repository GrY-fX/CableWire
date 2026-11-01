import { defineCommand, fail, ok } from './command.ts';
import type { SymbolId } from './ids.ts';
import type { ProjectDoc, Sheet, SymbolDef } from './model.ts';
import { meta, put } from './ops.ts';
import { sheetLayout } from './sheet.ts';

// Title blocks: drawings with placeholders ({titolo}, {cliente}, {foglio}…), kept as
// symbols of kind `titleblock`. The project picks one (a copy in its symbols, like any
// symbol); without a choice the simple one below is used, as before title blocks
// became templates.

/** Fields of the project offered in the title block, besides free ones. */
export const TITLE_FIELDS: readonly { key: string; label: string }[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'commessa', label: 'Commessa' },
  { key: 'impianto', label: 'Impianto' },
  { key: 'revisione', label: 'Revisione' },
  { key: 'data_revisione', label: 'Data revisione' },
  { key: 'disegnato', label: 'Disegnato' },
  { key: 'verificato', label: 'Verificato' },
  { key: 'approvato', label: 'Approvato' },
];

/** Placeholders always available, filled from the project and the sheet. */
export const TITLE_PLACEHOLDERS: readonly { key: string; label: string }[] = [
  { key: 'titolo', label: 'Titolo del progetto' },
  { key: 'autore', label: 'Autore' },
  { key: 'data', label: 'Data (ultima modifica)' },
  { key: 'titolo_foglio', label: 'Titolo del foglio' },
  { key: 'foglio', label: 'Numero del foglio' },
  { key: 'fogli', label: 'Numero di fogli' },
];

const text = (x: number, y: number, value: string, size: number) =>
  ({ type: 'text', x, y, text: value, size }) as const;

/** The simple title block (120 × 20 mm in the corner), the default. */
export const SIMPLE_TITLE_BLOCK: SymbolDef = {
  id: 'base-cartiglio-semplice' as SymbolId,
  name: 'Cartiglio semplice',
  category: 'Cartigli',
  kind: 'titleblock',
  titleBlock: { anchor: 'corner', width: 120, height: 20 },
  graphics: [
    { type: 'rect', x: 0, y: 0, width: 120, height: 20 },
    { type: 'line', x1: 0, y1: 10, x2: 120, y2: 10 },
    { type: 'line', x1: 70, y1: 0, x2: 70, y2: 20 },
    { type: 'line', x1: 95, y1: 10, x2: 95, y2: 20 },
    text(2, 5, '{titolo}', 3.5),
    text(72, 5, '{titolo_foglio}', 3.5),
    text(2, 15, '{autore}', 2.5),
    text(72, 15, '{data}', 2.5),
    text(97, 15, 'Foglio {foglio} / {fogli}', 2.5),
  ],
  terminals: [],
  bridges: [],
  defaultInfo: {},
  version: 1,
  author: 'CableWire',
  license: 'CC0-1.0',
};

/** The title block of the project: its chosen one, else the simple one. */
export function getTitleBlock(doc: ProjectDoc): SymbolDef {
  const id = doc.settings.titleBlock;
  const chosen = id === undefined ? undefined : doc.symbols[id];
  return chosen?.kind === 'titleblock' && chosen.titleBlock ? chosen : SIMPLE_TITLE_BLOCK;
}

/** Height kept at the bottom of the frame by the project's title block (bands only). */
export function titleBlockReserve(doc: ProjectDoc): number {
  const layout = getTitleBlock(doc).titleBlock;
  return layout?.anchor === 'band' ? layout.height : 0;
}

/** Values of the placeholders on a sheet: project fields plus the fixed ones. */
export function titleBlockValues(doc: ProjectDoc, sheet: Sheet): Record<string, string> {
  return {
    ...doc.meta.fields,
    titolo: doc.meta.title,
    autore: doc.meta.author,
    data: doc.meta.updatedAt.slice(0, 10),
    titolo_foglio: sheet.title,
    foglio: String(doc.sheetOrder.indexOf(sheet.id) + 1),
    fogli: String(doc.sheetOrder.length),
  };
}

/**
 * Where a title block goes on a sheet: top-left corner and horizontal stretch. A
 * corner block keeps its size in the bottom-right corner of the frame; a band spans
 * the frame's width at the bottom, its drawing stretched across (texts keep their
 * size, see the renderer).
 */
export function titleBlockPlacement(
  sheet: Sheet,
  block: SymbolDef,
): { x: number; y: number; scaleX: number; width: number; height: number } {
  const { frame } = sheetLayout(sheet);
  const { anchor, width, height } = block.titleBlock ?? SIMPLE_TITLE_BLOCK.titleBlock!;
  const y = frame.y + frame.height - height;
  if (anchor === 'band') {
    return { x: frame.x, y, scaleX: frame.width / width, width: frame.width, height };
  }
  return { x: frame.x + frame.width - width, y, scaleX: 1, width, height };
}

/** Uses a title block in the project: its copy is added or replaced, then chosen. */
export const setTitleBlock = defineCommand<{ symbol: SymbolDef }>(
  'Cartiglio del progetto',
  (doc, { symbol }) => {
    if (symbol.kind !== 'titleblock' || !symbol.titleBlock) {
      return fail('invalid', 'Non è un cartiglio.');
    }
    return ok([
      put('symbols', symbol),
      meta({ settings: { ...doc.settings, titleBlock: symbol.id } }),
    ]);
  },
);

/** Sets (or removes, when empty) a field of the project shown in the title block. */
export const setProjectField = defineCommand<{ key: string; value: string }>(
  'Campo del cartiglio',
  (doc, { key, value }) => {
    const name = key.trim();
    if (!/^\w+$/.test(name)) return fail('invalid', 'Nome del campo: lettere, numeri e _.');
    const fields = { ...doc.meta.fields };
    if (value) fields[name] = value;
    else delete fields[name];
    return ok([meta({ meta: { ...doc.meta, fields } })]);
  },
);

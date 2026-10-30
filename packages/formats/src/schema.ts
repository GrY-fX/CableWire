import * as v from 'valibot';
import type {
  ElementId,
  JunctionId,
  ProjectDoc,
  SheetId,
  SymbolDef,
  SymbolId,
  TerminalId,
  WireId,
} from '@cablewire/core';

// Shape checks for files. Unknown properties are stripped (and reported as warnings
// by the parser); referential integrity is checked afterwards by core's validate().

const id = <T extends string>() =>
  v.pipe(
    v.string(),
    v.minLength(1, 'atteso un identificativo non vuoto'),
    v.transform((s) => s as T),
  );
/** A table keyed by id; keys are plain strings in JSON, typed ids in the model. */
const table = <K extends string, S extends v.GenericSchema>(row: S) =>
  v.pipe(
    v.record(v.string(), row),
    v.transform((r) => r as Record<K, v.InferOutput<S>>),
  );
const num = v.pipe(v.number(), v.finite());
const point = v.object({ x: num, y: num });
const strings = v.record(v.string(), v.string());

const primitive = v.variant('type', [
  v.object({ type: v.literal('line'), x1: num, y1: num, x2: num, y2: num }),
  v.object({
    type: v.literal('polyline'),
    points: v.array(point),
    closed: v.boolean(),
    filled: v.exactOptional(v.boolean()),
  }),
  v.object({ type: v.literal('arc'), cx: num, cy: num, r: num, start: num, sweep: num }),
  v.object({
    type: v.literal('circle'),
    cx: num,
    cy: num,
    r: num,
    filled: v.exactOptional(v.boolean()),
  }),
  v.object({
    type: v.literal('rect'),
    x: num,
    y: num,
    width: num,
    height: num,
    filled: v.exactOptional(v.boolean()),
  }),
  v.object({
    type: v.literal('text'),
    x: num,
    y: num,
    text: v.string(),
    size: num,
    anchor: v.exactOptional(v.picklist(['start', 'middle', 'end'])),
  }),
]);

const direction = v.picklist(['n', 'e', 's', 'w']);

export const symbolSchema = v.object({
  id: id<SymbolId>(),
  name: v.string(),
  category: v.string(),
  kind: v.picklist(['simple', 'master', 'slave', 'report', 'terminal', 'plc']),
  graphics: v.array(primitive),
  terminals: v.array(
    v.object({ id: id<TerminalId>(), name: v.string(), x: num, y: num, dir: direction }),
  ),
  bridges: v.array(v.tuple([id<TerminalId>(), id<TerminalId>()])),
  defaultInfo: strings,
  version: v.pipe(v.number(), v.integer()),
  author: v.exactOptional(v.string()),
  license: v.exactOptional(v.string()),
});

const sheet = v.object({
  id: id<SheetId>(),
  title: v.string(),
  size: v.picklist(['A4', 'A3', 'A2', 'A1', 'A0']),
  orientation: v.picklist(['landscape', 'portrait']),
  rows: v.pipe(v.number(), v.integer(), v.minValue(1)),
  cols: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

const element = v.object({
  id: id<ElementId>(),
  sheetId: id<SheetId>(),
  symbolId: id<SymbolId>(),
  x: num,
  y: num,
  rotation: v.picklist([0, 90, 180, 270]),
  mirrored: v.boolean(),
  info: strings,
  link: v.exactOptional(id<ElementId>()),
});

const junction = v.object({ id: id<JunctionId>(), sheetId: id<SheetId>(), x: num, y: num });

const wireEnd = v.union([
  v.object({ element: id<ElementId>(), terminal: id<TerminalId>() }),
  v.object({ junction: id<JunctionId>() }),
]);

const wire = v.object({
  id: id<WireId>(),
  sheetId: id<SheetId>(),
  from: wireEnd,
  to: wireEnd,
  bends: v.array(point),
  props: v.object({
    number: v.exactOptional(v.string()),
    numberLocked: v.exactOptional(v.boolean()),
    section: v.exactOptional(v.string()),
    color: v.exactOptional(v.string()),
  }),
});

export const projectSchema = v.object({
  formatVersion: v.literal(1),
  meta: v.object({
    title: v.string(),
    author: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }),
  settings: v.object({
    gridStep: v.pipe(num, v.minValue(0.1)),
    numbering: v.exactOptional(
      v.object({
        auto: v.boolean(),
        pattern: v.string(),
        start: v.pipe(v.number(), v.integer(), v.minValue(0)),
        sources: v.array(v.picklist(['plc', 'terminal', 'label'])),
      }),
    ),
  }),
  sheetOrder: v.array(id<SheetId>()),
  sheets: table<SheetId, typeof sheet>(sheet),
  symbols: table<SymbolId, typeof symbolSchema>(symbolSchema),
  elements: table<ElementId, typeof element>(element),
  wires: table<WireId, typeof wire>(wire),
  junctions: table<JunctionId, typeof junction>(junction),
});

// Compile-time guarantee that the schemas produce exactly core's types.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const symbolMatches: Same<v.InferOutput<typeof symbolSchema>, SymbolDef> = true;
const projectMatches: Same<v.InferOutput<typeof projectSchema>, ProjectDoc> = true;
void symbolMatches;
void projectMatches;

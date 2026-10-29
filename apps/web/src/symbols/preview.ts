import { symbolBounds } from '@cablewire/core';
import type { Rotation, SymbolDef } from '@cablewire/core';
import { buildElementNode, nodeToSvg, PAPER_CSS } from '@cablewire/render';

/** Sample values, so placeholders show something realistic. */
const SAMPLE = { label: 'K1', function: 'Funzione', location: '+Q1', plc_address: 'I0.0' };

/**
 * Standalone SVG of a symbol as placed in a schematic. The box is the same for every
 * rotation (square around the origin), with `padding` mm of room for texts.
 */
export function symbolPreviewSvg(symbol: SymbolDef, rotation: Rotation = 0, padding = 2): string {
  const info = {
    ...symbol.defaultInfo,
    ...SAMPLE,
    label: symbol.defaultInfo.label || SAMPLE.label,
  };
  const node = buildElementNode({ x: 0, y: 0, rotation, mirrored: false, info }, symbol);
  const b = symbolBounds(symbol) ?? { minX: -5, minY: -5, maxX: 5, maxY: 5 };
  const r =
    Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY)) + padding;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-r} ${-r} ${2 * r} ${2 * r}">` +
    `<style>${PAPER_CSS}</style>${nodeToSvg(node)}</svg>`
  );
}

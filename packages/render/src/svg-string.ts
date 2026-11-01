import type { Scene, SceneNode } from './scene.ts';
import { CLASS_PREFIX, PAPER_CSS, TEXT_BASELINE_SHIFT } from './style.ts';

export interface SvgOptions {
  /** Include on-screen-only nodes (terminal marks). Default false. */
  screen?: boolean;
  /** Extra CSS, e.g. an `@font-face` rule embedding the font for a standalone file. */
  css?: string;
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function classAttr(classes: string[] | undefined, extra?: string): string {
  const all = [...(classes ?? []).map((c) => CLASS_PREFIX + c), ...(extra ? [extra] : [])];
  return all.length ? ` class="${all.join(' ')}"` : '';
}

/** Markup of one node (and its children). */
export function nodeToSvg(node: SceneNode, options: SvgOptions = {}): string {
  switch (node.kind) {
    case 'group': {
      const transform = node.transform ? ` transform="${node.transform}"` : '';
      const children = node.children.map((c) => nodeToSvg(c, options)).join('');
      return `<g${transform}${classAttr(node.classes)}>${children}</g>`;
    }
    case 'path':
      if (node.screenOnly && !options.screen) return '';
      return `<path d="${node.d}"${classAttr(node.classes, node.filled ? `${CLASS_PREFIX}filled` : undefined)}/>`;
    case 'circle':
      return `<circle cx="${node.cx}" cy="${node.cy}" r="${node.r}"${classAttr(node.classes, node.filled ? `${CLASS_PREFIX}filled` : undefined)}/>`;
    case 'text': {
      const rotate = node.angle ? ` transform="rotate(${node.angle} ${node.x} ${node.y})"` : '';
      // Baseline below the middle, inside the rotation: same place on screen and in PDF.
      const baseline = Math.round((node.y + node.size * TEXT_BASELINE_SHIFT) * 1000) / 1000;
      return (
        `<text x="${node.x}" y="${baseline}" font-size="${node.size}" text-anchor="${node.anchor}"` +
        `${rotate}${classAttr(node.classes)}>${escape(node.text)}</text>`
      );
    }
  }
}

/** Standalone SVG at real size (1 user unit = 1 mm), for export and printing. */
export function toSvgString(scene: Scene, options: SvgOptions = {}): string {
  const { width, height } = scene;
  const body = scene.items.map((item) => nodeToSvg(item.node, options)).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">` +
    `<style>${PAPER_CSS}${options.css ?? ''}</style>` +
    `<rect width="${width}" height="${height}" fill="#fff"/>` +
    body +
    `</svg>`
  );
}

import type { ProjectDoc, SheetId } from '@cablewire/core';
import { sheetDimensions } from '@cablewire/core';
import { sheetSvg } from './export.ts';

const ROOT_ID = 'cw-print-root';

export interface PrintPage {
  /** Named CSS page carrying the paper size, e.g. `cw-420x297`. */
  name: string;
  width: number;
  height: number;
  svg: string;
}

/**
 * Print layout: one page per sheet, each with its own size and orientation (named
 * CSS pages), the drawing at real size and without on-screen aids. While printing,
 * everything else on the page is hidden.
 */
export function buildPrintDocument(
  doc: ProjectDoc,
  sheetIds: readonly SheetId[],
  fontCss: string,
): { css: string; pages: PrintPage[] } {
  const pages = sheetIds.flatMap((id): PrintPage[] => {
    const sheet = doc.sheets[id];
    if (!sheet) return [];
    const { width, height } = sheetDimensions(sheet);
    return [{ name: `cw-${width}x${height}`, width, height, svg: sheetSvg(doc, id, fontCss) }];
  });
  const sizes = new Map(pages.map((p) => [p.name, p]));
  const pageRules = [...sizes.values()]
    .map((p) => `@page ${p.name} { size: ${p.width}mm ${p.height}mm; margin: 0; }`)
    .join('\n');
  const css = `
${pageRules}
#${ROOT_ID} { display: none; }
@media print {
  html, body { margin: 0; padding: 0; height: auto; background: #fff; }
  body > *:not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} { display: block; }
  .cw-print-page { break-after: page; overflow: hidden; }
  .cw-print-page:last-child { break-after: auto; }
  .cw-print-page > svg { display: block; width: 100%; height: 100%; }
}`;
  return { css, pages };
}

/** Builds the hidden print container; each SVG is parsed as XML, not as HTML. */
export function printRoot(pages: readonly PrintPage[]): HTMLElement {
  const root = document.createElement('div');
  root.id = ROOT_ID;
  const parser = new DOMParser();
  for (const page of pages) {
    const section = document.createElement('section');
    section.className = 'cw-print-page';
    section.style.setProperty('page', page.name);
    section.style.width = `${page.width}mm`;
    section.style.height = `${page.height}mm`;
    const svg = parser.parseFromString(page.svg, 'image/svg+xml').documentElement;
    section.append(document.importNode(svg, true));
    root.append(section);
  }
  return root;
}

/** Opens the browser's print dialog for the given sheets ("Salva come PDF" included). */
export function printSheets(doc: ProjectDoc, sheetIds: readonly SheetId[], fontCss: string): void {
  const { css, pages } = buildPrintDocument(doc, sheetIds, fontCss);
  const style = document.createElement('style');
  style.textContent = css;
  const root = printRoot(pages);
  document.head.append(style);
  document.body.append(root);
  const cleanup = () => {
    style.remove();
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Let the browser lay out the pages before opening the dialog.
  requestAnimationFrame(() => window.print());
}

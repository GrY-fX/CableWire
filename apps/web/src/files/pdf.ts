import { linkedReport, sheetDimensions } from '@cablewire/core';
import type { ProjectDoc, SheetId } from '@cablewire/core';
import { elementBounds } from '@cablewire/editor';
import { FONT_FAMILY } from '@cablewire/render';
import fontUrl from '@cablewire/render/assets/osifont.woff?url';
import { sheetSvg } from './export.ts';

// PDF export: one vector page per sheet at its own size, a bookmark per sheet, and
// each linked sheet reference a clickable area leading to its partner. The layout
// is computed by pdfPlan() (plain data, tested); jsPDF and svg2pdf are loaded only
// when exporting, so the app itself stays light.

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPage {
  sheetId: SheetId;
  /** Bookmark text, e.g. `2 – Motori`. */
  title: string;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
}

export interface PdfLink {
  /** 1-based page holding the clickable area (millimetres from the top-left corner). */
  page: number;
  rect: PdfRect;
  /** 1-based page and point (millimetres) to show. */
  target: { page: number; x: number; y: number };
}

export interface PdfPlan {
  pages: PdfPage[];
  links: PdfLink[];
}

/** Space added around a reference's drawing for its clickable area. */
const LINK_MARGIN = 1;

/** Pages and links for the given sheets, in the given order. */
export function pdfPlan(doc: ProjectDoc, sheetIds: readonly SheetId[]): PdfPlan {
  const pageOf = new Map(sheetIds.map((id, i) => [id, i + 1]));
  const pages = sheetIds.map((sheetId): PdfPage => {
    const sheet = doc.sheets[sheetId]!;
    const { width, height } = sheetDimensions(sheet);
    const index = doc.sheetOrder.indexOf(sheetId) + 1;
    return {
      sheetId,
      title:
        sheet.title && sheet.title !== String(index)
          ? `${index} – ${sheet.title}`
          : `Foglio ${index}`,
      width,
      height,
      orientation: sheet.orientation,
    };
  });
  const links: PdfLink[] = [];
  for (const element of Object.values(doc.elements)) {
    const page = pageOf.get(element.sheetId);
    const partner = page && linkedReport(doc, element);
    const target = partner && pageOf.get(partner.sheetId);
    const symbol = doc.symbols[element.symbolId];
    if (!page || !partner || !target || !symbol) continue;
    const b = elementBounds(element, symbol);
    links.push({
      page,
      rect: {
        x: b.minX - LINK_MARGIN,
        y: b.minY - LINK_MARGIN,
        width: b.maxX - b.minX + 2 * LINK_MARGIN,
        height: b.maxY - b.minY + 2 * LINK_MARGIN,
      },
      target: { page: target, x: partner.x, y: partner.y },
    });
  }
  links.sort((a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return { pages, links };
}

/**
 * Unpacks a WOFF 1.0 font into the TrueType/OpenType file it wraps (jsPDF only
 * reads the latter). Tables are copied in order, inflated when compressed.
 */
export async function woffToSfnt(woff: ArrayBuffer): Promise<Uint8Array> {
  const src = new DataView(woff);
  if (src.getUint32(0) !== 0x774f4646) throw new Error('Non è un file WOFF');
  const flavor = src.getUint32(4);
  const numTables = src.getUint16(12);
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    const offset = src.getUint32(at + 4);
    const compLength = src.getUint32(at + 8);
    const origLength = src.getUint32(at + 12);
    const raw = new Uint8Array(woff, offset, compLength);
    const data = compLength < origLength ? await inflate(raw) : raw;
    if (data.length !== origLength) throw new Error('Tabella del font non valida');
    tables.push({ tag: src.getUint32(at), checksum: src.getUint32(at + 16), data });
  }

  const pad = (n: number) => (n + 3) & ~3;
  const headerSize = 12 + 16 * numTables;
  const size = tables.reduce((n, t) => n + pad(t.data.length), headerSize);
  const out = new Uint8Array(size);
  const dst = new DataView(out.buffer);
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector++;
  }
  dst.setUint32(0, flavor);
  dst.setUint16(4, numTables);
  dst.setUint16(6, searchRange * 16);
  dst.setUint16(8, entrySelector);
  dst.setUint16(10, numTables * 16 - searchRange * 16);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    dst.setUint32(at, t.tag);
    dst.setUint32(at + 4, t.checksum);
    dst.setUint32(at + 8, offset);
    dst.setUint32(at + 12, t.data.length);
    out.set(t.data, offset);
    offset += pad(t.data.length);
  });
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** The part of jsPDF used for links (kept small so tests can pass a real jsPDF). */
interface LinkTarget {
  setPage(page: number): unknown;
  link(x: number, y: number, w: number, h: number, options: object): void;
}

/** Adds the plan's links to a PDF whose pages are already there. */
export function addLinks(pdf: LinkTarget, plan: PdfPlan): void {
  const points = 72 / 25.4;
  for (const link of plan.links) {
    const target = plan.pages[link.target.page - 1]!;
    pdf.setPage(link.page);
    // FitH: whole page width, scrolled so the partner sits below the top edge.
    // jsPDF writes `top` as is, in PDF points from the bottom of the target page.
    const top = Math.max(0, link.target.y - 30);
    pdf.link(link.rect.x, link.rect.y, link.rect.width, link.rect.height, {
      pageNumber: link.target.page,
      magFactor: 'FitH',
      top: Math.round((target.height - top) * points),
    });
  }
}

let fontCache: Promise<string> | undefined;

/** osifont as base64 TrueType, ready for jsPDF's virtual file system. */
function fontBase64(): Promise<string> {
  fontCache ??= (async () => {
    const woff = await (await fetch(fontUrl)).arrayBuffer();
    return toBase64(await woffToSfnt(woff));
  })();
  return fontCache;
}

/** Builds the PDF of the given sheets, with links between linked references. */
export async function buildPdf(doc: ProjectDoc, sheetIds: readonly SheetId[]): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }, font] = await Promise.all([
    import('jspdf'),
    import('svg2pdf.js'),
    fontBase64(),
  ]);
  const plan = pdfPlan(doc, sheetIds);
  const first = plan.pages[0];
  if (!first) throw new Error('Nessun foglio da esportare');
  const pdf = new jsPDF({
    unit: 'mm',
    format: [first.width, first.height],
    orientation: first.orientation,
    compress: true,
  });
  pdf.setProperties({ title: doc.meta.title, author: doc.meta.author, creator: 'CableWire' });
  pdf.addFileToVFS('osifont.ttf', font);
  pdf.addFont('osifont.ttf', FONT_FAMILY, 'normal');

  // svg2pdf reads styles from the live DOM: each sheet is mounted off screen meanwhile.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden';
  document.body.append(host);
  try {
    for (const [i, page] of plan.pages.entries()) {
      if (i > 0) pdf.addPage([page.width, page.height], page.orientation);
      const parsed = new DOMParser().parseFromString(
        sheetSvg(doc, page.sheetId, ''),
        'image/svg+xml',
      );
      const svg = document.importNode(parsed.documentElement, true);
      host.replaceChildren(svg);
      await svg2pdf(svg, pdf, { x: 0, y: 0, width: page.width, height: page.height });
      pdf.outline.add(null, page.title, { pageNumber: i + 1 });
    }
  } finally {
    host.remove();
  }

  addLinks(pdf, plan);
  return pdf.output('blob');
}

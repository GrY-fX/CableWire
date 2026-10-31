import type { ProjectDoc, Sheet, SheetId } from '@cablewire/core';
import { sheetDimensions } from '@cablewire/core';
import { buildScene, FONT_FAMILY, toSvgString } from '@cablewire/render';
import fontUrl from '@cablewire/render/assets/osifont.woff?url';

/** A file name from free text: accents removed, spaces to dashes, no odd characters. */
export function safeFileName(text: string, extension: string, fallback = 'progetto'): string {
  const base = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || fallback}${extension}`;
}

let fontCssCache: Promise<string> | undefined;

/** `@font-face` rule embedding osifont, so exported files look the same everywhere. */
export function fontCss(): Promise<string> {
  fontCssCache ??= (async () => {
    const bytes = new Uint8Array(await (await fetch(fontUrl)).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return `@font-face { font-family: ${FONT_FAMILY}; src: url(data:font/woff;base64,${btoa(binary)}) format('woff'); }`;
  })();
  return fontCssCache;
}

/** Standalone SVG of a sheet at real size, without on-screen aids. */
export function sheetSvg(doc: ProjectDoc, sheetId: SheetId, css: string): string {
  return toSvgString(buildScene(doc, sheetId), { css });
}

/** Pixel size of a sheet rendered at `dpi`. */
export function pngSize(sheet: Sheet, dpi: number): { width: number; height: number } {
  const { width, height } = sheetDimensions(sheet);
  return { width: Math.round((width / 25.4) * dpi), height: Math.round((height / 25.4) * dpi) };
}

/** Rasterizes an SVG on a white background. */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG non creato'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Current time as ISO text (kept out of .svelte.ts files, where Date is linted). */
export function nowIso(): string {
  return new Date().toISOString();
}

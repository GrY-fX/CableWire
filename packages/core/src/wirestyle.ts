// How wires look: colour from the wire's colour code (IEC 60757), and line width.
// Both belong to the potential, like the wire number (see potentialStyleOps).

export interface WireColor {
  /** IEC 60757 code, as written in the wire's colour field. */
  code: string;
  name: string;
  /** Colour drawn on the sheet (dark enough to be seen on white paper). */
  css: string;
}

export const WIRE_COLORS: readonly WireColor[] = [
  { code: 'BK', name: 'Nero', css: '#000000' },
  { code: 'BN', name: 'Marrone', css: '#7b3f00' },
  { code: 'RD', name: 'Rosso', css: '#d40000' },
  { code: 'OG', name: 'Arancione', css: '#f07800' },
  { code: 'YE', name: 'Giallo', css: '#d4b000' },
  { code: 'GN', name: 'Verde', css: '#008a00' },
  { code: 'BU', name: 'Blu', css: '#0050d0' },
  { code: 'VT', name: 'Viola', css: '#8000b0' },
  { code: 'GY', name: 'Grigio', css: '#808080' },
  { code: 'WH', name: 'Bianco', css: '#b8b8b8' },
  { code: 'PK', name: 'Rosa', css: '#e8609c' },
  { code: 'TQ', name: 'Turchese', css: '#00a0a0' },
  { code: 'GNYE', name: 'Giallo-verde', css: '#008a00' },
];

/** The yellow of the green-yellow protective conductor, drawn as stripes. */
export const GNYE_STRIPE = '#e0c000';

export function wireColor(code: string | undefined): WireColor | undefined {
  const wanted = code?.trim().toUpperCase();
  return wanted ? WIRE_COLORS.find((c) => c.code === wanted) : undefined;
}

/** Line widths offered for wires, in mm (ISO 128 series); the default is 0.25. */
export const WIRE_WIDTHS: readonly { width: number; name: string }[] = [
  { width: 0.18, name: 'Sottile' },
  { width: 0.25, name: 'Normale' },
  { width: 0.35, name: 'Spesso' },
  { width: 0.5, name: 'Molto spesso' },
];
export const DEFAULT_WIRE_WIDTH = 0.25;

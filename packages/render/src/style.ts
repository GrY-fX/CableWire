import { GNYE_STRIPE, WIRE_COLORS, WIRE_WIDTHS } from '@cablewire/core';
/** Class prefix used in the SVG, so styles do not leak into or from the host page. */
export const CLASS_PREFIX = 'cw-';

export const FONT_FAMILY = 'osifont';

/** Class of a wire colour code (`wc-BU`) and of a line width (`ww-35` for 0.35 mm). */
export const wireColorClass = (code: string) => `wc-${code}`;
export const wireWidthClass = (width: number) => `ww-${Math.round(width * 100)}`;

// One rule per colour and width, after the base stroke so they win over it, while
// selection and highlighting (more specific) still show above them.
const WIRE_CSS = [
  ...WIRE_COLORS.map((c) => `.${CLASS_PREFIX}${wireColorClass(c.code)} { stroke: ${c.css}; }`),
  `.${CLASS_PREFIX}gnye-stripe { fill: none; stroke: ${GNYE_STRIPE}; stroke-dasharray: 1.5 1.5; }`,
  ...WIRE_WIDTHS.map(
    (w) => `.${CLASS_PREFIX}${wireWidthClass(w.width)} { stroke-width: ${w.width}; }`,
  ),
].join('\n');

/** Paper style: always black on white, also when the UI uses a dark theme. */
export const PAPER_CSS = `
.cw-stroke { fill: none; stroke: #000; stroke-width: 0.25; stroke-linecap: round; stroke-linejoin: round; }
.cw-filled { fill: #000; }
.cw-frame { stroke-width: 0.5; }
.cw-text { fill: #000; font-family: ${FONT_FAMILY}, sans-serif; dominant-baseline: central; }
${WIRE_CSS}
`;

/** On-screen only: editing aids and interaction states. */
export const SCREEN_CSS = `
.cw-hit { fill: none; stroke: transparent; stroke-width: 2; }
.cw-terminal-mark { fill: none; stroke: #d33; stroke-width: 0.15; }
.cw-item.cw-highlighted .cw-stroke { stroke: #e07b00; stroke-width: 0.5; }
.cw-item.cw-highlighted .cw-filled { fill: #e07b00; }
.cw-item.cw-selected .cw-stroke { stroke: #1d6fe0; }
.cw-item.cw-selected .cw-filled { fill: #1d6fe0; }
.cw-item.cw-selected .cw-text { fill: #1d6fe0; }
.cw-grid-dot { fill: #b8c0cc; }
.cw-grid-major { fill: #8c96a3; }
.cw-origin { fill: none; stroke: #2a9d8f; stroke-width: 1; vector-effect: non-scaling-stroke; }
.cw-terminal { fill: none; stroke: #d33; stroke-width: 0.2; }
.cw-terminal-name { fill: #d33; font-family: sans-serif; dominant-baseline: central; }
.cw-item.cw-selected .cw-terminal { stroke: #1d6fe0; stroke-width: 0.35; }
.cw-preview { fill: none; stroke: #1d6fe0; stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.cw-preview-text { fill: #1d6fe0; font-family: ${FONT_FAMILY}, sans-serif; dominant-baseline: central; }
.cw-wire-preview { fill: none; stroke: #1d6fe0; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.cw-hot { fill: rgb(29 111 224 / 0.15); stroke: #1d6fe0; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.cw-ghost { opacity: 0.6; }
.cw-ghost .cw-stroke { stroke: #1d6fe0; }
.cw-ghost .cw-text { fill: #1d6fe0; }
.cw-handle { fill: #fff; stroke: #1d6fe0; stroke-width: 1; vector-effect: non-scaling-stroke; }
.cw-marquee { fill: rgb(29 111 224 / 0.08); stroke: #1d6fe0; stroke-width: 1; stroke-dasharray: 3 2; vector-effect: non-scaling-stroke; }
`;

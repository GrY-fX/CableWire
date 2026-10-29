/** Class prefix used in the SVG, so styles do not leak into or from the host page. */
export const CLASS_PREFIX = 'cw-';

export const FONT_FAMILY = 'osifont';

/** Paper style: always black on white, also when the UI uses a dark theme. */
export const PAPER_CSS = `
.cw-stroke { fill: none; stroke: #000; stroke-width: 0.25; stroke-linecap: round; stroke-linejoin: round; }
.cw-filled { fill: #000; }
.cw-frame { stroke-width: 0.5; }
.cw-text { fill: #000; font-family: ${FONT_FAMILY}, sans-serif; dominant-baseline: central; }
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
`;

import type { Layer, Scene } from './scene.ts';
import { LAYERS } from './scene.ts';
import { CLASS_PREFIX, PAPER_CSS, SCREEN_CSS } from './style.ts';
import { nodeToSvg } from './svg-string.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Mounted {
  group: SVGGElement;
  markup: string;
}

/**
 * Keeps an `<svg>` in sync with successive scenes, replacing only the items whose
 * markup changed. Each item is a `<g data-key="...">`, so the editor can map DOM
 * events back to model objects.
 */
export class DomRenderer {
  readonly svg: SVGSVGElement;
  private readonly layers = new Map<Layer, SVGGElement>();
  private readonly items = new Map<string, Mounted>();
  private readonly paper: SVGRectElement;
  private readonly grid: SVGRectElement;
  private readonly gridPattern: SVGPatternElement;
  private selected = new Set<string>();
  private highlighted = new Set<string>();

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    const doc = svg.ownerDocument;
    const el = <K extends keyof SVGElementTagNameMap>(name: K) =>
      doc.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];

    svg.replaceChildren();
    const style = el('style');
    style.textContent = PAPER_CSS + SCREEN_CSS;
    const defs = el('defs');
    this.gridPattern = el('pattern');
    this.gridPattern.id = `${CLASS_PREFIX}grid-${Math.random().toString(36).slice(2)}`;
    this.gridPattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const dot = el('circle');
    dot.setAttribute('r', '0.15');
    dot.setAttribute('class', `${CLASS_PREFIX}grid-dot`);
    this.gridPattern.append(dot);
    defs.append(this.gridPattern);

    this.paper = el('rect');
    this.paper.setAttribute('fill', '#fff');
    this.grid = el('rect');
    this.grid.setAttribute('fill', `url(#${this.gridPattern.id})`);
    this.grid.style.display = 'none';
    svg.append(style, defs, this.paper, this.grid);

    for (const layer of LAYERS) {
      const g = el('g');
      g.dataset.layer = layer;
      svg.append(g);
      this.layers.set(layer, g);
    }
  }

  render(scene: Scene): void {
    const { width, height } = scene;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const r of [this.paper, this.grid]) {
      r.setAttribute('width', String(width));
      r.setAttribute('height', String(height));
    }

    const seen = new Set<string>();
    for (const item of scene.items) {
      seen.add(item.key);
      const markup = nodeToSvg(item.node, { screen: true });
      let mounted = this.items.get(item.key);
      if (!mounted) {
        const group = this.svg.ownerDocument.createElementNS(SVG_NS, 'g') as SVGGElement;
        group.dataset.key = item.key;
        mounted = { group, markup: '' };
        this.items.set(item.key, mounted);
        this.layers.get(item.layer)!.append(group);
        this.applyState(item.key, group);
      }
      if (mounted.markup !== markup) {
        mounted.group.innerHTML = markup;
        mounted.markup = markup;
      }
    }
    for (const [key, mounted] of this.items) {
      if (!seen.has(key)) {
        mounted.group.remove();
        this.items.delete(key);
      }
    }
  }

  /** Visual states by item key; does not rebuild anything. */
  setState(state: { selected?: Iterable<string>; highlighted?: Iterable<string> }): void {
    if (state.selected) this.selected = new Set(state.selected);
    if (state.highlighted) this.highlighted = new Set(state.highlighted);
    for (const [key, mounted] of this.items) this.applyState(key, mounted.group);
  }

  /** Shows the snap grid (on screen only); `undefined` hides it. */
  setGrid(step: number | undefined): void {
    if (step === undefined) {
      this.grid.style.display = 'none';
      return;
    }
    this.gridPattern.setAttribute('width', String(step));
    this.gridPattern.setAttribute('height', String(step));
    this.grid.style.display = '';
  }

  /** Item key under a DOM event target, if any. */
  keyAt(target: EventTarget | null): string | undefined {
    const g = (target as Element | null)?.closest?.('[data-key]') as SVGGElement | null;
    return g?.dataset.key;
  }

  private applyState(key: string, group: SVGGElement): void {
    group.setAttribute(
      'class',
      [
        `${CLASS_PREFIX}item`,
        this.selected.has(key) ? `${CLASS_PREFIX}selected` : '',
        this.highlighted.has(key) ? `${CLASS_PREFIX}highlighted` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
}

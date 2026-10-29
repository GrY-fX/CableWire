import type { Layer, Scene } from './scene.ts';
import { LAYERS } from './scene.ts';
import { CLASS_PREFIX, PAPER_CSS, SCREEN_CSS } from './style.ts';
import { nodeToSvg } from './svg-string.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Mounted {
  group: SVGGElement;
  markup: string;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DomRendererOptions {
  /** Draw the white sheet of paper behind the scene (default true). */
  paper?: boolean;
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
  private readonly grids: { rect: SVGRectElement; pattern: SVGPatternElement }[] = [];
  private selected = new Set<string>();
  private highlighted = new Set<string>();
  private view: ViewBox | undefined;
  private sceneSize = { width: 0, height: 0 };

  constructor(svg: SVGSVGElement, options: DomRendererOptions = {}) {
    this.svg = svg;
    const doc = svg.ownerDocument;
    const el = <K extends keyof SVGElementTagNameMap>(name: K) =>
      doc.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];

    svg.replaceChildren();
    const style = el('style');
    style.textContent = PAPER_CSS + SCREEN_CSS;
    const defs = el('defs');
    this.paper = el('rect');
    this.paper.setAttribute('fill', '#fff');
    if (options.paper === false) this.paper.style.display = 'none';
    svg.append(style, defs, this.paper);

    // Two dot grids: minor and major (e.g. 0.5 mm and 2.5 mm in the symbol editor).
    const unique = Math.random().toString(36).slice(2);
    for (const [i, cls] of ['grid-dot', 'grid-major'].entries()) {
      const pattern = el('pattern');
      pattern.id = `${CLASS_PREFIX}grid-${i}-${unique}`;
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      const dot = el('circle');
      dot.setAttribute('class', CLASS_PREFIX + cls);
      pattern.append(dot);
      defs.append(pattern);
      const rect = el('rect');
      rect.setAttribute('fill', `url(#${pattern.id})`);
      rect.style.display = 'none';
      svg.append(rect);
      this.grids.push({ rect, pattern });
    }

    for (const layer of LAYERS) {
      const g = el('g');
      g.dataset.layer = layer;
      svg.append(g);
      this.layers.set(layer, g);
    }
  }

  render(scene: Scene): void {
    this.sceneSize = { width: scene.width, height: scene.height };
    this.applyView();

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

  /** Shows a free region (zoom/pan) instead of the whole scene; `undefined` fits the scene. */
  setView(view: ViewBox | undefined): void {
    this.view = view;
    this.applyView();
  }

  /** Visual states by item key; does not rebuild anything. */
  setState(state: { selected?: Iterable<string>; highlighted?: Iterable<string> }): void {
    if (state.selected) this.selected = new Set(state.selected);
    if (state.highlighted) this.highlighted = new Set(state.highlighted);
    for (const [key, mounted] of this.items) this.applyState(key, mounted.group);
  }

  /**
   * Shows the snap grid (on screen only) with dots every `step`, and bigger dots
   * every `major` if given; `undefined` hides it. Dot radius is in millimetres.
   */
  setGrid(step: number | undefined, major?: number, radius = 0.15): void {
    const steps = [step, major];
    this.grids.forEach(({ rect, pattern }, i) => {
      const s = steps[i];
      if (s === undefined) {
        rect.style.display = 'none';
        return;
      }
      pattern.setAttribute('width', String(s));
      pattern.setAttribute('height', String(s));
      pattern.firstElementChild!.setAttribute('r', String(i === 0 ? radius : radius * 1.6));
      rect.style.display = '';
    });
  }

  /** Item key under a DOM event target, if any. */
  keyAt(target: EventTarget | null): string | undefined {
    const g = (target as Element | null)?.closest?.('[data-key]') as SVGGElement | null;
    return g?.dataset.key;
  }

  private applyView(): void {
    const box = this.view ?? { x: 0, y: 0, ...this.sceneSize };
    this.svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    // The paper is the scene; the grid covers what is visible.
    this.paper.setAttribute('width', String(this.sceneSize.width));
    this.paper.setAttribute('height', String(this.sceneSize.height));
    for (const { rect } of this.grids) {
      const area = this.view ? box : { x: 0, y: 0, ...this.sceneSize };
      rect.setAttribute('x', String(area.x));
      rect.setAttribute('y', String(area.y));
      rect.setAttribute('width', String(area.width));
      rect.setAttribute('height', String(area.height));
    }
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

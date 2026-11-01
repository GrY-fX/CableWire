<script lang="ts">
  import { onMount } from 'svelte';
  import { symbolBounds, unionBounds } from '@cablewire/core';
  import type { Point } from '@cablewire/core';
  import { buildSymbolScene, DomRenderer } from '@cablewire/render';
  import {
    fitBounds,
    panBy,
    screenToWorld,
    SHAPE_GRID,
    TERMINAL_GRID,
    viewBoxOf,
    wheelZoomFactor,
    zoomAt,
  } from '@cablewire/editor';
  import type { SymbolEditor, Viewport } from '@cablewire/editor';

  let {
    editor,
    version,
    onview,
  }: {
    editor: SymbolEditor;
    version: number;
    /** Reports zoom (pixels per mm) for the status bar. */
    onview?: (scale: number) => void;
  } = $props();

  let svg: SVGSVGElement;
  let renderer: DomRenderer | undefined;
  let size = $state({ width: 0, height: 0 });
  let vp = $state<Viewport>({ x: -20, y: -15, scale: 10 });
  let panning: Point | undefined;
  let spaceHeld = $state(false);
  const drawing = $derived.by(() => {
    void version;
    return editor.tool !== 'select';
  });

  /** Hit and handle tolerance, in screen pixels. */
  const TOLERANCE_PX = 6;
  const ZOOM_STEP = 1.2;

  onMount(() => {
    renderer = new DomRenderer(svg, { paper: false });
    const observer = new ResizeObserver(() => {
      const first = size.width === 0;
      size = { width: svg.clientWidth, height: svg.clientHeight };
      if (first && size.width > 0) fit();
    });
    observer.observe(svg);
    // Non-passive, so the page does not scroll while zooming.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(wheelZoomFactor(e.deltaY, e.deltaMode), local(e));
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', wheel);
    };
  });

  $effect(() => {
    void version;
    draw(vp, size);
  });

  function draw(view: Viewport, area: { width: number; height: number }) {
    if (!renderer || area.width === 0) return;
    const pixel = 1 / view.scale;
    editor.tolerance = TOLERANCE_PX * pixel;
    renderer.setView(viewBoxOf(view, area));
    // Fine grid only when it is not too dense to be useful.
    if (view.scale >= 8) renderer.setGrid(SHAPE_GRID, TERMINAL_GRID, pixel);
    else renderer.setGrid(TERMINAL_GRID, undefined, 1.2 * pixel);
    renderer.render(
      buildSymbolScene(editor.symbol, {
        pixel,
        preview: editor.preview,
        handles: editor.handles,
        marquee: editor.marquee,
      }),
    );
    renderer.setState({ selected: editor.selection });
    onview?.(view.scale);
  }

  export function fit() {
    if (size.width === 0) return;
    const around = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
    // A title block is shown whole, with its area.
    const block = editor.symbol.kind === 'titleblock' ? editor.symbol.titleBlock : undefined;
    const area = block ? { minX: 0, minY: 0, maxX: block.width, maxY: block.height } : around;
    const bounds = unionBounds(unionBounds(symbolBounds(editor.symbol), around), area)!;
    const view = fitBounds(bounds, size, 60);
    vp = { ...view, scale: Math.min(view.scale, 25) };
  }

  export function zoom(factor: number, at: Point = { x: size.width / 2, y: size.height / 2 }) {
    vp = zoomAt(vp, at, factor);
  }

  function local(e: MouseEvent): Point {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onpointerdown(e: PointerEvent) {
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      panning = local(e);
      return;
    }
    if (e.button === 0) editor.pointerDown(screenToWorld(vp, local(e)), { shift: e.shiftKey });
  }

  function onpointermove(e: PointerEvent) {
    const p = local(e);
    if (panning) {
      vp = panBy(vp, p.x - panning.x, p.y - panning.y);
      panning = p;
      return;
    }
    editor.pointerMove(screenToWorld(vp, p));
  }

  function onpointerup(e: PointerEvent) {
    if (panning) {
      panning = undefined;
      return;
    }
    if (e.button === 0) editor.pointerUp(screenToWorld(vp, local(e)));
  }

  /** Space (pan) and zoom keys; returns true if handled. */
  export function key(e: KeyboardEvent): boolean {
    if (e.key === ' ') {
      spaceHeld = e.type === 'keydown';
      return true;
    }
    if (e.type !== 'keydown' || e.ctrlKey || e.metaKey) return false;
    if (e.key === '+') zoom(ZOOM_STEP);
    else if (e.key === '-') zoom(1 / ZOOM_STEP);
    else if (e.key === '0') fit();
    else return false;
    return true;
  }
</script>

<svg
  bind:this={svg}
  class:drawing
  class:pan={spaceHeld}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  ondblclick={() => editor.doubleClick()}
  role="application"
  aria-label="Area di disegno del simbolo"
></svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
    background: #fff;
    touch-action: none;
    user-select: none;
  }
  svg.drawing {
    cursor: crosshair;
  }
  svg.pan {
    cursor: grab;
  }
</style>

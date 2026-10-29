<script lang="ts">
  import { onMount } from 'svelte';
  import type { Point } from '@cablewire/core';
  import {
    buildSchematicOverlay,
    buildScene,
    DomRenderer,
    sheetDimensions,
  } from '@cablewire/render';
  import { fitBounds, panBy, screenToWorld, viewBoxOf, zoomAt } from '@cablewire/editor';
  import type { SchematicEditor, Viewport } from '@cablewire/editor';

  let {
    editor,
    version,
    showGrid,
    ondblelement,
    onview,
  }: {
    editor: SchematicEditor;
    version: number;
    showGrid: boolean;
    /** Double click on an element (key), e.g. to edit its label. */
    ondblelement?: (key: string) => void;
    onview?: (scale: number) => void;
  } = $props();

  let svg: SVGSVGElement;
  let renderer: DomRenderer | undefined;
  let size = $state({ width: 0, height: 0 });
  let vp = $state<Viewport>({ x: 0, y: 0, scale: 2 });
  let panning: Point | undefined;
  let spaceHeld = $state(false);
  let fittedSheet = '';

  const TOLERANCE_PX = 5;
  const ZOOM_STEP = 1.2;

  onMount(() => {
    renderer = new DomRenderer(svg);
    const observer = new ResizeObserver(() => {
      const first = size.width === 0;
      size = { width: svg.clientWidth, height: svg.clientHeight };
      if (first && size.width > 0) fit();
    });
    observer.observe(svg);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, local(e));
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', wheel);
    };
  });

  $effect(() => {
    void version;
    draw(vp, size, showGrid);
  });

  function draw(view: Viewport, area: { width: number; height: number }, grid: boolean) {
    if (!renderer || area.width === 0) return;
    const doc = editor.doc;
    // A different sheet is shown whole.
    if (editor.sheetId !== fittedSheet) {
      fittedSheet = editor.sheetId;
      fit();
      return;
    }
    editor.tolerance = TOLERANCE_PX / view.scale;
    renderer.setView(viewBoxOf(view, area));
    renderer.setGrid(grid ? doc.settings.gridStep : undefined, undefined, 0.6 / view.scale + 0.05);
    const scene = buildScene(doc, editor.sheetId);
    const overlay = buildSchematicOverlay({
      pixel: 1 / view.scale,
      ghost: editor.ghost,
      marquee: editor.marquee,
      preview: editor.preview,
      hot: editor.hot?.point,
      handles: editor.wireHandles.map((h) => h.point),
    });
    renderer.render({ ...scene, items: [...scene.items, ...overlay] });
    renderer.setState({ selected: editor.selection, highlighted: editor.highlight?.keys ?? [] });
    onview?.(view.scale);
  }

  export function fit() {
    const sheet = editor.doc.sheets[editor.sheetId];
    if (!sheet || size.width === 0) return;
    const { width, height } = sheetDimensions(sheet);
    vp = fitBounds({ minX: 0, minY: 0, maxX: width, maxY: height }, size, 20);
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

  function ondblclick(e: MouseEvent) {
    const key = editor.doubleClick(screenToWorld(vp, local(e)));
    if (key) ondblelement?.(key);
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

  const placing = $derived.by(() => {
    void version;
    return editor.tool === 'place';
  });
  const wiring = $derived.by(() => {
    void version;
    return editor.tool === 'wire';
  });
</script>

<svg
  bind:this={svg}
  class:placing
  class:wiring
  class:pan={spaceHeld}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  {ondblclick}
  role="application"
  aria-label="Foglio dello schema"
></svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--bg);
    touch-action: none;
    user-select: none;
  }
  svg.wiring {
    cursor: crosshair;
  }
  svg.placing {
    cursor: copy;
  }
  svg.pan {
    cursor: grab;
  }
</style>

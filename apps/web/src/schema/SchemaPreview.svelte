<script lang="ts">
  import { onMount } from 'svelte';
  import { getPotentials, terminalKey } from '@cablewire/core';
  import type { ElementId, WireId } from '@cablewire/core';
  import { buildScene, DomRenderer, FONT_FAMILY, toSvgString } from '@cablewire/render';
  import fontUrl from '@cablewire/render/assets/osifont.woff?url';
  import { createDemo } from '../demo.ts';

  // Sample sheet to check the renderer; the schematic editor arrives in phase 1, step 5.
  const { store, sheetId } = createDemo();
  let svg: SVGSVGElement;
  let renderer: DomRenderer | undefined;
  let showGrid = $state(true);
  let status = $state(
    'Clicca un filo per evidenziarne il potenziale, o un elemento per selezionarlo.',
  );

  onMount(() => {
    renderer = new DomRenderer(svg);
    renderer.render(buildScene(store.doc, sheetId));
    renderer.setGrid(store.doc.settings.gridStep);
    return store.subscribe((doc) => renderer?.render(buildScene(doc, sheetId)));
  });

  function toggleGrid() {
    showGrid = !showGrid;
    renderer?.setGrid(showGrid ? store.doc.settings.gridStep : undefined);
  }

  function onClick(event: MouseEvent) {
    if (!renderer) return;
    const key = renderer.keyAt(event.target);
    const doc = store.doc;
    if (key?.startsWith('wire:')) {
      const potentials = getPotentials(doc);
      const p = potentials.potentialOfWire(key.slice(5) as WireId)!;
      const wires = potentials.wires(p).map((w) => `wire:${w}`);
      const nodes = potentials.nodes(p);
      const junctions = nodes
        .filter((n) => n.startsWith('j:'))
        .map((n) => `junction:${n.slice(2)}`);
      renderer.setState({ selected: [], highlighted: [...wires, ...junctions] });
      status = `Potenziale: ${wires.length} fili, ${nodes.filter((n) => n.startsWith('e:')).length} terminali.`;
    } else if (key?.startsWith('element:')) {
      const element = doc.elements[key.slice(8) as ElementId]!;
      const symbol = doc.symbols[element.symbolId]!;
      const potentials = getPotentials(doc);
      const terminals = symbol.terminals
        .map(
          (t) => `${t.name}: potenziale ${potentials.potentialOf(terminalKey(element.id, t.id))}`,
        )
        .join(', ');
      renderer.setState({ selected: [key], highlighted: [] });
      status = `${element.info.label || symbol.name} (${symbol.name}) — ${terminals}`;
    } else {
      renderer.setState({ selected: [], highlighted: [] });
      status = 'Nessuna selezione.';
    }
  }

  async function exportSvg() {
    const bytes = new Uint8Array(await (await fetch(fontUrl)).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const css = `@font-face { font-family: ${FONT_FAMILY}; src: url(data:font/woff;base64,${btoa(binary)}) format('woff'); }`;
    const markup = toSvgString(buildScene(store.doc, sheetId), { css });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    link.download = 'foglio-1.svg';
    link.click();
    URL.revokeObjectURL(link.href);
  }
</script>

<div class="workspace">
  <div class="bar">
    <span class="hint">Foglio di prova (l'editor di schemi arriva al punto 5)</span>
    <span class="spacer"></span>
    <button onclick={toggleGrid}>{showGrid ? 'Nascondi griglia' : 'Mostra griglia'}</button>
    <button onclick={exportSvg}>Esporta SVG</button>
  </div>
  <main>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <svg bind:this={svg} onclick={onClick}></svg>
  </main>
  <footer>{status}</footer>
</div>

<style>
  .workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .bar,
  footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 1rem;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  footer {
    border-top: 1px solid var(--border);
    border-bottom: none;
    font-size: 0.85rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .spacer {
    flex: 1;
  }
  main {
    flex: 1;
    min-height: 0;
    padding: 1rem;
  }
  svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 1px 4px rgb(0 0 0 / 0.2));
  }
</style>

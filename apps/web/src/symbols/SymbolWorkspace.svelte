<script lang="ts">
  import { onMount } from 'svelte';
  import { newSymbol, SymbolEditor } from '@cablewire/editor';
  import type { ToolName } from '@cablewire/editor';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import RotationPreview from './RotationPreview.svelte';
  import SymbolCanvas from './SymbolCanvas.svelte';
  import { sampleContact } from './sample.ts';

  let { active }: { active: boolean } = $props();

  const editor = new SymbolEditor(sampleContact());
  let version = $state(0);
  let scale = $state(10);
  let canvas: SymbolCanvas | undefined = $state();

  onMount(() => editor.subscribe(() => version++));

  const view = $derived.by(() => {
    void version;
    return {
      symbol: editor.symbol,
      tool: editor.tool,
      cursor: editor.cursorPoint,
      canUndo: editor.canUndo,
      canRedo: editor.canRedo,
    };
  });

  const TOOLS: { id: ToolName; icon: string; label: string; key: string; hint: string }[] = [
    {
      id: 'select',
      icon: '⬚',
      label: 'Seleziona',
      key: 'S',
      hint: "Clic per selezionare, trascina per spostare o selezionare un'area; Maiusc+clic aggiunge.",
    },
    {
      id: 'line',
      icon: '╱',
      label: 'Linea',
      key: 'L',
      hint: 'Clic sul punto iniziale e su quello finale.',
    },
    {
      id: 'polyline',
      icon: '⌇',
      label: 'Polilinea',
      key: 'P',
      hint: 'Clic per ogni vertice; doppio clic o Invio per finire, clic sul primo punto per chiudere.',
    },
    {
      id: 'rect',
      icon: '▭',
      label: 'Rettangolo',
      key: 'R',
      hint: "Trascina da un angolo all'altro (o due clic).",
    },
    {
      id: 'circle',
      icon: '◯',
      label: 'Cerchio',
      key: 'C',
      hint: 'Clic al centro, poi clic sul raggio.',
    },
    {
      id: 'arc',
      icon: '◠',
      label: 'Arco',
      key: 'A',
      hint: "Clic al centro, clic sull'inizio, clic sulla fine (verso orario).",
    },
    {
      id: 'text',
      icon: 'T',
      label: 'Testo',
      key: 'T',
      hint: 'Clic dove mettere il testo, poi modificalo nel pannello.',
    },
    {
      id: 'terminal',
      icon: '⊕',
      label: 'Terminale',
      key: 'M',
      hint: 'Clic dove il filo si collega (griglia di 2,5 mm).',
    },
  ];
  const toolHint = $derived(TOOLS.find((t) => t.id === view.tool)?.hint ?? '');

  function onkey(e: KeyboardEvent) {
    if (!active) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    if (canvas?.key(e)) {
      e.preventDefault();
      return;
    }
    if (e.type !== 'keydown') return;
    if (editor.key(e.key, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })) e.preventDefault();
  }

  function startNew() {
    if (
      editor.canUndo &&
      !confirm('Iniziare un nuovo simbolo? Le modifiche non salvate andranno perse.')
    ) {
      return;
    }
    editor.load(newSymbol());
    canvas?.fit();
  }

  function openSample() {
    editor.load(sampleContact());
    canvas?.fit();
  }
</script>

<svelte:window onkeydown={onkey} onkeyup={onkey} />

<div class="workspace">
  <aside class="library">
    <h3>Libreria</h3>
    <button onclick={startNew}>Nuovo simbolo</button>
    <button onclick={openSample}>Apri esempio</button>
    <p class="hint">
      Archivio, ricerca, simboli di base e import/export .cwsym arrivano al passo 4b.
    </p>
  </aside>

  <section class="center">
    <div class="toolbar" role="toolbar" aria-label="Strumenti">
      {#each TOOLS as t (t.id)}
        <button
          class:active={view.tool === t.id}
          title={`${t.label} (${t.key})`}
          onclick={() => editor.setTool(t.id)}><span class="icon">{t.icon}</span> {t.label}</button
        >
      {/each}
      <span class="sep"></span>
      <button title="Annulla (Ctrl+Z)" disabled={!view.canUndo} onclick={() => editor.undo()}
        >↶</button
      >
      <button title="Ripeti (Ctrl+Y)" disabled={!view.canRedo} onclick={() => editor.redo()}
        >↷</button
      >
      <span class="sep"></span>
      <button title="Riduci (−)" onclick={() => canvas?.zoom(1 / 1.2)}>−</button>
      <button title="Ingrandisci (+)" onclick={() => canvas?.zoom(1.2)}>+</button>
      <button title="Adatta alla vista (0)" onclick={() => canvas?.fit()}>Adatta</button>
    </div>
    <div class="canvas">
      <SymbolCanvas bind:this={canvas} {editor} {version} onview={(s) => (scale = s)} />
    </div>
    <footer>
      <span class="coords">
        {#if view.cursor}X {view.cursor.x.toFixed(1)} · Y {view.cursor.y.toFixed(1)} mm{:else}&nbsp;{/if}
      </span>
      <span class="zoom">{Math.round(scale * 10)}%</span>
      <span class="hint"
        >{toolHint} Spazio+trascina o tasto centrale per spostare la vista, rotella per lo zoom.</span
      >
    </footer>
  </section>

  <aside class="side">
    <PropertiesPanel {editor} {version} />
    <h3 class="preview-title">Anteprima nelle rotazioni</h3>
    <RotationPreview symbol={view.symbol} />
  </aside>
</div>

<style>
  .workspace {
    display: grid;
    grid-template-columns: 200px 1fr 300px;
    height: 100%;
  }
  aside {
    background: var(--panel);
    overflow-y: auto;
  }
  .library {
    border-right: 1px solid var(--border);
    padding: 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .side {
    border-left: 1px solid var(--border);
  }
  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 0.95rem;
  }
  .preview-title {
    padding: 0 0.75rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .center {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem;
    padding: 0.35rem 0.5rem;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .toolbar button {
    padding: 0.2rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }
  .toolbar button:hover:not(:disabled) {
    border-color: var(--border);
  }
  .toolbar button.active {
    background: #e3edfc;
    border-color: var(--accent);
    color: var(--accent);
  }
  .icon {
    display: inline-block;
    width: 1em;
    text-align: center;
  }
  .sep {
    width: 1px;
    height: 1.4rem;
    background: var(--border);
    margin: 0 0.3rem;
  }
  .canvas {
    flex: 1;
    min-height: 0;
  }
  footer {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.3rem 0.75rem;
    background: var(--panel);
    border-top: 1px solid var(--border);
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
  }
  .coords {
    min-width: 11rem;
    font-variant-numeric: tabular-nums;
  }
  .zoom {
    min-width: 3rem;
    color: var(--muted);
  }
  footer .hint {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

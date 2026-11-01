<script lang="ts">
  import { onMount } from 'svelte';
  import { newId } from '@cablewire/core';
  import type { SymbolDef, SymbolId } from '@cablewire/core';
  import { checkSymbol, newSymbol, SymbolEditor } from '@cablewire/editor';
  import type { ToolName } from '@cablewire/editor';
  import { parseSymbol, serializeSymbol } from '@cablewire/formats';
  import type { Library } from '../library/library.svelte.ts';
  import LibraryPanel from '../library/LibraryPanel.svelte';
  import { prepareSave, resolveImport, symbolFileName } from '../library/logic.ts';
  import type { ImportChoice, LibraryItem, Source } from '../library/logic.ts';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import RotationPreview from './RotationPreview.svelte';
  import SymbolCanvas from './SymbolCanvas.svelte';

  let { active, library }: { active: boolean; library: Library } = $props();

  const first = newSymbol();
  const editor = new SymbolEditor(first);
  let version = $state(0);
  let scale = $state(10);
  let canvas: SymbolCanvas | undefined = $state();

  /** Where the open symbol comes from, and the version last saved or opened. */
  let current = $state.raw<{ source: Source | undefined; saved: SymbolDef }>({
    source: undefined,
    saved: first,
  });
  let notice = $state<{ kind: 'info' | 'error'; lines: string[] } | undefined>();

  onMount(() => {
    const unsubscribe = editor.subscribe(() => version++);
    const beforeunload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeunload);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', beforeunload);
    };
  });

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
  const dirty = $derived(view.symbol !== current.saved);
  /** The open base symbol has a saved version of the user's in place of the original. */
  const modifiedBase = $derived(
    current.source === 'base' && library.personal.some((s) => s.id === view.symbol.id),
  );
  const status = $derived(
    current.source === 'base'
      ? dirty
        ? "Simbolo di base: salvando sostituisci l'originale (si può ripristinare)."
        : modifiedBase
          ? 'Simbolo di base modificato da te.'
          : 'Simbolo di base originale.'
      : current.source === 'personal'
        ? dirty
          ? 'Modifiche non salvate.'
          : 'Salvato nella libreria.'
        : 'Nuovo simbolo, non ancora salvato.',
  );

  function confirmDiscard(): boolean {
    return !dirty || confirm('Le modifiche al simbolo aperto non sono salvate. Continuare?');
  }

  function open(symbol: SymbolDef, source: Source | undefined) {
    editor.load(symbol);
    current = { source, saved: symbol };
    notice = undefined;
    canvas?.fit();
  }

  function startNew() {
    if (confirmDiscard()) open(newSymbol(), undefined);
  }

  function openItem(item: LibraryItem) {
    if (item.symbol.id === view.symbol.id && item.source === current.source) return;
    if (confirmDiscard()) open(item.symbol, item.source);
  }

  function duplicate() {
    if (!confirmDiscard()) return;
    const copy: SymbolDef = {
      ...view.symbol,
      id: newId(),
      name: `${view.symbol.name} (copia)`,
      version: 1,
    };
    open(copy, undefined);
  }

  async function save() {
    if (!library.available) return;
    const { errors, warnings } = checkSymbol(view.symbol);
    if (errors.length) {
      notice = { kind: 'error', lines: ['Impossibile salvare:', ...errors] };
      return;
    }
    const stored = library.personal.find((s) => s.id === view.symbol.id);
    const original = current.source === 'base' ? library.original(view.symbol.id) : undefined;
    const previous = stored ?? original;
    const next = prepareSave(view.symbol, previous);
    if (next !== previous) await library.put(next);
    editor.replaceSymbol(next);
    current = { source: current.source === 'base' ? 'base' : 'personal', saved: next };
    notice = {
      kind: 'info',
      lines: [`Salvato «${next.name}» (versione ${next.version}).`, ...warnings],
    };
  }

  async function toggleFavorite(item: LibraryItem) {
    await library.setFavorite(item.symbol.id, !item.favorite);
  }

  /** Drops the user's version of a base symbol; the original comes back. */
  async function restore(id: SymbolId) {
    const original = library.original(id);
    if (!library.available || !original) return;
    if (
      !confirm(`Ripristinare «${original.name}» com'era in origine? La tua versione andrà persa.`)
    )
      return;
    await library.remove(id);
    if (current.source === 'base' && view.symbol.id === id) open(original, 'base');
  }

  async function remove(item: LibraryItem) {
    if (item.modified) return restore(item.symbol.id);
    if (!library.available || !confirm(`Eliminare «${item.symbol.name}» dalla libreria?`)) return;
    await library.remove(item.symbol.id);
    if (current.source === 'personal' && view.symbol.id === item.symbol.id) {
      // Keep it open, but as an unsaved symbol.
      current = { source: undefined, saved: newSymbol() };
    }
  }

  function exportSymbol() {
    const link = document.createElement('a');
    const blob = new Blob([serializeSymbol(view.symbol)], { type: 'application/json' });
    link.href = URL.createObjectURL(blob);
    link.download = symbolFileName(view.symbol);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Import: one or more .cwsym files; asks what to do when an id is already in the library.
  let fileInput: HTMLInputElement;
  let conflictDialog: HTMLDialogElement;
  let conflictName = $state('');
  let answerConflict: ((choice: ImportChoice) => void) | undefined;

  function askConflict(name: string): Promise<ImportChoice> {
    conflictName = name;
    conflictDialog.showModal();
    return new Promise((resolve) => (answerConflict = resolve));
  }

  function chooseConflict(choice: ImportChoice) {
    conflictDialog.close();
    answerConflict?.(choice);
    answerConflict = undefined;
  }

  async function importFiles(files: FileList | null) {
    if (!library.available || !files?.length) return;
    const lines: string[] = [];
    let imported = 0;
    for (const file of files) {
      const parsed = parseSymbol(await file.text());
      if (!parsed.ok) {
        lines.push(`${file.name}: ${parsed.error.message}`);
        continue;
      }
      const symbol = parsed.value;
      const ids = new Set(library.personal.map((s) => s.id));
      const choice = ids.has(symbol.id) ? await askConflict(symbol.name) : undefined;
      const toStore = resolveImport(symbol, ids, library.baseIds, choice);
      if (!toStore) continue;
      await library.put(toStore);
      imported++;
    }
    fileInput.value = '';
    notice = {
      kind: lines.length ? 'error' : 'info',
      lines: [`Simboli importati: ${imported}.`, ...lines],
    };
  }

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
    if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      // Apply the field being edited before saving.
      (document.activeElement as HTMLElement | null)?.blur();
      void save();
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    if (canvas?.key(e)) {
      e.preventDefault();
      return;
    }
    if (e.type !== 'keydown') return;
    if (editor.key(e.key, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onkey} onkeyup={onkey} />

<div class="workspace">
  <aside class="library">
    <h3>Libreria</h3>
    <div class="actions">
      <button onclick={startNew}>Nuovo</button>
      <button onclick={() => fileInput.click()} disabled={!!library.error}>Importa…</button>
    </div>
    <input
      bind:this={fileInput}
      type="file"
      accept=".cwsym,application/json"
      multiple
      hidden
      onchange={(e) => importFiles(e.currentTarget.files)}
    />
    {#if library.error}<p class="notice error">{library.error}</p>{/if}
    <LibraryPanel
      items={library.items}
      currentId={current.source ? view.symbol.id : undefined}
      onopen={openItem}
      onfavorite={toggleFavorite}
      onremove={remove}
    />
  </aside>

  <section class="center">
    <div class="filebar">
      <strong class="title">{view.symbol.name || '(senza nome)'}</strong>
      <span class="state" class:dirty>{status}</span>
      <span class="spacer"></span>
      <button
        class="primary"
        onclick={save}
        disabled={!!library.error}
        title="Salva nella libreria (Ctrl+S)">Salva</button
      >
      {#if modifiedBase}
        <button onclick={() => restore(view.symbol.id)} title="Torna al simbolo di base originale"
          >Ripristina originale</button
        >
      {/if}
      <button onclick={duplicate} title="Apri una copia di questo simbolo">Duplica</button>
      <button onclick={exportSymbol} title="Scarica il file .cwsym">Esporta .cwsym</button>
    </div>
    {#if notice}
      <div class="notice {notice.kind}">
        <ul>
          {#each notice.lines as line, i (i)}<li>{line}</li>{/each}
        </ul>
        <button class="close" title="Chiudi" onclick={() => (notice = undefined)}>×</button>
      </div>
    {/if}
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
    {#if view.symbol.kind !== 'titleblock'}
      <h3 class="preview-title">Anteprima nelle rotazioni</h3>
      <RotationPreview symbol={view.symbol} />
    {/if}
  </aside>
</div>

<dialog bind:this={conflictDialog} oncancel={() => chooseConflict('skip')}>
  <p>Nella libreria c'è già un simbolo con lo stesso identificativo di «{conflictName}».</p>
  <div class="dialog-actions">
    <button onclick={() => chooseConflict('replace')}>Sostituisci</button>
    <button onclick={() => chooseConflict('keep-both')}>Tieni entrambi</button>
    <button onclick={() => chooseConflict('skip')}>Salta</button>
  </div>
</dialog>

<style>
  .workspace {
    display: grid;
    grid-template-columns: 250px 1fr 300px;
    /* Columns scroll on their own instead of stretching the page. */
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
  }
  .actions {
    display: flex;
    gap: 0.3rem;
  }
  .actions button {
    flex: 1;
  }
  .filebar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .title {
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .state.dirty {
    color: var(--warning);
  }
  .spacer {
    flex: 1;
  }
  .primary {
    background: var(--accent);
    color: #fff;
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 0.2rem 0.8rem;
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .notice {
    position: relative;
    padding: 0.4rem 2rem 0.4rem 0.75rem;
    font-size: 0.85rem;
    border-bottom: 1px solid var(--border);
    background: #eef5ee;
  }
  .notice.error {
    background: #fdecea;
    color: var(--error);
  }
  .notice ul {
    margin: 0;
    padding-left: 1rem;
  }
  .notice li:first-child {
    list-style: none;
    margin-left: -1rem;
    font-weight: 600;
  }
  .library .notice {
    padding: 0.4rem;
    border: none;
    border-radius: 3px;
    margin: 0;
  }
  .close {
    position: absolute;
    top: 0.25rem;
    right: 0.4rem;
    border: none;
    background: none;
    font-size: 1rem;
    cursor: pointer;
    color: inherit;
  }
  dialog {
    border: 1px solid var(--border);
    border-radius: 6px;
    max-width: 26rem;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
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

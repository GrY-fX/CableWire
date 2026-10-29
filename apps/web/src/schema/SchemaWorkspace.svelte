<script lang="ts">
  import { onMount } from 'svelte';
  import { createEmptyProject, createStore } from '@cablewire/core';
  import type { SymbolDef } from '@cablewire/core';
  import { SchematicEditor } from '@cablewire/editor';
  import { buildScene, FONT_FAMILY, toSvgString } from '@cablewire/render';
  import fontUrl from '@cablewire/render/assets/osifont.woff?url';
  import type { Library } from '../library/library.svelte.ts';
  import LibraryPanel from '../library/LibraryPanel.svelte';
  import { sameSymbol } from '../library/logic.ts';
  import type { LibraryItem } from '../library/logic.ts';
  import { ProjectAutosave } from './autosave.ts';
  import SchematicCanvas from './SchematicCanvas.svelte';
  import SchemaProperties from './SchemaProperties.svelte';
  import SheetTabs from './SheetTabs.svelte';

  let { active, library }: { active: boolean; library: Library } = $props();

  const store = createStore(createEmptyProject('Nuovo progetto'));
  const editor = new SchematicEditor(store);
  let version = $state(0);
  let scale = $state(2);
  let showGrid = $state(true);
  let canvas: SchematicCanvas | undefined = $state();
  let properties: SchemaProperties | undefined = $state();
  let autosave: ProjectAutosave | undefined;
  let saveState = $state<'saved' | 'pending' | 'off'>('saved');
  let notice = $state<{ kind: 'info' | 'error'; lines: string[] } | undefined>();

  onMount(() => {
    const unsubscribe = editor.subscribe(() => version++);
    const unwatch = store.subscribe((doc) => {
      if (!autosave) return;
      saveState = 'pending';
      autosave.schedule(doc);
    });
    ProjectAutosave.open()
      .then(async (a) => {
        autosave = a;
        const loaded = await a.load();
        if (loaded?.ok) {
          store.reset(loaded.value);
        } else if (loaded) {
          notice = {
            kind: 'error',
            lines: [
              'Il progetto salvato non si può aprire: si parte da un progetto nuovo.',
              loaded.error.message,
              ...loaded.error.details,
            ],
          };
        }
        saveState = 'saved';
      })
      .catch(() => (saveState = 'off'));
    // Write a pending save when the page goes away.
    const pagehide = () => void autosave?.flush();
    window.addEventListener('pagehide', pagehide);
    return () => {
      unsubscribe();
      unwatch();
      window.removeEventListener('pagehide', pagehide);
      void autosave?.flush().then(() => autosave?.close());
    };
  });

  // The save indicator turns back to "saved" a moment after the last change.
  $effect(() => {
    if (saveState !== 'pending') return;
    const t = setTimeout(() => (saveState = 'saved'), 1300);
    return () => clearTimeout(t);
  });

  const view = $derived.by(() => {
    void version;
    return {
      title: editor.doc.meta.title,
      tool: editor.tool,
      ghost: editor.ghost,
      count: editor.selection.size,
      cursor: editor.cursorPoint,
      undo: store.undoLabel,
      redo: store.redoLabel,
      canPaste: editor.canPaste,
      wiring: editor.isWiring,
      highlight: editor.highlight,
    };
  });
  const hint = $derived(
    view.tool === 'place'
      ? `Clic per posare «${view.ghost?.symbol.name ?? ''}» · R ruota · M specchia · Esc per finire.`
      : view.tool === 'wire'
        ? view.wiring
          ? 'Clic su un terminale o un filo per finire · clic nel vuoto fissa una piega · Backspace la toglie · Esc annulla.'
          : 'Clic su un terminale, una giunzione o un filo per iniziare · Esc per tornare a Seleziona.'
        : view.highlight
          ? `Potenziale: ${view.highlight.wires} fili su ${view.highlight.sheets} ${view.highlight.sheets === 1 ? 'foglio' : 'fogli'} · trascina le maniglie per spostare i tratti o ricollegare i capi.`
          : view.count
            ? `${view.count} selezionati · trascina per spostare · R ruota · M specchia · Canc elimina · Ctrl+C/V copia.`
            : 'Scegli un simbolo dalla libreria · W o clic su un terminale libero per un filo · trascina su area vuota per selezionare.',
  );

  // Symbol changed in the library while the project has another version (E4).
  let versionDialog: HTMLDialogElement;
  let versionName = $state('');
  let answerVersion: ((choice: 'update' | 'keep' | 'cancel') => void) | undefined;

  function askVersion(name: string): Promise<'update' | 'keep' | 'cancel'> {
    versionName = name;
    versionDialog.showModal();
    return new Promise((resolve) => (answerVersion = resolve));
  }

  function chooseVersion(choice: 'update' | 'keep' | 'cancel') {
    versionDialog.close();
    answerVersion?.(choice);
    answerVersion = undefined;
  }

  async function placeFromLibrary(item: LibraryItem) {
    const fromLibrary = item.symbol;
    const inProject: SymbolDef | undefined = editor.doc.symbols[fromLibrary.id];
    if (!inProject || sameSymbol(inProject, fromLibrary)) {
      editor.startPlacing(fromLibrary);
      return;
    }
    const choice = await askVersion(fromLibrary.name);
    if (choice === 'update') editor.startPlacing(fromLibrary);
    else if (choice === 'keep') editor.startPlacing(inProject);
  }

  function showError() {
    if (editor.lastError) notice = { kind: 'error', lines: [editor.lastError] };
  }

  function onkey(e: KeyboardEvent) {
    if (!active) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (canvas?.key(e)) {
      e.preventDefault();
      return;
    }
    if (e.type !== 'keydown') return;
    if (editor.key(e.key, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })) {
      e.preventDefault();
      showError();
    }
  }

  function newProject() {
    if (!confirm('Iniziare un nuovo progetto? Quello aperto verrà sostituito.')) return;
    store.reset(createEmptyProject('Nuovo progetto'));
    canvas?.fit();
  }

  async function exportSvg() {
    const bytes = new Uint8Array(await (await fetch(fontUrl)).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const css = `@font-face { font-family: ${FONT_FAMILY}; src: url(data:font/woff;base64,${btoa(binary)}) format('woff'); }`;
    const sheet = editor.doc.sheets[editor.sheetId]!;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([toSvgString(buildScene(editor.doc, editor.sheetId), { css })], {
        type: 'image/svg+xml',
      }),
    );
    link.download = `${sheet.title || 'foglio'}.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
</script>

<svelte:window onkeydown={onkey} onkeyup={onkey} />

<div class="workspace">
  <aside class="library">
    <h3>Libreria</h3>
    {#if library.error}<p class="notice error">{library.error}</p>{/if}
    <LibraryPanel
      items={library.items}
      currentId={view.ghost?.symbol.id}
      onopen={placeFromLibrary}
      onfavorite={(item) => library.setFavorite(item.symbol.id, !item.favorite)}
      onremove={(item) => {
        if (confirm(`Eliminare «${item.symbol.name}» dalla libreria?`)) {
          void library.remove(item.symbol.id);
        }
      }}
    />
  </aside>

  <section class="center">
    <div class="toolbar" role="toolbar" aria-label="Strumenti">
      <strong class="title" title="Titolo del progetto (modificabile nel pannello a destra)"
        >{view.title || '(senza titolo)'}</strong
      >
      <span class="save" class:pending={saveState === 'pending'}>
        {saveState === 'off'
          ? 'Salvataggio non disponibile'
          : saveState === 'pending'
            ? 'Salvataggio…'
            : 'Salvato nel browser'}
      </span>
      <span class="sep"></span>
      <button
        class:active={view.tool === 'select'}
        title="Seleziona (S)"
        onclick={() => editor.setTool('select')}>⬚ Seleziona</button
      >
      <button
        class:active={view.tool === 'wire'}
        title="Filo (W)"
        onclick={() => editor.setTool('wire')}>⌐ Filo</button
      >
      <span class="sep"></span>
      <button
        title={view.undo ? `Annulla: ${view.undo} (Ctrl+Z)` : 'Annulla'}
        disabled={!view.undo}
        onclick={() => editor.undo()}>↶</button
      >
      <button
        title={view.redo ? `Ripeti: ${view.redo} (Ctrl+Y)` : 'Ripeti'}
        disabled={!view.redo}
        onclick={() => editor.redo()}>↷</button
      >
      <span class="sep"></span>
      <button title="Riduci (−)" onclick={() => canvas?.zoom(1 / 1.2)}>−</button>
      <button title="Ingrandisci (+)" onclick={() => canvas?.zoom(1.2)}>+</button>
      <button title="Adatta al foglio (0)" onclick={() => canvas?.fit()}>Adatta</button>
      <label class="check"><input type="checkbox" bind:checked={showGrid} /> Griglia</label>
      <span class="spacer"></span>
      <button onclick={exportSvg}>Esporta SVG</button>
      <button onclick={newProject}>Nuovo progetto</button>
    </div>
    {#if notice}
      <div class="notice {notice.kind}">
        <ul>
          {#each notice.lines as line, i (i)}<li>{line}</li>{/each}
        </ul>
        <button class="close" title="Chiudi" onclick={() => (notice = undefined)}>×</button>
      </div>
    {/if}
    <div class="canvas">
      <SchematicCanvas
        bind:this={canvas}
        {editor}
        {version}
        {showGrid}
        onview={(s) => (scale = s)}
        ondblelement={() => properties?.focusLabel()}
      />
    </div>
    <footer>
      <SheetTabs {editor} {version} />
      <span class="coords">
        {#if view.cursor}X {view.cursor.x} · Y {view.cursor.y} mm{/if}
      </span>
      <span class="zoom">{Math.round(scale * 100) / 100} px/mm</span>
      <span class="hint">{hint}</span>
    </footer>
  </section>

  <aside class="side">
    <SchemaProperties bind:this={properties} {editor} {version} />
  </aside>
</div>

<dialog bind:this={versionDialog} oncancel={() => chooseVersion('cancel')}>
  <p>
    Il simbolo «{versionName}» nella libreria è diverso dalla versione già usata in questo progetto.
  </p>
  <div class="dialog-actions">
    <button onclick={() => chooseVersion('update')}>Aggiorna tutte le copie nel progetto</button>
    <button onclick={() => chooseVersion('keep')}>Usa la versione del progetto</button>
    <button onclick={() => chooseVersion('cancel')}>Annulla</button>
  </div>
</dialog>

<style>
  .workspace {
    display: grid;
    grid-template-columns: 250px 1fr 280px;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
  }
  aside {
    background: var(--panel);
    overflow-y: auto;
  }
  .library {
    border-right: 1px solid var(--border);
    padding: 0 0.75rem;
  }
  .side {
    border-left: 1px solid var(--border);
  }
  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 0.95rem;
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
  .title {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .save {
    color: var(--muted);
    font-size: 0.8rem;
    margin-left: 0.4rem;
  }
  .save.pending {
    color: var(--warning);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.85rem;
    margin-left: 0.4rem;
  }
  .sep {
    width: 1px;
    height: 1.4rem;
    background: var(--border);
    margin: 0 0.3rem;
  }
  .spacer {
    flex: 1;
  }
  .canvas {
    flex: 1;
    min-height: 0;
  }
  footer {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    padding: 0 0.75rem 0.3rem;
    background: var(--panel);
    border-top: 1px solid var(--border);
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
  }
  footer > span {
    padding-top: 0.25rem;
  }
  .coords {
    min-width: 9rem;
    font-variant-numeric: tabular-nums;
  }
  .zoom {
    color: var(--muted);
  }
  .hint {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
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
    max-width: 30rem;
  }
  .dialog-actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
</style>

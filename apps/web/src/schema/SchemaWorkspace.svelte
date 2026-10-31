<script lang="ts">
  import { onMount } from 'svelte';
  import {
    countLocked,
    createEmptyProject,
    createStore,
    linkedReport,
    masterOf,
    numberingConflicts,
    renumber,
  } from '@cablewire/core';
  import type { ElementId, SheetId, SymbolDef, SymbolId } from '@cablewire/core';
  import { parseItemKey, SchematicEditor } from '@cablewire/editor';
  import { fontCss, pngSize, safeFileName, sheetSvg, svgToPng } from '../files/export.ts';
  import { download } from '../files/fileAccess.ts';
  import { buildPdf } from '../files/pdf.ts';
  import { printSheets } from '../files/print.ts';
  import { ProjectFiles } from '../files/projectFiles.svelte.ts';
  import type { Library } from '../library/library.svelte.ts';
  import LibraryPanel from '../library/LibraryPanel.svelte';
  import { sameSymbol } from '../library/logic.ts';
  import type { LibraryItem } from '../library/logic.ts';
  import { ProjectAutosave } from './autosave.ts';
  import ConflictsPanel from './ConflictsPanel.svelte';
  import SchematicCanvas from './SchematicCanvas.svelte';
  import SchemaProperties from './SchemaProperties.svelte';
  import { loadSheetFormat } from './sheetFormat.ts';
  import SheetTabs from './SheetTabs.svelte';

  let { active, library }: { active: boolean; library: Library } = $props();

  const store = createStore(createEmptyProject('Nuovo progetto', undefined, loadSheetFormat()));
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
          await files.restore();
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
    // An open file with changes not saved to disk: ask before leaving.
    const beforeunload = (e: BeforeUnloadEvent) => {
      if (files.file && files.dirty(store.doc)) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeunload);
    // Close menus on a click elsewhere.
    const closeMenus = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu')) {
        menu = undefined;
        renumberMenu = false;
      }
    };
    window.addEventListener('click', closeMenus);
    return () => {
      unsubscribe();
      unwatch();
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('beforeunload', beforeunload);
      window.removeEventListener('click', closeMenus);
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

  // Last 3 symbols chosen from the library, for this session only.
  let recentIds = $state.raw<SymbolId[]>([]);
  const recent = $derived(recentIds.flatMap((id) => library.find(id) ?? []));

  async function placeFromLibrary(item: LibraryItem) {
    const fromLibrary = item.symbol;
    recentIds = [fromLibrary.id, ...recentIds.filter((id) => id !== fromLibrary.id)].slice(0, 3);
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
    if (fileShortcut(e)) {
      e.preventDefault();
      return;
    }
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

  let renumberMenu = $state(false);
  let showConflicts = $state(false);
  const conflicts = $derived.by(() => {
    void version;
    return numberingConflicts(editor.doc);
  });

  /**
   * Double click: a linked sheet reference jumps to its partner, a linked contact to
   * its coil; anything else edits the label.
   */
  function dblElement(key: string) {
    const item = parseItemKey(key);
    const element =
      item?.kind === 'element' ? editor.doc.elements[item.id as ElementId] : undefined;
    const partner = element && (linkedReport(editor.doc, element) ?? masterOf(editor.doc, element));
    if (!partner) {
      void properties?.focusLabel();
      return;
    }
    editor.setSheet(partner.sheetId);
    editor.select([`element:${partner.id}`]);
  }

  function recalc(sheetId: SheetId | undefined) {
    renumberMenu = false;
    const before = store.undoLabel;
    const result = store.run(renumber, sheetId === undefined ? {} : { sheetId });
    if (!result.ok) {
      notice = { kind: 'error', lines: [result.error.message] };
      return;
    }
    const lines = [
      store.undoLabel === before
        ? 'La numerazione è già in ordine: nessun numero cambiato.'
        : 'Numerazione ricalcolata.',
    ];
    // Numbers typed by hand are kept on purpose: say so, or it looks like a bug.
    const locked = countLocked(store.doc, sheetId);
    if (locked) {
      lines.push(
        `${locked} ${locked === 1 ? 'numero bloccato non è stato modificato' : 'numeri bloccati non sono stati modificati'}: sbloccali con il pulsante «Bloccato» nel pannello del filo, o cancellane il numero, per ricalcolarli.`,
      );
    }
    notice = { kind: 'info', lines };
  }

  // Project file on disk (open/save) and its "changed since saved" state.
  const files = new ProjectFiles(store, (kind, lines) => (notice = { kind, lines }));
  const dirty = $derived.by(() => {
    void version;
    return files.dirty(store.doc);
  });
  let menu = $state<'file' | 'export' | undefined>();

  /** Asks before throwing away changes not saved to disk (the browser copy is replaced too). */
  function confirmDiscard(): boolean {
    const empty = Object.keys(store.doc.elements).length === 0;
    return (
      !dirty ||
      (empty && !files.file) ||
      confirm('Le modifiche al progetto non sono salvate su disco. Continuare?')
    );
  }

  async function fileAction(action: 'new' | 'open' | 'save' | 'saveAs') {
    menu = undefined;
    if ((action === 'new' || action === 'open') && !confirmDiscard()) return;
    if (action === 'new') files.newProject();
    else if (action === 'open') await files.open();
    else if (action === 'save') await files.save();
    else await files.saveAs();
    canvas?.fit();
  }

  async function exportSheet(format: 'svg' | 'png', dpi = 150) {
    menu = undefined;
    const doc = editor.doc;
    const sheet = doc.sheets[editor.sheetId]!;
    const svg = sheetSvg(doc, sheet.id, await fontCss());
    const name = safeFileName(`${doc.meta.title} - ${sheet.title}`, `.${format}`, 'foglio');
    if (format === 'svg') {
      download(name, new Blob([svg], { type: 'image/svg+xml' }));
      return;
    }
    const { width, height } = pngSize(sheet, dpi);
    try {
      download(name, await svgToPng(svg, width, height));
    } catch (e) {
      notice = { kind: 'error', lines: ['PNG non creato.', String((e as Error).message ?? e)] };
    }
  }

  /** PDF with one page per sheet; linked sheet references become links. */
  async function exportPdf(all: boolean) {
    menu = undefined;
    const doc = store.doc;
    const sheets = all ? doc.sheetOrder : [editor.sheetId];
    const sheetTitle = doc.sheets[editor.sheetId]!.title;
    const name = all
      ? safeFileName(doc.meta.title, '.pdf')
      : safeFileName(`${doc.meta.title} - ${sheetTitle}`, '.pdf', 'foglio');
    notice = { kind: 'info', lines: ['Creazione del PDF…'] };
    try {
      download(name, await buildPdf(doc, sheets));
      notice = undefined;
    } catch (e) {
      notice = { kind: 'error', lines: ['PDF non creato.', String((e as Error).message ?? e)] };
    }
  }

  async function print(all: boolean) {
    menu = undefined;
    const sheets = all ? store.doc.sheetOrder : [editor.sheetId];
    printSheets(store.doc, sheets, await fontCss());
  }

  /** File shortcuts work even while typing in a field. */
  function fileShortcut(e: KeyboardEvent): boolean {
    if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey)) return false;
    const k = e.key.toLowerCase();
    if (k === 's') void fileAction(e.shiftKey ? 'saveAs' : 'save');
    else if (k === 'o') void fileAction('open');
    else if (k === 'p') void print(true);
    else return false;
    (document.activeElement as HTMLElement | null)?.blur();
    return true;
  }
</script>

<svelte:window onkeydown={onkey} onkeyup={onkey} />

<div class="workspace">
  <aside class="library">
    <h3>Libreria</h3>
    {#if library.error}<p class="notice error">{library.error}</p>{/if}
    <LibraryPanel
      items={library.items}
      {recent}
      currentId={view.ghost?.symbol.id}
      onopen={placeFromLibrary}
      onfavorite={(item) => library.setFavorite(item.symbol.id, !item.favorite)}
      onremove={(item) => {
        const question = item.modified
          ? `Ripristinare «${item.symbol.name}» com'era in origine? La tua versione andrà persa.`
          : `Eliminare «${item.symbol.name}» dalla libreria?`;
        if (confirm(question)) void library.remove(item.symbol.id);
      }}
    />
  </aside>

  <section class="center">
    <div class="toolbar" role="toolbar" aria-label="Strumenti">
      <strong class="title" title="Titolo del progetto (modificabile nel pannello a destra)"
        >{view.title || '(senza titolo)'}</strong
      >
      <span
        class="file"
        class:dirty
        title={dirty
          ? 'Modifiche non salvate su disco (una copia è comunque salvata nel browser)'
          : 'Salvato su disco'}
        >{files.file ? files.file.name : 'non salvato su disco'}{dirty ? ' •' : ''}</span
      >
      <span class="save" class:pending={saveState === 'pending'}>
        {saveState === 'off'
          ? 'copia nel browser non disponibile'
          : saveState === 'pending'
            ? 'copia nel browser…'
            : 'copia nel browser ✓'}
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
      <span class="sep"></span>
      <div class="menu">
        <button
          title="Rifà i numeri dei fili in ordine di lettura, chiudendo i buchi (i numeri bloccati restano)"
          onclick={() => (renumberMenu = !renumberMenu)}>Ricalcola numerazione ▾</button
        >
        {#if renumberMenu}
          <div class="menu-items">
            <button onclick={() => recalc(editor.sheetId)}>Foglio corrente</button>
            <button onclick={() => recalc(undefined)}>Tutto il progetto</button>
          </div>
        {/if}
      </div>
      {#if conflicts.length}
        <button
          class="warn"
          title="Potenziali con più numeri possibili: scegli quello giusto"
          onclick={() => (showConflicts = !showConflicts)}
          >⚠ {conflicts.length} {conflicts.length === 1 ? 'conflitto' : 'conflitti'}</button
        >
      {/if}
      <span class="spacer"></span>
      <div class="menu">
        <button onclick={() => (menu = menu === 'file' ? undefined : 'file')}>File ▾</button>
        {#if menu === 'file'}
          <div class="menu-items right">
            <button onclick={() => fileAction('new')}>Nuovo progetto</button>
            <button onclick={() => fileAction('open')}>Apri… <kbd>Ctrl+O</kbd></button>
            <button onclick={() => fileAction('save')}
              >{files.writeInPlace ? 'Salva' : 'Salva (scarica)'} <kbd>Ctrl+S</kbd></button
            >
            <button onclick={() => fileAction('saveAs')}
              >Salva con nome… <kbd>Ctrl+Maiusc+S</kbd></button
            >
            {#if files.recent.length}
              <div class="menu-label">Recenti</div>
              {#each files.recent as r (r.name)}
                <button
                  onclick={() => {
                    menu = undefined;
                    if (confirmDiscard()) void files.openRecent(r).then(() => canvas?.fit());
                  }}>{r.name}</button
                >
              {/each}
            {/if}
          </div>
        {/if}
      </div>
      <div class="menu">
        <button onclick={() => (menu = menu === 'export' ? undefined : 'export')}>Esporta ▾</button>
        {#if menu === 'export'}
          <div class="menu-items right">
            <button onclick={() => exportSheet('svg')}>Foglio corrente in SVG</button>
            <button onclick={() => exportSheet('png', 150)}>Foglio corrente in PNG (150 dpi)</button
            >
            <button onclick={() => exportSheet('png', 300)}>Foglio corrente in PNG (300 dpi)</button
            >
            <div class="menu-label">PDF</div>
            <button onclick={() => exportPdf(true)}
              >PDF di tutti i fogli (con i rimandi cliccabili)</button
            >
            <button onclick={() => exportPdf(false)}>PDF del foglio corrente</button>
            <div class="menu-label">Stampa</div>
            <button onclick={() => print(false)}>Stampa il foglio corrente…</button>
            <button onclick={() => print(true)}>Stampa tutti i fogli… <kbd>Ctrl+P</kbd></button>
          </div>
        {/if}
      </div>
    </div>
    {#if showConflicts && conflicts.length}
      <ConflictsPanel {editor} {conflicts} onclose={() => (showConflicts = false)} />
    {/if}
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
        ondblelement={dblElement}
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
  .menu {
    position: relative;
  }
  .toolbar button.warn {
    color: var(--warning);
    border-color: var(--warning);
    background: #fff8e6;
  }
  .menu-items {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
  }
  .menu-items button {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    text-align: left;
    border-radius: 0;
    padding: 0.35rem 0.6rem;
    white-space: nowrap;
  }
  .menu-items.right {
    left: auto;
    right: 0;
  }
  .menu-label {
    padding: 0.35rem 0.6rem 0.15rem;
    font-size: 0.75rem;
    color: var(--muted);
    border-top: 1px solid var(--border);
  }
  kbd {
    font-family: inherit;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .file {
    color: var(--muted);
    font-size: 0.8rem;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file.dirty {
    color: var(--warning);
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

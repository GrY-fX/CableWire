<script lang="ts">
  import { addSheet, moveSheet, newId, removeSheet, updateSheet } from '@cablewire/core';
  import type { SheetId } from '@cablewire/core';
  import type { SchematicEditor } from '@cablewire/editor';
  import { loadSheetFormat } from './sheetFormat.ts';

  let { editor, version }: { editor: SchematicEditor; version: number } = $props();

  const sheets = $derived.by(() => {
    void version;
    const doc = editor.doc;
    return doc.sheetOrder.map((id, i) => ({ id, index: i + 1, title: doc.sheets[id]!.title }));
  });
  const current = $derived.by(() => {
    void version;
    return editor.sheetId;
  });

  let editing = $state<SheetId | undefined>();
  let dragged: SheetId | undefined;

  function add() {
    const id = newId<'sheet'>() as SheetId;
    const result = editor.store.run(addSheet, {
      id,
      index: editor.doc.sheetOrder.indexOf(editor.sheetId) + 1,
      format: loadSheetFormat(),
    });
    if (result.ok) editor.setSheet(id);
  }

  function rename(id: SheetId, title: string) {
    editing = undefined;
    if (title.trim() && title !== editor.doc.sheets[id]?.title) {
      editor.store.run(updateSheet, { id, set: { title: title.trim() } });
    }
  }

  function remove(id: SheetId, title: string) {
    if (editor.doc.sheetOrder.length <= 1) return;
    if (!confirm(`Eliminare il foglio «${title}» con tutto il suo contenuto?`)) return;
    editor.store.run(removeSheet, { id });
  }

  function drop(target: SheetId) {
    if (dragged && dragged !== target) {
      editor.store.run(moveSheet, { id: dragged, index: editor.doc.sheetOrder.indexOf(target) });
    }
    dragged = undefined;
  }

  // Focus and select the title when renaming starts.
  const select = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };
</script>

<div class="tabs" role="tablist" aria-label="Fogli">
  {#each sheets as sheet (sheet.id)}
    <div
      class="tab"
      class:active={sheet.id === current}
      role="tab"
      tabindex="0"
      aria-selected={sheet.id === current}
      draggable={editing !== sheet.id}
      ondragstart={() => (dragged = sheet.id)}
      ondragover={(e) => e.preventDefault()}
      ondrop={() => drop(sheet.id)}
      onclick={() => editor.setSheet(sheet.id)}
      ondblclick={() => (editing = sheet.id)}
      onkeydown={(e) => e.key === 'Enter' && editor.setSheet(sheet.id)}
      title="Doppio clic per rinominare, trascina per riordinare"
    >
      <span class="num">{sheet.index}</span>
      {#if editing === sheet.id}
        <input
          value={sheet.title}
          use:select
          onblur={(e) => rename(sheet.id, e.currentTarget.value)}
          onkeydown={(e) => {
            if (e.key === 'Enter') rename(sheet.id, e.currentTarget.value);
            if (e.key === 'Escape') editing = undefined;
            e.stopPropagation();
          }}
        />
      {:else}
        <span class="title">{sheet.title}</span>
      {/if}
      {#if sheets.length > 1 && sheet.id === current}
        <button
          class="close"
          title="Elimina foglio"
          onclick={(e) => {
            e.stopPropagation();
            remove(sheet.id, sheet.title);
          }}>×</button
        >
      {/if}
    </div>
  {/each}
  <button class="add" title="Aggiungi foglio" onclick={add}>+</button>
</div>

<style>
  .tabs {
    display: flex;
    align-items: stretch;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
    flex: none;
    max-width: 50%;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.6rem;
    background: #f1f3f5;
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 4px 4px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 0.85rem;
  }
  .tab.active {
    background: #fff;
    font-weight: 600;
    border-color: var(--accent);
  }
  .num {
    color: var(--muted);
    font-weight: normal;
  }
  input {
    width: 8rem;
    font-size: 0.85rem;
  }
  .close,
  .add {
    border: none;
    background: none;
    cursor: pointer;
    color: var(--muted);
    padding: 0 0.2rem;
  }
  .add {
    font-size: 1.1rem;
    padding: 0 0.5rem;
  }
</style>

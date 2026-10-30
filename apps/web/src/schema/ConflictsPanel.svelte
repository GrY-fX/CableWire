<script lang="ts">
  import { setPotentialNumber, SOURCE_NAMES } from '@cablewire/core';
  import type { NumberingConflict } from '@cablewire/core';
  import type { SchematicEditor } from '@cablewire/editor';

  let {
    editor,
    conflicts,
    onclose,
  }: { editor: SchematicEditor; conflicts: NumberingConflict[]; onclose: () => void } = $props();

  const sheetIndex = (c: NumberingConflict) => editor.doc.sheetOrder.indexOf(c.sheet) + 1;

  function show(c: NumberingConflict) {
    editor.setSheet(c.sheet);
    editor.select([`wire:${c.wire}`]);
  }

  /** The chosen number is locked, so the conflict does not come back. */
  function choose(c: NumberingConflict, number: string) {
    editor.store.run(setPotentialNumber, { id: c.wire, number });
  }

  function other(c: NumberingConflict) {
    const value = prompt('Numero per questo potenziale:', c.current ?? '')?.trim();
    if (value) choose(c, value);
  }
</script>

<div class="conflicts">
  <div class="head">
    <strong>Conflitti di numerazione ({conflicts.length})</strong>
    <span class="hint">Scegli il numero giusto: diventa bloccato e il conflitto sparisce.</span>
    <button class="close" title="Chiudi" onclick={onclose}>×</button>
  </div>
  <ul>
    {#each conflicts as c (c.wire)}
      <li>
        <button class="where" title="Mostra il potenziale" onclick={() => show(c)}>
          Foglio {sheetIndex(c)} · ora «{c.current ?? '—'}»
        </button>
        <span class="why">
          {c.kind === 'join'
            ? 'potenziali uniti con numeri diversi'
            : `${SOURCE_NAMES[c.source!]} diversi`}:
        </span>
        {#each c.candidates as candidate (candidate.value)}
          <button
            class="choice"
            class:current={candidate.value === c.current}
            onclick={() => choose(c, candidate.value)}
            >{candidate.value}{candidate.from && candidate.from !== candidate.value
              ? ` (${candidate.from})`
              : ''}</button
          >
        {/each}
        <button class="choice" onclick={() => other(c)}>Altro…</button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .conflicts {
    max-height: 30vh;
    overflow-y: auto;
    padding: 0.4rem 0.75rem;
    background: #fff8e6;
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  .hint {
    color: var(--muted);
    flex: 1;
  }
  .close {
    border: none;
    background: none;
    font-size: 1rem;
    cursor: pointer;
  }
  ul {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0;
  }
  .where {
    border: none;
    background: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
  }
  .why {
    color: var(--warning);
  }
  .choice {
    padding: 0.05rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
  }
  .choice.current {
    border-color: var(--warning);
  }
</style>

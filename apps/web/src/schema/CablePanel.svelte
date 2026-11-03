<script lang="ts">
  import {
    addConductor,
    cableFormation,
    cableSheets,
    removeCables,
    removeConductor,
    setConductor,
    updateCable,
    WIRE_COLORS,
    wireColor,
  } from '@cablewire/core';
  import type { Cable, Command, WireId } from '@cablewire/core';
  import type { SchematicEditor } from '@cablewire/editor';

  let { editor, cable }: { editor: SchematicEditor; cable: Cable } = $props();

  let error = $state<string | undefined>();
  function run<A>(command: Command<A>, args: A) {
    const result = editor.store.run(command, args);
    error = result.ok ? undefined : result.error.message;
  }
  const text = (e: Event) => (e.currentTarget as HTMLInputElement).value.trim();

  const doc = $derived(editor.doc);
  const sheets = $derived(cableSheets(doc, cable).map((s) => doc.sheetOrder.indexOf(s) + 1));
  const swatch = (code: string) => wireColor(code)?.css;

  /** Shows a conductor's wire: its sheet, with the wire selected. */
  function goToWire(id: WireId) {
    const wire = doc.wires[id];
    if (!wire) return;
    editor.setSheet(wire.sheetId);
    editor.select([`wire:${id}`]);
  }
</script>

<h3>Cavo {cable.label}</h3>
<div class="grid">
  <label
    >Sigla
    <input
      type="text"
      value={cable.label}
      onchange={(e) => run(updateCable, { id: cable.id, set: { label: text(e) } })}
    />
  </label>
  <label
    >Tipo
    <input
      type="text"
      value={cable.type ?? ''}
      placeholder="es. FG16OR16"
      onchange={(e) => run(updateCable, { id: cable.id, set: { type: text(e) || undefined } })}
    />
  </label>
  <label
    >Sezione (mm²)
    <input
      type="text"
      value={cable.section ?? ''}
      placeholder="es. 2,5"
      onchange={(e) => run(updateCable, { id: cable.id, set: { section: text(e) || undefined } })}
    />
  </label>
  <label
    >Lunghezza (m)
    <input
      type="number"
      min="0"
      step="0.5"
      value={cable.length ?? ''}
      onchange={(e) => {
        const v = text(e);
        run(updateCable, { id: cable.id, set: { length: v ? Math.max(0, Number(v)) : undefined } });
      }}
    />
  </label>
  <label class="check wide"
    ><input
      type="checkbox"
      checked={!!cable.numbered}
      onchange={(e) =>
        run(updateCable, {
          id: cable.id,
          set: { numbered: e.currentTarget.checked || undefined },
        })}
    /> Conduttori numerati</label
  >
</div>
<p class="hint">
  Formazione: <strong>{cableFormation(cable) || '—'}</strong>
  {#if sheets.length}· {sheets.length === 1 ? 'foglio' : 'fogli'} {sheets.join(', ')}{/if}
</p>

<h4>Conduttori ({cable.conductors.length})</h4>
<table>
  <thead>
    <tr><th>Conduttore</th><th>Filo</th><th></th></tr>
  </thead>
  <tbody>
    {#each cable.conductors as c (c.id)}
      {@const wire = c.wire ? doc.wires[c.wire] : undefined}
      <tr>
        <td class="code">
          {#if swatch(c.code)}<span class="swatch" style:background={swatch(c.code)}></span>{/if}
          <input
            type="text"
            list="conductor-codes"
            value={c.code}
            aria-label="Colore o numero del conduttore"
            onchange={(e) => run(setConductor, { cable: cable.id, conductor: c.id, code: text(e) })}
          />
        </td>
        <td>
          {#if wire}
            <button class="link" title="Vai al filo" onclick={() => goToWire(wire.id)}
              >{wire.props.number || 'senza numero'} · f. {doc.sheetOrder.indexOf(wire.sheetId) +
                1}</button
            >
          {:else}
            <span class="spare">libero</span>
          {/if}
        </td>
        <td class="row-actions">
          {#if wire}
            <button
              class="icon"
              title="Togli il filo dal cavo (il conduttore resta libero)"
              onclick={() => run(setConductor, { cable: cable.id, conductor: c.id, wire: null })}
              >⇥</button
            >
          {/if}
          <button
            class="icon"
            title="Elimina il conduttore"
            onclick={() => run(removeConductor, { cable: cable.id, conductor: c.id })}>×</button
          >
        </td>
      </tr>
    {/each}
  </tbody>
</table>
<datalist id="conductor-codes">
  {#each WIRE_COLORS as w (w.code)}<option value={w.code}>{w.name}</option>{/each}
</datalist>
<div class="actions">
  <button onclick={() => run(addConductor, { cable: cable.id })}>+ Conduttore libero</button>
  <button
    class="danger"
    onclick={() => {
      if (confirm(`Eliminare il cavo ${cable.label}? I fili restano.`))
        run(removeCables, { ids: [cable.id] });
    }}>Elimina cavo</button
  >
</div>
{#if error}<p class="error">{error}</p>{/if}
<p class="hint">
  Trascina il segno sullo schema per spostarlo lungo i fili. Per aggiungere fili: selezionali
  insieme e scegli il cavo nella scheda Selezione.
</p>

<style>
  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 0.95rem;
  }
  h4 {
    margin: 0.9rem 0 0.25rem;
    font-size: 0.85rem;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem 0.6rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
    color: inherit;
  }
  label.check input {
    width: auto;
  }
  .wide {
    grid-column: 1 / -1;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: #1d2329;
    background: #fff;
    font: inherit;
    font-size: 0.85rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    padding: 0.15rem 0.2rem;
  }
  td {
    padding: 0.15rem 0.2rem;
    border-bottom: 1px solid #eef0f2;
  }
  td.code {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  td.code input {
    width: 4.5rem;
  }
  .swatch {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
    border: 1px solid #8888;
    flex: none;
  }
  .spare {
    color: var(--muted);
    font-style: italic;
  }
  .row-actions {
    text-align: right;
    white-space: nowrap;
  }
  .icon {
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
    margin: 0.5rem 0;
  }
  .danger {
    color: var(--error);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .error {
    color: var(--error);
    font-size: 0.8rem;
    margin: 0;
  }
</style>

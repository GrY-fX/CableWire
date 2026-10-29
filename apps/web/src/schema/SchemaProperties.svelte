<script lang="ts">
  import { tick } from 'svelte';
  import {
    setElementInfo,
    setPotentialNumber,
    setWireProps,
    updateProjectMeta,
    updateSheet,
  } from '@cablewire/core';
  import type { ElementId, SheetSize, WireId } from '@cablewire/core';
  import { parseItemKey } from '@cablewire/editor';
  import type { SchematicEditor } from '@cablewire/editor';

  let { editor, version }: { editor: SchematicEditor; version: number } = $props();

  const view = $derived.by(() => {
    void version;
    const doc = editor.doc;
    const keys = [...editor.selection];
    const single = keys.length === 1 ? parseItemKey(keys[0]!) : undefined;
    const element = single?.kind === 'element' ? doc.elements[single.id as ElementId] : undefined;
    const wire = single?.kind === 'wire' ? doc.wires[single.id as WireId] : undefined;
    return {
      doc,
      count: keys.length,
      element,
      symbol: element ? doc.symbols[element.symbolId] : undefined,
      wire,
      highlight: wire ? editor.highlight : undefined,
      sheet: doc.sheets[editor.sheetId]!,
    };
  });

  /** Common fields first, in this order, then any other field of the element. */
  const FIELDS: [string, string][] = [
    ['label', 'Sigla'],
    ['function', 'Funzione'],
    ['location', 'Posizione (+)'],
    ['plc_address', 'Indirizzo PLC'],
  ];
  const fields = $derived.by(() => {
    const info = view.element?.info ?? {};
    const known = new Set(FIELDS.map(([k]) => k));
    return [
      ...FIELDS,
      ...Object.keys(info)
        .filter((k) => !known.has(k))
        .map((k): [string, string] => [k, k]),
    ];
  });

  const SIZES: SheetSize[] = ['A4', 'A3', 'A2', 'A1', 'A0'];
  const text = (e: Event) => (e.currentTarget as HTMLInputElement).value;
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);

  function setInfo(key: string, value: string) {
    const element = view.element;
    if (!element) return;
    editor.store.run(setElementInfo, { id: element.id, set: { [key]: value || undefined } });
  }

  function addField() {
    const name = prompt('Nome del nuovo campo (es. costruttore, codice):')?.trim();
    if (name && view.element) setInfo(name.replace(/\s+/g, '_'), '-');
  }

  let labelInput: HTMLInputElement | undefined = $state();
  /** Puts the cursor in the label field (double click on an element). */
  export async function focusLabel() {
    await tick();
    labelInput?.focus();
    labelInput?.select();
  }
</script>

<div class="panel">
  {#if view.element && view.symbol}
    <h3>{view.symbol.name}</h3>
    <div class="grid">
      {#each fields as [key, label] (key)}
        <label class="wide"
          >{label}
          {#if key === 'label'}
            <input
              bind:this={labelInput}
              type="text"
              value={view.element.info[key] ?? ''}
              onchange={(e) => setInfo(key, text(e))}
            />
          {:else}
            <input
              type="text"
              value={view.element.info[key] ?? ''}
              onchange={(e) => setInfo(key, text(e))}
            />
          {/if}
        </label>
      {/each}
    </div>
    <button class="link" onclick={addField}>+ Aggiungi campo</button>
    <p class="hint">
      Posizione ({view.element.x}, {view.element.y}) mm · rotazione {view.element.rotation}°{view
        .element.mirrored
        ? ' · specchiato'
        : ''}. R ruota, M specchia.
    </p>
  {:else if view.wire}
    <h3>Filo</h3>
    {#if view.highlight}
      <p class="hint">
        Potenziale evidenziato: {view.highlight.wires} fili su {view.highlight.sheets}
        {view.highlight.sheets === 1 ? 'foglio' : 'fogli'}.
      </p>
    {/if}
    <button class="link" onclick={() => editor.rerouteSelectedWire()}>Ricalcola percorso</button>
    <div class="grid">
      <label class="wide"
        >Numero (vale per tutto il potenziale) <input
          type="text"
          value={view.wire.props.number ?? ''}
          onchange={(e) =>
            editor.store.run(setPotentialNumber, { id: view.wire!.id, number: text(e) })}
        /></label
      >
      <label
        >Sezione (mm²) <input
          type="text"
          value={view.wire.props.section ?? ''}
          onchange={(e) =>
            editor.store.run(setWireProps, {
              id: view.wire!.id,
              set: { section: text(e) || undefined },
            })}
        /></label
      >
      <label
        >Colore <input
          type="text"
          value={view.wire.props.color ?? ''}
          placeholder="es. BU"
          onchange={(e) =>
            editor.store.run(setWireProps, {
              id: view.wire!.id,
              set: { color: text(e) || undefined },
            })}
        /></label
      >
    </div>
  {:else if view.count > 1}
    <h3>{view.count} oggetti selezionati</h3>
    <p class="hint">R ruota, M specchia, Canc elimina, Ctrl+C copia.</p>
  {:else}
    <h3>Foglio</h3>
    <div class="grid">
      <label class="wide"
        >Titolo <input
          type="text"
          value={view.sheet.title}
          onchange={(e) =>
            editor.store.run(updateSheet, { id: view.sheet.id, set: { title: text(e) } })}
        /></label
      >
      <label
        >Formato
        <select
          value={view.sheet.size}
          onchange={(e) =>
            editor.store.run(updateSheet, {
              id: view.sheet.id,
              set: { size: text(e) as SheetSize },
            })}
        >
          {#each SIZES as s (s)}<option value={s}>{s}</option>{/each}
        </select>
      </label>
      <label
        >Orientamento
        <select
          value={view.sheet.orientation}
          onchange={(e) =>
            editor.store.run(updateSheet, {
              id: view.sheet.id,
              set: { orientation: text(e) as 'landscape' },
            })}
        >
          <option value="landscape">Orizzontale</option>
          <option value="portrait">Verticale</option>
        </select>
      </label>
      <label
        >Colonne <input
          type="number"
          min="1"
          max="40"
          value={view.sheet.cols}
          onchange={(e) =>
            editor.store.run(updateSheet, {
              id: view.sheet.id,
              set: { cols: Math.max(1, num(e)) },
            })}
        /></label
      >
      <label
        >Righe <input
          type="number"
          min="1"
          max="26"
          value={view.sheet.rows}
          onchange={(e) =>
            editor.store.run(updateSheet, {
              id: view.sheet.id,
              set: { rows: Math.max(1, num(e)) },
            })}
        /></label
      >
    </div>
    <h3>Progetto</h3>
    <div class="grid">
      <label class="wide"
        >Titolo <input
          type="text"
          value={view.doc.meta.title}
          onchange={(e) => editor.store.run(updateProjectMeta, { set: { title: text(e) } })}
        /></label
      >
      <label class="wide"
        >Autore <input
          type="text"
          value={view.doc.meta.author}
          onchange={(e) => editor.store.run(updateProjectMeta, { set: { author: text(e) } })}
        /></label
      >
    </div>
  {/if}
</div>

<style>
  .panel {
    padding: 0.25rem 0.75rem 1rem;
  }
  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 0.95rem;
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
  .wide {
    grid-column: 1 / -1;
  }
  input,
  select {
    width: 100%;
    box-sizing: border-box;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: #1d2329;
  }
  .hint {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    padding: 0.3rem 0;
    cursor: pointer;
  }
</style>

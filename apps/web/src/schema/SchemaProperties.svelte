<script lang="ts">
  import { tick } from 'svelte';
  import {
    checkPlcPattern,
    formatPattern,
    formatPlcAddress,
    getNumbering,
    numberOrigin,
    parsePattern,
    SOURCE_NAMES,
    setElementInfo,
    setPotentialLock,
    setPotentialNumber,
    setWireProps,
    updateNumbering,
    updateProjectMeta,
    updateSheet,
  } from '@cablewire/core';
  import type {
    ElementId,
    NumberingSettings,
    NumberSource,
    SheetSize,
    WireId,
  } from '@cablewire/core';
  import { parseItemKey } from '@cablewire/editor';
  import type { SchematicEditor } from '@cablewire/editor';
  import LockIcon from './LockIcon.svelte';

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

  // Numbering settings: the pattern is checked while typing, applied only when valid.
  const numbering = $derived(getNumbering(view.doc));
  let patternDraft = $state<string | undefined>();
  const pattern = $derived(patternDraft ?? numbering.pattern);
  const parsedPattern = $derived(parsePattern(pattern));
  const preview = $derived.by(() => {
    if (!parsedPattern.ok) return '';
    const f = (n: number, sheet: number) =>
      formatPattern(parsedPattern.tokens, { n, sheet, column: 1 });
    const s = numbering.start;
    return `${f(s, 1)}, ${f(s + 1, 1)}, ${f(s + 2, 1)} … foglio 2: ${f(s, 2)}`;
  });
  const PLACEHOLDERS = ['{n}', '{n:2}', '{foglio}', '{colonna}'];

  function setNumbering(set: Partial<NumberingSettings>) {
    const result = editor.store.run(updateNumbering, { set });
    if (result.ok) patternDraft = undefined;
  }

  // PLC card address format, checked while typing like the main pattern.
  let plcDraft = $state<string | undefined>();
  const plcPattern = $derived(plcDraft ?? numbering.plcPattern ?? '{byte}.{morsetto}');
  const plcError = $derived(checkPlcPattern(plcPattern));
  $effect(() => {
    // Forget the draft once the setting matches it (applied or undone).
    if (plcDraft !== undefined && plcDraft === numbering.plcPattern) plcDraft = undefined;
  });

  // Number sources: presets per kind of project, or a custom choice and order.
  const ALL_SOURCES: NumberSource[] = ['plc', 'terminal', 'label'];
  const PRESETS: { id: string; label: string; sources: NumberSource[] }[] = [
    { id: 'plc', label: 'Quadro con PLC', sources: ['plc'] },
    { id: 'electromechanical', label: 'Quadro elettromeccanico', sources: ['terminal'] },
    { id: 'plc-terminal', label: 'PLC e morsettiere', sources: ['plc', 'terminal'] },
    { id: 'counter', label: 'Solo contatore', sources: [] },
  ];
  const preset = $derived(
    PRESETS.find((p) => p.sources.join() === numbering.sources.join())?.id ?? 'custom',
  );
  /** Enabled sources in priority order, then the disabled ones. */
  const sourceRows = $derived([
    ...numbering.sources.map((s) => ({ source: s, enabled: true })),
    ...ALL_SOURCES.filter((s) => !numbering.sources.includes(s)).map((s) => ({
      source: s,
      enabled: false,
    })),
  ]);

  function toggleSource(source: NumberSource, enabled: boolean) {
    const sources = enabled
      ? [...numbering.sources, source]
      : numbering.sources.filter((s) => s !== source);
    setNumbering({ sources });
  }

  function moveSource(index: number, delta: -1 | 1) {
    const sources = [...numbering.sources];
    const target = index + delta;
    if (target < 0 || target >= sources.length) return;
    [sources[index], sources[target]] = [sources[target]!, sources[index]!];
    setNumbering({ sources });
  }

  const origin = $derived.by(() => {
    void version;
    return view.wire ? numberOrigin(view.doc, view.wire.id) : undefined;
  });

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
          >{key === 'plc_address' && view.symbol.kind === 'plc'
            ? 'Byte della scheda (es. I0)'
            : label}
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
    {#if origin}
      <p class="hint">Numero preso da {SOURCE_NAMES[origin.source]} di {origin.from}.</p>
    {/if}
    <button class="link" onclick={() => editor.rerouteSelectedWire()}>Ricalcola percorso</button>
    <div class="grid">
      <label class="wide"
        >Numero (vale per tutto il potenziale)
        <span class="number-row">
          <input
            type="text"
            value={view.wire.props.number ?? ''}
            onchange={(e) =>
              editor.store.run(setPotentialNumber, { id: view.wire!.id, number: text(e) })}
          />
          <button
            class="lock"
            class:locked={view.wire.props.numberLocked}
            disabled={!view.wire.props.number}
            title={view.wire.props.numberLocked
              ? 'Bloccato: il ricalcolo non lo cambia. Clic per sbloccare.'
              : 'Automatico: il ricalcolo può cambiarlo. Clic per bloccare.'}
            onclick={() =>
              editor.store.run(setPotentialLock, {
                id: view.wire!.id,
                locked: !view.wire!.props.numberLocked,
              })}
          >
            <LockIcon locked={!!view.wire.props.numberLocked} />
            {view.wire.props.numberLocked ? 'Bloccato' : 'Automatico'}
          </button>
        </span>
      </label>
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
    <h3>Numerazione fili</h3>
    <div class="grid">
      <label class="check wide"
        ><input
          type="checkbox"
          checked={numbering.auto}
          onchange={(e) => setNumbering({ auto: e.currentTarget.checked })}
        /> Numera automaticamente i fili nuovi</label
      >
      <label class="wide"
        >Modello
        <input
          type="text"
          value={pattern}
          class:invalid={!parsedPattern.ok}
          oninput={(e) => (patternDraft = text(e))}
          onchange={(e) => {
            if (parsePattern(text(e)).ok) setNumbering({ pattern: text(e) });
          }}
        />
      </label>
      <div class="wide chips">
        {#each PLACEHOLDERS as p (p)}
          <button
            class="chip"
            title="Aggiungi al modello"
            onclick={() => {
              const next = pattern + p;
              patternDraft = next;
              if (parsePattern(next).ok) setNumbering({ pattern: next });
            }}>{p}</button
          >
        {/each}
      </div>
      {#if parsedPattern.ok}
        <p class="wide hint">Esempio: {preview}</p>
      {:else}
        <p class="wide error">{parsedPattern.error}</p>
      {/if}
      <label
        >Primo numero <input
          type="number"
          min="0"
          value={numbering.start}
          onchange={(e) => setNumbering({ start: Math.max(0, Math.round(num(e))) })}
        /></label
      >
    </div>
    <p class="hint">
      {'{n}'} contatore · {'{n:2}'} con almeno 2 cifre · {'{foglio}'} numero del foglio · {'{colonna}'}
      colonna del riquadro. I numeri scritti a mano diventano «Bloccato».
    </p>
    <h4>Numero dal terminale raggiunto</h4>
    <p class="hint">
      Prima del contatore si prova, in quest'ordine, a prendere il numero dagli elementi raggiunti
      dal potenziale.
    </p>
    <label
      >Tipo di progetto
      <select
        value={preset}
        onchange={(e) => {
          const p = PRESETS.find((x) => x.id === text(e));
          if (p) setNumbering({ sources: p.sources });
        }}
      >
        {#each PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        <option value="custom" disabled>Personalizzato</option>
      </select>
    </label>
    <ul class="sources">
      {#each sourceRows as row, i (row.source)}
        <li>
          <label class="check"
            ><input
              type="checkbox"
              checked={row.enabled}
              onchange={(e) => toggleSource(row.source, e.currentTarget.checked)}
            />
            {row.enabled ? `${i + 1}.` : ''}
            {SOURCE_NAMES[row.source]}</label
          >
          {#if row.enabled}
            <button
              class="icon"
              title="Più importante"
              disabled={i === 0}
              onclick={() => moveSource(i, -1)}>▲</button
            >
            <button
              class="icon"
              title="Meno importante"
              disabled={i === numbering.sources.length - 1}
              onclick={() => moveSource(i, 1)}>▼</button
            >
          {/if}
        </li>
      {/each}
    </ul>
    {#if numbering.sources.includes('plc')}
      <label
        >Indirizzo dalle schede PLC
        <input
          type="text"
          value={plcPattern}
          class:invalid={!!plcError}
          oninput={(e) => (plcDraft = text(e))}
          onchange={(e) => {
            if (!checkPlcPattern(text(e))) setNumbering({ plcPattern: text(e) });
          }}
        />
      </label>
      {#if plcError}
        <p class="error">{plcError}</p>
      {:else}
        <p class="hint">
          Esempio: scheda con byte I0, morsetto 3 → {formatPlcAddress(plcPattern, 'I0', '3')} · {'{byte}'}
          = indirizzo della scheda, {'{morsetto}'} = numero del terminale (solo terminali numerati).
        </p>
      {/if}
    {/if}
    {#if numbering.sources.includes('terminal')}
      <label
        >Numero dal morsetto
        <select
          value={numbering.terminalStyle ?? 'number'}
          onchange={(e) => setNumbering({ terminalStyle: text(e) as 'number' | 'full' })}
        >
          <option value="number">Solo numero (X1:5 → 5)</option>
          <option value="full">Sigla completa (X1:5)</option>
        </select>
      </label>
    {/if}
    <p class="hint">
      Indirizzo PLC: campo «Indirizzo PLC» di un elemento · morsetto: sigla di un elemento di tipo
      morsetto · sigla: sigla degli altri elementi. Le modifiche valgono per i fili nuovi; usa
      «Ricalcola numerazione» per applicarle ai fili esistenti.
    </p>
  {/if}
</div>

<style>
  h4 {
    margin: 0.9rem 0 0.25rem;
    font-size: 0.85rem;
  }
  .sources {
    list-style: none;
    margin: 0.4rem 0;
    padding: 0;
  }
  .sources li {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .sources label {
    flex: 1;
  }
  .icon {
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.75rem;
  }
  .icon:disabled {
    opacity: 0.3;
  }
  .number-row {
    display: flex;
    gap: 0.3rem;
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: none;
    padding: 0 0.45rem;
    border: 1px solid var(--border);
    background: #fff;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .lock.locked {
    border-color: #e0b35c;
    background: #fff8e6;
    color: var(--warning);
  }
  .lock:disabled {
    opacity: 0.4;
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
  input.invalid {
    border-color: var(--error);
  }
  .error {
    color: var(--error);
    font-size: 0.8rem;
    margin: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
  }
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

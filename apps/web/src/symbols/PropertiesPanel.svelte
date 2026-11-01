<script lang="ts">
  import type {
    ContactType,
    MasterType,
    Primitive,
    Rotation,
    SymbolDef,
    SymbolKind,
    TerminalId,
  } from '@cablewire/core';
  import {
    checkSymbol,
    parseKey,
    removeItems,
    replaceShape,
    terminalKey,
    toggleBridge,
    updateTerminal,
    SHAPE_GRID,
    TERMINAL_GRID,
  } from '@cablewire/editor';
  import type { SymbolEditor } from '@cablewire/editor';

  let { editor, version }: { editor: SymbolEditor; version: number } = $props();

  const symbol = $derived.by(() => {
    void version;
    return editor.symbol;
  });
  const selection = $derived.by(() => {
    void version;
    return [...editor.selection];
  });
  const single = $derived(selection.length === 1 ? parseKey(selection[0]!) : undefined);
  const shapeIndex = $derived(single && 'shape' in single ? single.shape : undefined);
  const shape = $derived(shapeIndex === undefined ? undefined : symbol.graphics[shapeIndex]);
  const terminal = $derived(
    single && 'terminal' in single
      ? symbol.terminals.find((t) => t.id === single.terminal)
      : undefined,
  );
  const checks = $derived(checkSymbol(symbol));

  const KINDS: { value: SymbolKind; label: string }[] = [
    { value: 'simple', label: 'Semplice' },
    { value: 'master', label: 'Master (bobina, comando)' },
    { value: 'slave', label: 'Slave (contatto)' },
    { value: 'terminal', label: 'Morsetto' },
    { value: 'report', label: 'Rimando di foglio' },
    { value: 'plc', label: 'PLC' },
    { value: 'titleblock', label: 'Cartiglio' },
  ];
  const SHAPE_NAMES: Record<Primitive['type'], string> = {
    line: 'Linea',
    polyline: 'Polilinea',
    rect: 'Rettangolo',
    circle: 'Cerchio',
    arc: 'Arco',
    text: 'Testo',
  };
  const PLACEHOLDERS = ['{label}', '{function}', '{location}', '{plc_address}'];

  const set = (next: SymbolDef) => editor.update(next);
  const setShape = (patch: Partial<Primitive>) => {
    if (shapeIndex === undefined || !shape) return;
    set(replaceShape(symbol, shapeIndex, { ...shape, ...patch } as Primitive));
  };
  /** Sets an optional text field, removing it when empty. */
  function withOptional(s: SymbolDef, key: 'author' | 'license', value: string): SymbolDef {
    const next = { ...s };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    return next;
  }
  /**
   * Kind change; only sheet references keep a direction (outgoing by default) and
   * only contacts a contact type (normally open by default).
   */
  function withKind(s: SymbolDef, kind: SymbolKind): SymbolDef {
    const next = { ...s, kind };
    if (kind === 'report') next.report = s.report ?? 'out';
    else delete next.report;
    if (kind === 'slave') next.contact = s.contact ?? 'no';
    else delete next.contact;
    if (kind === 'master') next.master = s.master ?? 'coil';
    else delete next.master;
    return next;
  }
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
  const text = (e: Event) => (e.currentTarget as HTMLInputElement).value;

  // Default info fields as editable rows.
  const infoRows = $derived(Object.entries(symbol.defaultInfo));
  function setInfo(rows: [string, string][]) {
    set({ ...symbol, defaultInfo: Object.fromEntries(rows.filter(([k]) => k.trim())) });
  }

  let bridgeA = $state<TerminalId | ''>('');
  let bridgeB = $state<TerminalId | ''>('');
  const terminalName = (id: TerminalId) => symbol.terminals.find((t) => t.id === id)?.name ?? '?';
</script>

<div class="panel">
  {#if shape && shapeIndex !== undefined}
    <h3>{SHAPE_NAMES[shape.type]}</h3>
    <div class="grid">
      {#if shape.type === 'line'}
        <label
          >X1 <input
            type="number"
            step={SHAPE_GRID}
            value={shape.x1}
            onchange={(e) => setShape({ x1: num(e) })}
          /></label
        >
        <label
          >Y1 <input
            type="number"
            step={SHAPE_GRID}
            value={shape.y1}
            onchange={(e) => setShape({ y1: num(e) })}
          /></label
        >
        <label
          >X2 <input
            type="number"
            step={SHAPE_GRID}
            value={shape.x2}
            onchange={(e) => setShape({ x2: num(e) })}
          /></label
        >
        <label
          >Y2 <input
            type="number"
            step={SHAPE_GRID}
            value={shape.y2}
            onchange={(e) => setShape({ y2: num(e) })}
          /></label
        >
      {:else if shape.type === 'rect'}
        <label
          >X <input
            type="number"
            step={SHAPE_GRID}
            value={shape.x}
            onchange={(e) => setShape({ x: num(e) })}
          /></label
        >
        <label
          >Y <input
            type="number"
            step={SHAPE_GRID}
            value={shape.y}
            onchange={(e) => setShape({ y: num(e) })}
          /></label
        >
        <label
          >Larghezza <input
            type="number"
            step={SHAPE_GRID}
            min="0"
            value={shape.width}
            onchange={(e) => setShape({ width: num(e) })}
          /></label
        >
        <label
          >Altezza <input
            type="number"
            step={SHAPE_GRID}
            min="0"
            value={shape.height}
            onchange={(e) => setShape({ height: num(e) })}
          /></label
        >
      {:else if shape.type === 'circle' || shape.type === 'arc'}
        <label
          >Centro X <input
            type="number"
            step={SHAPE_GRID}
            value={shape.cx}
            onchange={(e) => setShape({ cx: num(e) })}
          /></label
        >
        <label
          >Centro Y <input
            type="number"
            step={SHAPE_GRID}
            value={shape.cy}
            onchange={(e) => setShape({ cy: num(e) })}
          /></label
        >
        <label
          >Raggio <input
            type="number"
            step={SHAPE_GRID}
            min="0.1"
            value={shape.r}
            onchange={(e) => setShape({ r: num(e) })}
          /></label
        >
        {#if shape.type === 'arc'}
          <label
            >Inizio (°) <input
              type="number"
              step="15"
              value={shape.start}
              onchange={(e) => setShape({ start: num(e) })}
            /></label
          >
          <label
            >Ampiezza (°) <input
              type="number"
              step="15"
              value={shape.sweep}
              onchange={(e) => setShape({ sweep: num(e) })}
            /></label
          >
        {/if}
      {:else if shape.type === 'polyline'}
        <span class="wide">{shape.points.length} vertici (modificabili con le maniglie)</span>
        <label class="check wide"
          ><input
            type="checkbox"
            checked={shape.closed}
            onchange={(e) => setShape({ closed: (e.currentTarget as HTMLInputElement).checked })}
          /> Chiusa</label
        >
      {:else if shape.type === 'text'}
        <label class="wide"
          >Testo <input
            type="text"
            value={shape.text}
            onchange={(e) => setShape({ text: text(e) })}
          /></label
        >
        <div class="wide chips">
          {#each PLACEHOLDERS as p (p)}
            <button
              class="chip"
              onclick={() => setShape({ text: p })}
              title="Sostituito con il valore dell'elemento nello schema">{p}</button
            >
          {/each}
        </div>
        <label
          >X <input
            type="number"
            step={SHAPE_GRID}
            value={shape.x}
            onchange={(e) => setShape({ x: num(e) })}
          /></label
        >
        <label
          >Y <input
            type="number"
            step={SHAPE_GRID}
            value={shape.y}
            onchange={(e) => setShape({ y: num(e) })}
          /></label
        >
        <label
          >Altezza <input
            type="number"
            step="0.5"
            min="1"
            value={shape.size}
            onchange={(e) => setShape({ size: num(e) })}
          /></label
        >
        <label
          >Allineamento
          <select
            value={shape.anchor ?? 'start'}
            onchange={(e) => setShape({ anchor: text(e) as 'start' })}
          >
            <option value="start">A sinistra</option>
            <option value="middle">Al centro</option>
            <option value="end">A destra</option>
          </select>
        </label>
        <label
          >Rotazione
          <select
            value={String(shape.rotation ?? 0)}
            onchange={(e) => setShape({ rotation: Number(text(e)) as Rotation })}
          >
            <option value="0">0° (orizzontale)</option>
            <option value="90">90° (verticale)</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </select>
        </label>
        <span class="wide hint"
          >Il testo resta leggibile dal basso o da destra: a 180° e 270° non si capovolge ma cambia
          il lato dell'allineamento.</span
        >
      {/if}
      {#if shape.type === 'rect' || shape.type === 'circle' || (shape.type === 'polyline' && shape.closed)}
        <label class="check wide"
          ><input
            type="checkbox"
            checked={shape.filled ?? false}
            onchange={(e) => setShape({ filled: (e.currentTarget as HTMLInputElement).checked })}
          /> Riempito</label
        >
      {/if}
    </div>
  {:else if terminal}
    <h3>Terminale</h3>
    <div class="grid">
      <label class="wide"
        >Nome <input
          type="text"
          value={terminal.name}
          onchange={(e) => set(updateTerminal(symbol, terminal.id, { name: text(e) }))}
        /></label
      >
      <label
        >X <input
          type="number"
          step={TERMINAL_GRID}
          value={terminal.x}
          onchange={(e) => set(updateTerminal(symbol, terminal.id, { x: num(e) }))}
        /></label
      >
      <label
        >Y <input
          type="number"
          step={TERMINAL_GRID}
          value={terminal.y}
          onchange={(e) => set(updateTerminal(symbol, terminal.id, { y: num(e) }))}
        /></label
      >
      <label class="wide"
        >Uscita del filo
        <select
          value={terminal.dir}
          onchange={(e) => set(updateTerminal(symbol, terminal.id, { dir: text(e) as 'n' }))}
        >
          <option value="n">In alto</option>
          <option value="e">A destra</option>
          <option value="s">In basso</option>
          <option value="w">A sinistra</option>
        </select>
      </label>
    </div>
  {:else if selection.length > 1}
    <h3>{selection.length} elementi selezionati</h3>
    <button onclick={() => set(removeItems(symbol, selection))}>Elimina selezione</button>
  {:else}
    <h3>Simbolo</h3>
    <div class="grid">
      <label class="wide"
        >Nome <input
          type="text"
          value={symbol.name}
          onchange={(e) => set({ ...symbol, name: text(e) })}
        /></label
      >
      <label class="wide"
        >Categoria <input
          type="text"
          value={symbol.category}
          placeholder="es. Contatti"
          onchange={(e) => set({ ...symbol, category: text(e) })}
        /></label
      >
      <label class="wide"
        >Tipo
        <select value={symbol.kind} onchange={(e) => set(withKind(symbol, text(e) as SymbolKind))}>
          {#each KINDS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
        </select>
      </label>
      {#if symbol.kind === 'report'}
        <label class="wide"
          >Direzione
          <select
            value={symbol.report ?? 'out'}
            onchange={(e) => set({ ...symbol, report: text(e) as 'in' | 'out' })}
          >
            <option value="out">Uscita (il filo prosegue su un altro foglio)</option>
            <option value="in">Entrata (il filo arriva da un altro foglio)</option>
          </select>
        </label>
        <span class="wide hint"
          >Nei testi usa <code>{'{ref_name}'}</code> per il numero del filo (o l'ID N/C_n) e
          <code>{'{ref_target}'}</code> per il foglio e la colonna del rimando collegato.</span
        >
      {/if}
      {#if symbol.kind === 'master'}
        <label class="wide"
          >Tipo di master
          <select
            value={symbol.master ?? 'coil'}
            onchange={(e) => set({ ...symbol, master: text(e) as MasterType })}
          >
            <option value="coil">Bobina</option>
            <option value="device">Dispositivo di comando (interruttore, sezionatore…)</option>
          </select>
        </label>
        <span class="wide hint"
          >Nelle proprietà del progetto si sceglie come mostrare i contatti per bobine e dispositivi
          di comando (tabellina o contatti disegnati).</span
        >
      {/if}
      {#if symbol.kind === 'slave'}
        <label class="wide"
          >Tipo di contatto
          <select
            value={symbol.contact ?? 'no'}
            onchange={(e) => set({ ...symbol, contact: text(e) as ContactType })}
          >
            <option value="no">NA (normalmente aperto)</option>
            <option value="nc">NC (normalmente chiuso)</option>
            <option value="changeover">Scambio</option>
            <option value="power">Potenza</option>
          </select>
        </label>
        <span class="wide hint"
          >Nei testi usa <code>{'{label}'}</code> per la sigla (quella della bobina, se collegato) e
          <code>{'{master_ref}'}</code> per il foglio e la colonna della bobina.</span
        >
      {/if}
      <label
        >Autore
        <input
          type="text"
          value={symbol.author ?? ''}
          onchange={(e) => set(withOptional(symbol, 'author', text(e)))}
        /></label
      >
      <label
        >Licenza
        <input
          type="text"
          value={symbol.license ?? ''}
          placeholder="es. CC0-1.0"
          onchange={(e) => set(withOptional(symbol, 'license', text(e)))}
        /></label
      >
      <span class="wide hint">Versione {symbol.version}</span>
    </div>
    <h4>Campi predefiniti</h4>
    <p class="hint">
      Valori iniziali dei campi quando il simbolo viene inserito nello schema. Per le sigle
      automatiche usa {'{foglio}'} e {'{n}'} (es. {'{foglio}'}K{'{n}'} → 1K1, 1K2… sul foglio 1),
      {'{n:2}'} per due cifre.
    </p>
    {#each infoRows as [key, value], i (key + i)}
      <div class="row">
        <input
          type="text"
          value={key}
          aria-label="Campo"
          onchange={(e) => setInfo(infoRows.map((r, j) => (j === i ? [text(e), r[1]] : r)))}
        />
        <input
          type="text"
          {value}
          aria-label="Valore"
          onchange={(e) => setInfo(infoRows.map((r, j) => (j === i ? [r[0], text(e)] : r)))}
        />
        <button
          class="icon"
          title="Rimuovi"
          onclick={() => setInfo(infoRows.filter((_, j) => j !== i))}>×</button
        >
      </div>
    {/each}
    <button class="link" onclick={() => setInfo([...infoRows, [`campo${infoRows.length + 1}`, '']])}
      >+ Aggiungi campo</button
    >
  {/if}

  <h3>Terminali</h3>
  {#if symbol.terminals.length === 0}
    <p class="hint">Nessun terminale: usa lo strumento Terminale.</p>
  {:else}
    <ul class="list">
      {#each symbol.terminals as t (t.id)}
        <li>
          <button
            class="link"
            class:current={terminal?.id === t.id}
            onclick={() => editor.select([terminalKey(t.id)])}>{t.name || '(senza nome)'}</button
          >
          <span class="hint">({t.x}, {t.y})</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if symbol.terminals.length >= 2}
    <h4>Collegamenti interni</h4>
    <p class="hint">Terminali che sono lo stesso potenziale (es. morsetto passante).</p>
    <ul class="list">
      {#each symbol.bridges as [a, b] (a + b)}
        <li>
          {terminalName(a)} ↔ {terminalName(b)}
          <button class="icon" title="Rimuovi" onclick={() => set(toggleBridge(symbol, a, b))}
            >×</button
          >
        </li>
      {/each}
    </ul>
    <div class="row">
      <select bind:value={bridgeA} aria-label="Primo terminale">
        <option value="">—</option>
        {#each symbol.terminals as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
      </select>
      <select bind:value={bridgeB} aria-label="Secondo terminale">
        <option value="">—</option>
        {#each symbol.terminals as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
      </select>
      <button
        disabled={!bridgeA || !bridgeB || bridgeA === bridgeB}
        onclick={() => {
          if (bridgeA && bridgeB) set(toggleBridge(symbol, bridgeA, bridgeB));
          bridgeA = bridgeB = '';
        }}>Collega</button
      >
    </div>
  {/if}

  {#if checks.errors.length || checks.warnings.length}
    <h3>Controlli</h3>
    <ul class="checks">
      {#each checks.errors as message (message)}<li class="error">{message}</li>{/each}
      {#each checks.warnings as message (message)}<li class="warning">{message}</li>{/each}
    </ul>
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
  .wide {
    grid-column: 1 / -1;
  }
  input[type='text'],
  input[type='number'],
  select {
    width: 100%;
    box-sizing: border-box;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: #1d2329;
  }
  .row {
    display: flex;
    gap: 0.3rem;
    margin-bottom: 0.3rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0 0 0.4rem;
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
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.1rem 0;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    padding: 0;
    cursor: pointer;
  }
  .link.current {
    font-weight: 600;
  }
  .icon {
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
  }
  .checks {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.8rem;
  }
  .error {
    color: var(--error);
  }
  .warning {
    color: var(--warning);
  }
</style>

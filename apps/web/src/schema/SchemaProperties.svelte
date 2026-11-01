<script lang="ts">
  import { tick } from 'svelte';
  import {
    allMasters,
    availablePartners,
    contactType,
    DEFAULT_MASTER_REF_PATTERN,
    getMasterRefPattern,
    linkSlave,
    masterOf,
    mastersWithLabel,
    setSlaveLabel,
    projectXrefStyle,
    setXrefOffset,
    addStrip,
    DEFAULT_STRIP_PATTERN,
    getStripPattern,
    getStrips,
    newStripId,
    removeStrip,
    setTerminalNo,
    setTerminalStrip,
    stripName,
    stripOf,
    terminalLabel,
    terminalsOf,
    updateStrip,
    setXrefStyle,
    showsXref,
    xrefStyleOf,
    slaveLabel,
    slavesOf,
    unlinkedSlaves,
    unlinkSlave,
    checkPlcPattern,
    DEFAULT_REFERENCE_PATTERN,
    formatPattern,
    formatPlcAddress,
    formatReference,
    getNumbering,
    getReferencePattern,
    linkedReport,
    linkReports,
    numberOrigin,
    parsePattern,
    referenceValues,
    reportDirection,
    reportName,
    reportWires,
    SOURCE_NAMES,
    setElementInfo,
    setPotentialLock,
    setPotentialNumber,
    setWireProps,
    unlinkedReports,
    unlinkReport,
    updateNumbering,
    updateProjectMeta,
    updateSettings,
    updateSheet,
  } from '@cablewire/core';
  import type {
    Command,
    ContactType,
    Element,
    MasterType,
    XrefStyle,
    ProjectDoc,
    ElementId,
    NumberingSettings,
    NumberSource,
    SheetFormat,
    SheetSize,
    WireId,
  } from '@cablewire/core';
  import { parseItemKey } from '@cablewire/editor';
  import type { SchematicEditor } from '@cablewire/editor';
  import LockIcon from './LockIcon.svelte';
  import { rememberSheetFormat } from './sheetFormat.ts';

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
  /** Sheet references show their id instead of the usual fields (the name is computed). */
  const REPORT_FIELDS: [string, string][] = [['ref_id', 'Nome']];
  const fields = $derived.by(() => {
    const info = view.element?.info ?? {};
    const report = view.symbol?.kind === 'report';
    const own = report ? REPORT_FIELDS : FIELDS;
    const known = new Set([...FIELDS, ...REPORT_FIELDS].map(([k]) => k));
    return [
      ...own,
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

  /** Where an element is, in words, e.g. foglio 2 «Motori», colonna 5. */
  function whereIs(doc: ProjectDoc, e: Element): string {
    const values = referenceValues(doc, e);
    return `foglio ${values['foglio']} «${values['titolo']}», colonna ${values['colonna']}`;
  }

  // Sheet references: name, where the partner is, free partners to link to.
  const report = $derived.by(() => {
    const { doc, element, symbol } = view;
    if (!element || symbol?.kind !== 'report') return undefined;
    const place = (e: Element) => ({ id: e.id, name: reportName(doc, e), where: whereIs(doc, e) });
    const partner = linkedReport(doc, element);
    return {
      direction: reportDirection(doc, element),
      name: reportName(doc, element),
      wires: reportWires(doc, element),
      partner: partner && place(partner),
      available: partner ? [] : availablePartners(doc, element).map(place),
    };
  });

  // Contacts: their coil, or the coils to link to.
  const CONTACT_NAMES: Record<ContactType, string> = {
    no: 'NA',
    nc: 'NC',
    changeover: 'Scambio',
    power: 'Potenza',
  };
  const contact = $derived.by(() => {
    const { doc, element, symbol } = view;
    if (!element || symbol?.kind !== 'slave') return undefined;
    const master = masterOf(doc, element);
    const place = (e: Element) => ({
      id: e.id,
      label: e.info['label'] || '—',
      where: whereIs(doc, e),
    });
    return {
      label: slaveLabel(doc, element),
      master: master && place(master),
      masters: master ? [] : allMasters(doc).map(place),
    };
  });
  // Coils: their contacts, and the free contacts (linked to no coil) to add.
  // Terminal strips of the project, and the selected terminal's.
  const strips = $derived.by(() => {
    void version;
    const doc = view.doc;
    return getStrips(doc).map((s) => ({
      id: s.id,
      mode: s.mode,
      name: stripName(doc, s),
      sheet: s.sheetId ? doc.sheetOrder.indexOf(s.sheetId) + 1 : 0,
      count: terminalsOf(doc, s.id).length,
    }));
  });
  const stripPattern = $derived(getStripPattern(view.doc));
  const terminal = $derived.by(() => {
    const { doc, element, symbol } = view;
    if (!element || symbol?.kind !== 'terminal') return undefined;
    return {
      strip: stripOf(doc, element)?.id,
      no: element.terminalNo ?? '',
      label: terminalLabel(doc, element),
    };
  });
  let stripError = $state('');

  function runStrip<A>(command: Command<A>, args: A): boolean {
    const result = editor.store.run(command, args);
    stripError = result.ok ? '' : result.error.message;
    return result.ok;
  }

  /** Creates a strip; returns its id. */
  function newStrip(mode: 'sheet' | 'custom'): string | undefined {
    const id = newStripId(editor.doc);
    if (mode === 'sheet') {
      return runStrip(addStrip, { id, mode, sheetId: editor.sheetId }) ? id : undefined;
    }
    const name = prompt('Nome della morsettiera (es. -X1, XPOMPA):')?.trim();
    if (!name) return undefined;
    return runStrip(addStrip, { id, mode, name }) ? id : undefined;
  }

  /** Strip chosen for the selected terminal (or a new one); new terminals follow it. */
  function chooseStrip(value: string) {
    const element = view.element;
    if (!element) return;
    const strip =
      value === 'new-sheet'
        ? newStrip('sheet')
        : value === 'new-custom'
          ? newStrip('custom')
          : value || undefined;
    if ((value === 'new-sheet' || value === 'new-custom') && !strip) return;
    runStrip(setTerminalStrip, { id: element.id, strip });
    if (strip) editor.lastStrip = strip;
  }

  const coil = $derived.by(() => {
    const { doc, element, symbol } = view;
    if (!element || symbol?.kind !== 'master') return undefined;
    const describe = (e: Element) => {
      const type = contactType(doc, e);
      return {
        id: e.id,
        type: type ? CONTACT_NAMES[type] : 'Contatto',
        label: e.info['label'] || '—',
        terminals: (doc.symbols[e.symbolId]?.terminals ?? []).map((t) => t.name).join('-'),
        where: whereIs(doc, e),
      };
    };
    return {
      linked: slavesOf(doc, element).map(describe),
      free: unlinkedSlaves(doc).map(describe),
    };
  });
  let contactWarning = $state('');

  const XREF_STYLE_NAMES: Record<XrefStyle, string> = {
    table: 'Tabellina NA | NC',
    contacts: 'Contatti disegnati',
  };

  /** Moves the selected master's contacts; the other coordinate stays. */
  function setXref(set: { dx?: number; dy?: number }) {
    const element = view.element;
    if (!element) return;
    const offset = { dx: element.xrefOffsetX ?? 0, dy: element.xrefOffset ?? 0, ...set };
    editor.store.run(setXrefOffset, { id: element.id, offset });
  }

  function setProjectXrefStyle(type: MasterType, style: XrefStyle) {
    const xrefStyles = { ...view.doc.settings.xrefStyles, [type]: style };
    editor.store.run(updateSettings, { set: { xrefStyles } });
  }

  /** A coil's label links the contact to it; several coils with that label do not. */
  function setContactLabel(label: string) {
    const element = view.element;
    if (!element) return;
    editor.store.run(setSlaveLabel, { slave: element.id, label });
    const count = mastersWithLabel(editor.doc, label).length;
    contactWarning =
      count > 1 ? `Ci sono ${count} bobine con sigla «${label.trim()}»: scegli quella giusta.` : '';
  }

  /**
   * The name of a reference is its wire number: with wires connected it renumbers the
   * whole potential (like the wire's own field), otherwise it is the reference's id.
   */
  function setReportName(name: string) {
    const wire = report?.wires[0];
    if (wire) editor.store.run(setPotentialNumber, { id: wire, number: name });
    else setInfo('ref_id', name.trim());
  }

  /** Changes the paper or grid of the sheet and remembers it for new sheets. */
  function setSheetFormat(set: Partial<SheetFormat>) {
    const result = editor.store.run(updateSheet, { id: view.sheet.id, set });
    const sheet = editor.doc.sheets[view.sheet.id];
    if (result.ok && sheet) rememberSheetFormat(sheet);
  }

  /** Shows an element: switches to its sheet and selects it. */
  function goTo(id: ElementId) {
    const element = editor.doc.elements[id];
    if (!element) return;
    editor.setSheet(element.sheetId);
    editor.select([`element:${id}`]);
  }

  // Reference pattern, with a preview.
  const referencePattern = $derived(getReferencePattern(view.doc));
  const referencePreview = $derived(
    formatReference(referencePattern, { foglio: '3', colonna: '5', riga: 'B', titolo: 'Motori' }),
  );
  const unlinked = $derived.by(() => {
    void version;
    return unlinkedReports(view.doc).map((e) => ({
      id: e.id,
      name: reportName(view.doc, e),
      sheet: view.doc.sheetOrder.indexOf(e.sheetId) + 1,
    }));
  });

  const masterRefPattern = $derived(getMasterRefPattern(view.doc));
  const masterRefPreview = $derived(
    formatReference(masterRefPattern, { foglio: '2', colonna: '4', riga: 'C', titolo: 'Comandi' }),
  );
  const unlinkedContacts = $derived.by(() => {
    void version;
    return unlinkedSlaves(view.doc).map((e) => ({
      id: e.id,
      name: e.info['label'] || '—',
      sheet: view.doc.sheetOrder.indexOf(e.sheetId) + 1,
    }));
  });
  $effect(() => {
    // A warning about one contact's label does not follow the selection.
    void view.element?.id;
    contactWarning = '';
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
            : key === 'label' && contact
              ? 'Sigla (quella della bobina, se collegato)'
              : key === 'ref_id' && report
                ? report.wires.length > 0
                  ? 'Nome (numero del filo, vale per tutto il potenziale)'
                  : 'Nome (ID finché non è collegato a un filo)'
                : label}
          {#if key === 'ref_id' && report}
            <input
              bind:this={labelInput}
              type="text"
              value={report.name}
              onchange={(e) => setReportName(text(e))}
            />
          {:else if key === 'label' && terminal?.strip}
            <input type="text" value={terminal.label} readonly title="Dalla morsettiera" />
          {:else if key === 'label' && contact}
            <input
              bind:this={labelInput}
              type="text"
              value={contact.label}
              onchange={(e) => setContactLabel(text(e))}
            />
          {:else if key === 'label'}
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
    {#if contactWarning && contact}<p class="warning">{contactWarning}</p>{/if}
    {#if terminal}
      <h4>Morsettiera</h4>
      <div class="grid">
        <label
          >Morsettiera
          <select
            value={terminal.strip ?? ''}
            onchange={(e) => {
              const select = e.currentTarget;
              chooseStrip(select.value);
              // Back to the strip in use when a new one was not created.
              select.value = terminal.strip ?? '';
            }}
          >
            <option value="">Nessuna (sigla scritta a mano)</option>
            {#each strips as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            <option value="new-sheet">+ Nuova, per questo foglio</option>
            <option value="new-custom">+ Nuova, con un nome…</option>
          </select>
        </label>
        {#if terminal.strip}
          <label
            >Numero
            <input
              type="text"
              value={terminal.no}
              placeholder="primo libero"
              onchange={(e) =>
                editor.store.run(setTerminalNo, { id: view.element!.id, no: text(e) })}
            /></label
          >
        {/if}
      </div>
      {#if terminal.strip}
        <p class="hint">
          Sigla: <strong>{terminal.label}</strong>. I morsetti nuovi vanno nell'ultima morsettiera
          scelta.
        </p>
      {/if}
    {/if}
    {#if contact}
      <h4>Comandato da (bobina o dispositivo)</h4>
      {#if contact.master}
        <p class="hint">
          Collegato a <strong>{contact.master.label}</strong> · {contact.master.where}.
        </p>
        <div class="actions">
          <button onclick={() => goTo(contact.master!.id)}>Vai al comando</button>
          <button onclick={() => editor.store.run(unlinkSlave, { slave: view.element!.id })}
            >Scollega</button
          >
        </div>
        <p class="hint">Doppio clic sul contatto nello schema per saltare alla bobina.</p>
      {:else if contact.masters.length > 0}
        <p class="warning">
          Non collegato. Scegli la bobina, oppure scrivi la sua sigla nel campo Sigla:
        </p>
        <ul class="partners">
          {#each contact.masters as m (m.id)}
            <li>
              <button
                onclick={() => {
                  contactWarning = '';
                  editor.store.run(linkSlave, { slave: view.element!.id, master: m.id });
                }}
              >
                <strong>{m.label}</strong> <span>{m.where}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="warning">
          Non collegato: nel progetto non ci sono ancora bobine o dispositivi di comando.
        </p>
      {/if}
    {/if}
    {#if coil}
      <h4>Contatti ({coil.linked.length})</h4>
      {#if coil.linked.length === 0}
        <p class="hint">
          Nessun contatto collegato: scegli qui sotto tra i contatti liberi, oppure scrivi nel
          contatto la sigla della bobina.
        </p>
      {:else}
        <ul class="partners">
          {#each coil.linked as c (c.id)}
            <li>
              <button title="Vai al contatto" onclick={() => goTo(c.id)}>
                <strong>{c.type} {c.terminals}</strong> <span>{c.where}</span>
              </button>
              <button
                class="icon"
                title="Scollega dalla bobina"
                onclick={() => editor.store.run(unlinkSlave, { slave: c.id })}>×</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      {#if showsXref(view.doc)}
        <h4>Riferimenti dei contatti</h4>
        <label
          >Stile
          <select
            value={view.element.xrefStyle ?? ''}
            onchange={(e) =>
              editor.store.run(setXrefStyle, {
                id: view.element!.id,
                style: (text(e) || undefined) as XrefStyle | undefined,
              })}
          >
            <option value=""
              >Come il progetto ({XREF_STYLE_NAMES[
                projectXrefStyle(view.doc, view.symbol.master ?? 'coil')
              ]})</option
            >
            <option value="table">{XREF_STYLE_NAMES.table}</option>
            <option value="contacts">{XREF_STYLE_NAMES.contacts}</option>
          </select>
        </label>
        {#if coil.linked.length > 0}
          {#if xrefStyleOf(view.doc, view.element) === 'contacts'}
            <div class="grid">
              <label
                >Spostamento X (mm)
                <input
                  type="number"
                  step={view.doc.settings.gridStep}
                  value={view.element.xrefOffsetX ?? 0}
                  onchange={(e) => setXref({ dx: num(e) })}
                /></label
              >
              <label
                >Spostamento Y (mm)
                <input
                  type="number"
                  step={view.doc.settings.gridStep}
                  value={view.element.xrefOffset ?? 0}
                  onchange={(e) => setXref({ dy: num(e) })}
                /></label
              >
            </div>
          {:else}
            <label
              >Spostamento verticale (mm, positivo verso il basso)
              <input
                type="number"
                step={view.doc.settings.gridStep}
                value={view.element.xrefOffset ?? 0}
                onchange={(e) => setXref({ dy: num(e) })}
              /></label
            >
          {/if}
          <button
            class="link"
            disabled={view.element.xrefOffset === undefined &&
              view.element.xrefOffsetX === undefined}
            onclick={() =>
              editor.store.run(setXrefOffset, { id: view.element!.id, offset: undefined })}
            >Posizione predefinita</button
          >
          <p class="hint">
            {xrefStyleOf(view.doc, view.element) === 'contacts'
              ? 'A destra del simbolo; si possono anche trascinare nello schema.'
              : 'Resta centrata sotto il simbolo; si può anche trascinare in su o in giù.'}
            Doppio clic su un contatto per andare al suo foglio.
          </p>
        {/if}
      {/if}
      {#if coil.free.length > 0}
        <h4>Contatti liberi ({coil.free.length})</h4>
        <p class="hint">Non collegati a nessun comando: un clic li collega a questo.</p>
        <ul class="partners">
          {#each coil.free as c (c.id)}
            <li>
              <button
                title="Collega a questa bobina"
                onclick={() =>
                  editor.store.run(linkSlave, { slave: c.id, master: view.element!.id })}
              >
                <strong>+ {c.type} {c.terminals}</strong>
                <span>{c.label} · {c.where}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    {#if report}
      <h4>
        Rimando {report.direction === 'in'
          ? 'in entrata'
          : report.direction === 'out'
            ? 'in uscita'
            : ''}: {report.name || '—'}
      </h4>
      {#if report.partner}
        <p class="hint">
          Collegato a <strong>{report.partner.name}</strong> · {report.partner.where}.
        </p>
        <div class="actions">
          <button onclick={() => goTo(report.partner!.id)}>Vai al rimando</button>
          <button onclick={() => editor.store.run(unlinkReport, { id: view.element!.id })}
            >Scollega</button
          >
        </div>
        <p class="hint">Doppio clic sul rimando nello schema per saltare al collegato.</p>
      {:else if report.available.length > 0}
        <p class="warning">
          Non collegato. Scegli il rimando {report.direction === 'in' ? 'in uscita' : 'in entrata'} a
          cui collegarlo:
        </p>
        <ul class="partners">
          {#each report.available as p (p.id)}
            <li>
              <button
                onclick={() => editor.store.run(linkReports, { a: view.element!.id, b: p.id })}
              >
                <strong>{p.name}</strong> <span>{p.where}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="warning">
          Non collegato e nessun rimando {report.direction === 'in' ? 'in uscita' : 'in entrata'}
          libero: inseriscine uno sul foglio dove prosegue il filo.
        </p>
      {/if}
    {/if}
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
          onchange={(e) => setSheetFormat({ size: text(e) as SheetSize })}
        >
          {#each SIZES as s (s)}<option value={s}>{s}</option>{/each}
        </select>
      </label>
      <label
        >Orientamento
        <select
          value={view.sheet.orientation}
          onchange={(e) => setSheetFormat({ orientation: text(e) as 'landscape' })}
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
          onchange={(e) => setSheetFormat({ cols: Math.max(1, num(e)) })}
        /></label
      >
      <label
        >Righe <input
          type="number"
          min="1"
          max="26"
          value={view.sheet.rows}
          onchange={(e) => setSheetFormat({ rows: Math.max(1, num(e)) })}
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
    <h3>Rimandi di foglio</h3>
    <label
      >Testo del riferimento
      <input
        type="text"
        value={referencePattern}
        placeholder={DEFAULT_REFERENCE_PATTERN}
        onchange={(e) =>
          editor.store.run(updateSettings, {
            set: { referencePattern: text(e) || DEFAULT_REFERENCE_PATTERN },
          })}
      />
    </label>
    <p class="hint">
      Esempio: {referencePreview} · {'{foglio}'} = numero del foglio, {'{colonna}'}, {'{riga}'},
      {'{titolo}'} = titolo del foglio del rimando collegato.
    </p>
    {#if unlinked.length > 0}
      <p class="warning">
        {unlinked.length}
        {unlinked.length === 1 ? 'rimando non collegato' : 'rimandi non collegati'}:
      </p>
      <div class="chips">
        {#each unlinked as u (u.id)}
          <button class="chip" title="Vai al rimando" onclick={() => goTo(u.id)}
            >{u.name} (f. {u.sheet})</button
          >
        {/each}
      </div>
    {/if}
    <h3>Morsettiere</h3>
    {#if strips.length === 0}
      <p class="hint">
        Nessuna morsettiera: la prima viene creata inserendo un morsetto, oppure qui sotto.
      </p>
    {:else}
      <ul class="strips">
        {#each strips as s (s.id)}
          <li>
            {#if s.mode === 'custom'}
              <input
                type="text"
                value={s.name}
                aria-label="Nome della morsettiera"
                onchange={(e) => runStrip(updateStrip, { id: s.id, name: text(e) })}
              />
            {:else}
              <span class="strip-name" title="Nome dal modello, foglio {s.sheet}">{s.name}</span>
            {/if}
            <select
              value={s.mode}
              aria-label="Tipo di nome"
              onchange={(e) =>
                runStrip(updateStrip, {
                  id: s.id,
                  mode: text(e) as 'sheet' | 'custom',
                  sheetId: editor.sheetId,
                })}
            >
              <option value="sheet">Per foglio</option>
              <option value="custom">Personalizzata</option>
            </select>
            <span class="count" title="Morsetti">{s.count}</span>
            <button
              class="icon"
              title="Elimina la morsettiera (i morsetti tengono la sigla attuale)"
              onclick={() => runStrip(removeStrip, { id: s.id })}>×</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    {#if stripError}<p class="error">{stripError}</p>{/if}
    <div class="actions">
      <button onclick={() => newStrip('sheet')}>+ Per questo foglio</button>
      <button onclick={() => newStrip('custom')}>+ Con un nome…</button>
    </div>
    <label
      >Nome delle morsettiere per foglio
      <input
        type="text"
        value={stripPattern}
        placeholder={DEFAULT_STRIP_PATTERN}
        onchange={(e) =>
          editor.store.run(updateSettings, {
            set: { stripPattern: text(e) || DEFAULT_STRIP_PATTERN },
          })}
      />
    </label>
    <p class="hint">
      {'{foglio}'} = numero del foglio, {'{n}'} = prima, seconda… morsettiera di quel foglio. Una morsettiera
      personalizzata ha un nome suo e si usa su tutti i fogli.
    </p>

    <h3>Bobine e contatti</h3>
    <label class="check"
      ><input
        type="checkbox"
        checked={showsXref(view.doc)}
        onchange={(e) =>
          editor.store.run(updateSettings, { set: { showXref: e.currentTarget.checked } })}
      /> Mostra i contatti accanto ai simboli master</label
    >
    <div class="grid">
      <label
        >Bobine
        <select
          value={projectXrefStyle(view.doc, 'coil')}
          onchange={(e) => setProjectXrefStyle('coil', text(e) as XrefStyle)}
        >
          <option value="table">{XREF_STYLE_NAMES.table}</option>
          <option value="contacts">{XREF_STYLE_NAMES.contacts}</option>
        </select>
      </label>
      <label
        >Dispositivi di comando
        <select
          value={projectXrefStyle(view.doc, 'device')}
          onchange={(e) => setProjectXrefStyle('device', text(e) as XrefStyle)}
        >
          <option value="table">{XREF_STYLE_NAMES.table}</option>
          <option value="contacts">{XREF_STYLE_NAMES.contacts}</option>
        </select>
      </label>
    </div>
    <p class="hint">Si può cambiare anche per un singolo simbolo, nelle sue proprietà.</p>
    <label
      >Testo sotto il contatto (posizione della bobina)
      <input
        type="text"
        value={masterRefPattern}
        placeholder={DEFAULT_MASTER_REF_PATTERN}
        onchange={(e) =>
          editor.store.run(updateSettings, {
            set: { masterRefPattern: text(e) || DEFAULT_MASTER_REF_PATTERN },
          })}
      />
    </label>
    <p class="hint">
      Esempio: {masterRefPreview} · stessi segnaposto dei rimandi, riferiti alla bobina.
    </p>
    {#if unlinkedContacts.length > 0}
      <p class="warning">
        {unlinkedContacts.length}
        {unlinkedContacts.length === 1 ? 'contatto non collegato' : 'contatti non collegati'}:
      </p>
      <div class="chips">
        {#each unlinkedContacts as u (u.id)}
          <button class="chip" title="Vai al contatto" onclick={() => goTo(u.id)}
            >{u.name} (f. {u.sheet})</button
          >
        {/each}
      </div>
    {/if}
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
  .warning {
    color: var(--warning);
    font-size: 0.8rem;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
  }
  .partners {
    list-style: none;
    margin: 0.3rem 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .partners button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    font-size: 0.8rem;
  }
  .partners span {
    color: var(--muted);
  }
  .strips {
    list-style: none;
    margin: 0.3rem 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .strips li {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .strips input,
  .strip-name {
    flex: 1;
    min-width: 0;
  }
  .strips select {
    width: auto;
  }
  .strip-name {
    font-size: 0.85rem;
  }
  .count {
    font-size: 0.75rem;
    color: var(--muted);
    min-width: 1.5rem;
    text-align: right;
  }
  .partners li {
    display: flex;
    gap: 0.2rem;
  }
  .partners .icon {
    width: auto;
    flex: none;
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
</style>

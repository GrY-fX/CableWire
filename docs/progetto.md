# CableWire — Documento di progetto

> Stato: **bozza da approvare** · Versione 0.2 · 29 ottobre 2026
> Le decisioni sono raccolte nella sezione 11.

## 1. Visione

CableWire è un'applicazione web, open source (AGPL-3.0-or-later), per disegnare
schemi elettrici di automazione e quadri in stile QElectroTech, **senza
installazione e senza server**: si apre una pagina, si lavora, il progetto resta
sul proprio computer.

Principi guida, in ordine di priorità:

1. **Semplicità d'uso.** Chi conosce QElectroTech deve ritrovarsi in pochi
   minuti; chi non lo conosce deve riuscire a disegnare un circuito di comando
   senza manuale. Meno finestre di dialogo, più azioni dirette sul disegno.
2. **Prima un prodotto completo e autonomo.** CableWire nasce standalone, con
   formati e libreria propri. La compatibilità con QElectroTech (`.qet`,
   `.elmt`) arriva in una fase successiva; nel frattempo il modello dei dati usa
   concetti equivalenti a quelli di QET, così il ponte resterà fattibile.
3. **I dati sono dell'utente.** Tutto gira nel browser, funziona offline,
   nessun account. Il progetto si salva in un file JSON leggibile e documentato.
4. **Configurazioni e librerie portabili.** Regole di numerazione, cartigli,
   preferenze e simboli si esportano in un pacchetto e si importano su un altro
   PC o si passano ai colleghi: è la forma di "collaborazione" della prima
   versione.
5. **Fare bene poche cose da quadrista** invece di inseguire la parità di
   funzioni con QElectroTech: simboli, fili, potenziali, numerazione fili,
   riferimenti incrociati, morsettiere, cartiglio, stampa.

Non obiettivi (almeno fino alla fase 4): multiutente in tempo reale, account e
cloud, simulazione elettrica, PCB, schemi elettronici stile KiCad.

## 2. Utenti e casi d'uso

| Utente | Bisogno | Cosa gli diamo |
|---|---|---|
| Tecnico/progettista di quadri | Disegnare schemi di potenza e comando, numerare fili, produrre distinta e morsettiere | Editor rapido con numerazione automatica e liste esportabili |
| Manutentore in officina/cantiere | Consultare lo schema da tablet o PC qualunque, seguire un potenziale | Apertura del file nel browser, evidenziazione del potenziale, ricerca per sigla |
| Programmatore PLC | Ricavare la lista I/O dallo schema | Export CSV degli indirizzi PLC collegati (fase 3) |
| Studente / docente | Esercizi senza installare nulla (PC di laboratorio) | Funziona da browser, anche offline dopo il primo caricamento |
| Utente QElectroTech | Usare progetti e simboli esistenti | Import/export `.qet` e `.elmt` (fase 3) |

Casi d'uso principali dell'MVP:

- **UC1** Creo un progetto, aggiungo fogli, inserisco simboli dalla libreria,
  li collego con fili ortogonali, salvo.
- **UC2** Disegno un nuovo simbolo nell'editor di simboli (grafica, terminali,
  campi), lo salvo nella mia libreria e lo uso subito nello schema.
- **UC3** Numero automaticamente i fili (per potenziale), anche con il nome del
  terminale o l'indirizzo PLC raggiunto, scegliendo in caso di conflitto.
- **UC4** Clicco un filo e vedo evidenziato tutto il potenziale, anche sugli
  altri fogli.
- **UC5** Esporto le mie regole di numerazione, il cartiglio e i miei simboli in
  un pacchetto e li importo su un altro PC.
- **UC6** Stampo o esporto in SVG/PDF i fogli.
- **UC7** (fase 3) Apro un `.qet` di QElectroTech, lo modifico e lo riesporto.

## 3. Architettura

### 3.1 Vincoli dalle scelte di fondo

- **Solo browser:** app statica (HTML/JS/CSS) servibile da qualunque hosting
  statico (GitHub Pages, una cartella su un server aziendale, `file://` non
  garantito). Nessun backend.
- **Da zero:** codice scritto per CableWire. QElectroTech e qet-web sono
  riferimenti per concetti e comportamento atteso, non codice copiato.
  Nota: con l'AGPL-3.0 resta legalmente possibile, in futuro, includere codice
  GPL-2.0-or-later (QET, qet-web) se conviene; va solo dichiarato e attribuito.
- **Singolo utente**, ma con modello dei dati compatibile con una futura
  collaborazione (vedi 4.5).

### 3.2 Stack

| Area | Scelta | Motivo |
|---|---|---|
| Linguaggio | TypeScript (strict) | Tipi per un modello dati complesso; stesso linguaggio ovunque |
| Build | Vite | Veloce, semplice, produce un sito statico |
| Interfaccia | Svelte 5 | Poco codice di contorno, bundle piccolo; il motore di disegno resta indipendente dal framework |
| Disegno | SVG (un `<svg>` per foglio) | Testi nitidi, selezione e stampa semplici, export SVG quasi gratuito; canvas valutato solo se le prestazioni lo richiedono |
| Persistenza | IndexedDB (salvataggio automatico) + File System Access API (apri/salva su disco) con ripiego su download/upload | Funziona offline; su Firefox/Safari si usa il ripiego |
| Offline | PWA (service worker) | Installabile, usabile in officina senza rete |
| Zip | fflate | Piccola, per i file nativi e i pacchetti |
| PDF | Da decidere in fase 2 (es. svg2pdf.js + jsPDF, oppure stampa del browser) | Prima prove di fedeltà |
| Test | Vitest (unitari), Playwright (end-to-end) | Standard, girano in CI |
| Gestione pacchetti | npm workspaces | Nessuno strumento in più (Node 22 già presente) |

### 3.3 Moduli (monorepo)

```
packages/
  core/        modello dei dati, comandi, undo/redo, potenziali,
               autonumerazione, riferimenti incrociati — TypeScript puro, senza DOM
  formats/     formato nativo (progetto, simbolo, pacchetto) e migrazioni;
               in fase 3 anche import/export .qet/.elmt
  render/      dal modello a SVG (foglio, simboli, fili, cartiglio)
  editor/      interazione: strumenti, selezione, aggancio, maniglie, tastiera;
               usato sia dall'editor di schemi sia dall'editor di simboli
apps/
  web/         l'applicazione (interfaccia, pannelli, PWA)
docs/          documentazione di progetto e dei formati
```

Regola: `core` non dipende da nessun altro modulo e non usa il DOM, così è
testabile in Node e riutilizzabile (es. un futuro convertitore da riga di
comando o un server di collaborazione).

### 3.4 Flusso di una modifica

```
azione utente (editor) → comando (core) → nuovo stato del documento
                                       ↘ voce nello stack di undo
nuovo stato → ricalcolo incrementale (potenziali, numeri, xref) → render SVG del foglio
            → salvataggio automatico in IndexedDB (con ritardo)
```

Ogni modifica passa da un **comando** reversibile. I comandi producono
**patch** (operazioni elementari su mappe di oggetti con id) e la loro inversa:
undo/redo, salvataggio incrementale e, un domani, sincronizzazione usano la
stessa rappresentazione. L'editor di simboli usa lo stesso meccanismo sul
documento "simbolo".

## 4. Modello dei dati

### 4.1 Entità

```
Project
├─ meta: titolo, autore, date, versione formato
├─ settings: regole di autonumerazione, cartiglio predefinito, stile fili, griglia
├─ symbols: Map<SymbolId, SymbolDef>      (copie dei simboli usati, incorporate)
├─ titleblocks: Map<TemplateId, TitleBlockTemplate>
└─ sheets: ordine + Map<SheetId, Sheet>

Sheet (foglio)
├─ formato (A3/A4…, righe/colonne), cartiglio + campi, indice
├─ elements: Map<ElementId, ElementInstance>
├─ wires: Map<WireId, Wire>
├─ texts e forme libere
└─ junctions (punti di derivazione)

SymbolDef
├─ id (UUID), nome, categoria, versione, autore, licenza
├─ tipo: simple | master | slave | report | terminal | plc…
├─ grafica (primitive: linee, archi, cerchi, rettangoli, poligoni, testi), punto di inserimento
├─ terminals: [{ id, nome, posizione, orientamento }]
├─ collegamenti interni (es. morsetto passante: i due lati sono lo stesso potenziale)
└─ campi informativi predefiniti (label, funzione, costruttore, codice, …)

ElementInstance
├─ symbolId, posizione, rotazione, specchio
├─ info: label (sigla), funzione, posizione impianto/luogo (IEC 81346 =/+), plc_address, …
└─ link: verso master/slave o rimando di foglio collegato

Wire
├─ estremi: { elementId, terminalId } oppure { junctionId }
├─ percorso: punti di piega ortogonali (calcolato o manuale)
└─ proprietà: numero, sezione, colore, funzione, numero bloccato sì/no
```

I concetti ricalcolano quelli di QElectroTech (progetto, foglio — il «folio» di QET —, elemento,
terminale, conduttore, master/slave, rimando, morsetto) proprio per rendere
semplice il ponte di fase 3.

### 4.2 Dati derivati (mai salvati come verità)

- **Potenziali:** union-find su fili + collegamenti interni dei simboli +
  coppie di rimandi di foglio + morsetti passanti. Ricalcolo incrementale sul
  sottografo toccato da una modifica.
- **Numerazione fili:** applicazione delle regole al potenziale; il numero
  scelto viene salvato sul filo (così il file resta stabile), ma il calcolo è
  sempre ripetibile.
- **Riferimenti incrociati** (master/slave, rimandi): calcolati dalla posizione
  (foglio, riga, colonna) e mostrati sul disegno.
- **Liste** (distinta, lista fili, morsettiere, I/O PLC): viste calcolate,
  esportabili in CSV. Niente database SQL: bastano indici in memoria.

### 4.3 Autonumerazione

Regole a parti come in QET (contatore, testo, numero foglio, ecc.) più le
sorgenti introdotte nel branch `feature/terminal-wire-number`: **nome del
terminale raggiunto, sigla dell'elemento, indirizzo PLC**. Se più sorgenti
propongono numeri diversi per lo stesso potenziale, l'utente sceglie (finestra
di conflitto non bloccante, con la scelta ricordata sul filo).

### 4.4 Libreria simboli ed editor di simboli

- **Editor di simboli nell'MVP**: un secondo spazio di lavoro dell'app, con le
  stesse regole di semplicità dell'editor di schemi. Permette di:
  - disegnare la grafica con primitive (linea, polilinea, arco, cerchio,
    rettangolo, testo) su griglia fine, con aggancio;
  - posizionare i terminali (nome, orientamento) e il punto di inserimento;
  - definire tipo (semplice, master, slave, morsetto, rimando…), campi
    predefiniti e collegamenti interni tra terminali;
  - vedere un'anteprima del simbolo come apparirà nello schema (ruotato,
    con sigla);
  - salvare nella libreria personale, duplicare un simbolo esistente come base,
    esportare/importare il singolo simbolo.
- **Libreria personale**: salvata in IndexedDB, organizzata per categorie, con
  ricerca e preferiti; esportabile nel pacchetto (5.3).
- **Simboli nel progetto**: quando un simbolo viene usato, la sua definizione
  viene copiata nel progetto, così il file è autosufficiente. Se il simbolo
  nella libreria cambia, l'app propone di aggiornare le copie nel progetto.
- **Simboli di base**: CableWire distribuisce un piccolo set iniziale disegnato
  con il nostro editor (contatti NA/NC, bobina, pulsanti, lampade, motore,
  interruttore, fusibile, morsetto, alimentazione, rimando), con licenza
  dichiarata nel file del simbolo.
- La libreria di QElectroTech (CC-BY 3.0, con divieto d'uso come dati di
  addestramento ML) si potrà importare in fase 3, con attribuzione.

### 4.5 Predisposizione alla collaborazione

Anche senza implementarla, il modello rispetta tre regole che la renderanno
possibile senza riscrivere tutto:

1. ogni oggetto ha un **id stabile** (UUID), mai indici di array;
2. le collezioni sono **mappe per id** + una lista d'ordine separata dove
   serve (fogli);
3. le modifiche sono **patch serializzabili**, già usate per l'undo.

Con questo, passare in futuro a un CRDT (es. Yjs) o a uno scambio di patch è
un adattatore, non un rifacimento.

## 5. Formati

### 5.1 Formati nativi

| File | Contenuto |
|---|---|
| **`.cwp`** (progetto) | JSON semplice: il modello sopra, versionato con `formatVersion`, con i simboli incorporati (immagini in base64). Un'eventuale variante compressa sarà `.cwpz` (vedi [formats-design.md](formats-design.md)) |
| **`.cwsym`** (simbolo) | JSON di un singolo `SymbolDef`, per condividere un simbolo |
| **`.cwpack`** (pacchetto) | zip con `manifest.json` e, a scelta, regole di autonumerazione, cartigli, preferenze, simboli (vedi 5.3) |

- JSON leggibile, adatto a git e a diff; schema documentato in `docs/`.
- Migrazioni di formato scritte e testate a ogni cambio di `formatVersion`.

### 5.2 Compatibilità con QElectroTech (fase 3)

Rinviata per concentrarsi sul prodotto standalone. Quando arriverà:
import/export `.qet`/`.qetz`, import/export `.elmt`, import della libreria QET
da un'installazione locale, conservazione dei dati non gestiti per non perdere
nulla nel giro QET → CableWire → QET. Versione minima di QET da definire allora.

### 5.3 Pacchetti di configurazione e libreria

Un `.cwpack` può contenere a scelta: regole di autonumerazione, cartigli,
preferenze di disegno (griglia, stili fili, colori), simboli personali.
All'import si mostra il contenuto e si chiede cosa unire o sostituire.

## 6. Interazione (cosa rende l'editor semplice)

- Griglia e aggancio a terminali, punti di piega e assi degli altri elementi.
- Filo: clic su un terminale, percorso ortogonale proposto automaticamente,
  clic sul terminale di arrivo; maniglie per spostare i tratti.
- Spostare un elemento trascina i fili mantenendoli ortogonali.
- Tastiera: R ruota, M specchia, Canc elimina, Ctrl+Z/Y, Ctrl+D duplica,
  ricerca rapida simboli con un tasto.
- Pannello proprietà sempre visibile al posto delle finestre modali.
- Editor di simboli con gli stessi strumenti, scorciatoie e pannelli.
- Su tablet: modalità consultazione (zoom, pan, evidenzia potenziale, ricerca).

## 7. Qualità

- `core` e `formats` con test unitari estesi; progetti di esempio usati come
  test di regressione (apri → salva → riapri identico).
- Test end-to-end Playwright sui casi d'uso UC1–UC6.
- Obiettivo prestazioni MVP: progetto di 50 fogli / 2.000 elementi apribile in
  meno di 3 s e interazione fluida sul foglio corrente (si disegna solo il foglio
  visibile).
- CI su GitHub Actions: lint, typecheck, test, build del sito statico.

## 8. Roadmap

### Fase 0 — Fondamenta (questo documento)
Scelte, repository, documento approvato, scheletro, CI vuota.

### Fase 1 — MVP standalone "disegno, numero, stampo"
Criterio di uscita: **UC1–UC4 funzionano e UC6 in SVG/stampa; un utente
crea i propri simboli, disegna uno schema di comando su più fogli, lo numera,
lo salva e lo riapre identico.**

1. `core`: modello, comandi, undo/redo, potenziali.
2. `render`: simboli, fili, testi, foglio con riquadro e cartiglio semplice.
3. `formats`: formato nativo `.cwp` e `.cwsym`, con migrazioni.
4. Editor di simboli e libreria personale (ricerca, categorie, preferiti) +
   set di simboli di base.
5. `editor` di schemi: inserimento simboli, fili ortogonali con aggancio,
   selezione, spostamento, rotazione, proprietà.
6. Autonumerazione fili (regole base + terminale/sigla/indirizzo PLC con scelta
   in caso di conflitto) ed evidenziazione del potenziale.
7. Salvataggio automatico, apri/salva su disco, export SVG/PNG, stampa.
8. PWA offline e pubblicazione su GitHub Pages.

### Fase 2 — Funzioni da quadrista
Riferimenti incrociati master/slave, rimandi di foglio, morsettiere, cartigli
personalizzabili, distinta e lista fili in CSV, export PDF di più fogli,
pacchetti `.cwpack` (UC5).

### Fase 3 — Compatibilità e integrazioni
Import/export QElectroTech (`.qet`, `.qetz`, `.elmt`, libreria QET),
master/slave PLC e lista I/O, export DXF, prestazioni su progetti grandi,
modalità tablet rifinita.

### Fase 4 — Collaborazione (da valutare)
Condivisione progetto e modifica contemporanea (CRDT), eventualmente con un
piccolo server self-hostable opzionale. Si decide solo dopo la fase 2.

## 9. Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Interazione (fili ortogonali, aggancio) più difficile del previsto | Alto | È il cuore dell'MVP: prototipo presto, prove a mano dall'utente a ogni passo |
| Ambizione eccessiva / progetto di una persona | Alto | Roadmap a fasi con criteri di uscita, MVP stretto, niente funzioni fuori fase |
| Editor di simboli che allunga l'MVP | Medio | Primitive essenziali soltanto; riuso degli strumenti dell'editor di schemi |
| Libreria iniziale povera finché manca l'import da QET | Medio | Set di base curato per comando/potenza; import QET in fase 3 |
| Modello che si allontana da QET e rende difficile il ponte di fase 3 | Medio | Concetti allineati a QET fin d'ora (4.1), verifica di mappatura prima della fase 3 |
| Fedeltà PDF/stampa | Medio | SVG come base, prove comparative in fase 2 prima di scegliere la libreria |
| File System Access API assente su Firefox/Safari | Medio | Ripiego download/upload + IndexedDB; dirlo chiaramente nell'interfaccia |
| Perdita dati nel browser (pulizia cache, IndexedDB svuotato) | Alto | Avviso se il progetto o la libreria non sono salvati su disco, richiesta di storage persistente, export rapido |
| Prestazioni SVG su fogli molto densi | Medio | Render solo del foglio visibile, aggiornamenti incrementali, canvas come piano B |

## 10. Licenza e governance

- Codice: **AGPL-3.0-or-later** (file `LICENSE`). Anche chi ospita una versione
  modificata come servizio web deve pubblicarne i sorgenti.
- Simboli distribuiti con CableWire: licenza dichiarata in ogni simbolo;
  materiale di terze parti elencato in `THIRD_PARTY.md` quando ne includeremo.
- Contributi: inizialmente DCO (firma `Signed-off-by` nei commit), niente CLA.
- Lingua: documentazione di progetto in italiano; codice, commenti e messaggi
  di commit in inglese; interfaccia italiana e inglese fin dall'MVP.

## 11. Decisioni

| # | Domanda | Decisione |
|---|---|---|
| D1 | Framework dell'interfaccia | Svelte 5 |
| D2 | Tecnica di export PDF | Da decidere in fase 2 dopo prove |
| D3 | Estensioni dei file nativi | `.cwp` (progetto), `.cwsym` (simbolo), `.cwpack` (configurazioni/libreria) |
| D4 | Compatibilità QElectroTech | Rinviata alla fase 3; versione minima da definire allora |
| D5 | Libreria simboli | Editor di simboli e libreria personale nell'MVP, set di base nostro; libreria QET importabile in fase 3 |
| D6 | Lingua di codice e commit | Inglese; documenti in italiano; interfaccia it/en |

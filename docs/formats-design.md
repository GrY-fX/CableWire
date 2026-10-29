# Design di `@cablewire/formats`

> Stato: **approvato** · fase 1, punto 3 · 29 ottobre 2026
> Le scelte **[F#]** sono riassunte in fondo.

## 1. Obiettivo del punto 3

Trasformare progetti e simboli in file e viceversa, in modo **sicuro** (un
file rovinato o di una versione futura non deve mai corrompere lo stato
dell'app) e **stabile** (salvare due volte lo stesso progetto produce lo stesso
file).

Il pacchetto lavora solo su testo e byte: aprire/salvare su disco, salvataggio
automatico in IndexedDB e scelta del file sono del punto 7 (`apps/web`).

API:

```ts
serializeProject(doc: ProjectDoc): string | Uint8Array
parseProject(data: string | Uint8Array): Result<ProjectDoc>   // valida e migra
serializeSymbol(symbol: SymbolDef): string
parseSymbol(text: string): Result<SymbolDef>
```

## 2. Contenitore del progetto `.cwp` **[F1]**

Il documento di progetto (sezione 5.1) prevede uno zip con `project.json`.
Scrivendo il design è emerso un conflitto con l'obiettivo "adatto a git e a
diff": uno zip è binario, git non ne mostra le differenze.

| | JSON semplice | Zip con `project.json` |
|---|---|---|
| Diff in git, lettura con un editor di testo | Sì | No (va estratto) |
| Dimensione | Più grande (≈ 1–3 MB per 50 fogli) | 5–10 volte più piccolo |
| Immagini (es. logo nel cartiglio, fase 2) | In base64 dentro il JSON | File separati nello zip |
| Complessità | Minima | Libreria zip (fflate, ~8 KB) |

Proposta: **JSON semplice** per `.cwp`. Se un giorno servisse, lo zip può
diventare un secondo formato (es. `.cwpz`, come `.qet`/`.qetz` in QET) senza
cambiare il contenuto. Il pacchetto `.cwpack` (fase 2) resta uno zip perché
contiene più file.

## 3. Struttura dei file

### 3.1 Progetto

```json
{
  "format": "cablewire-project",
  "formatVersion": 1,
  "app": "CableWire 0.1.0",
  "meta": { ... },
  "settings": { ... },
  "sheetOrder": [ ... ],
  "sheets": { ... },
  "symbols": { ... },
  "elements": { ... },
  "wires": { ... },
  "junctions": { ... }
}
```

È il `ProjectDoc` di `core` con in più `format` (riconoscimento del file) e
`app` (chi l'ha scritto, solo informativo).

### 3.2 Simbolo `.cwsym`

```json
{ "format": "cablewire-symbol", "formatVersion": 1, "app": "...", "symbol": { ... } }
```

### 3.3 Stabilità per i diff

- Indentazione di 2 spazi, una proprietà per riga.
- Chiavi delle tabelle (`sheets`, `elements`, …) ordinate; proprietà di ogni
  oggetto in ordine fisso. Così una modifica a un elemento cambia solo le
  righe di quell'elemento.
- Numeri arrotondati a 1/1000 di mm per evitare residui come `12.500000001`.
- `meta.updatedAt` si aggiorna al salvataggio (lo fa il punto 7, non il
  serializzatore).

## 4. Lettura sicura

All'apertura, nell'ordine:

1. **Parsing JSON** — errore chiaro se il file non è JSON.
2. **Riconoscimento** — `format` deve essere quello atteso.
3. **Versione** — se `formatVersion` è **più recente** di quella che l'app
   conosce, il file si rifiuta con il messaggio "creato con una versione più
   nuova di CableWire" (nessun tentativo di apertura parziale). Se è **più
   vecchia**, si applicano le migrazioni in catena (`1 → 2 → 3 …`).
4. **Schema** **[F2]** — controllo di forma e tipi di ogni campo, con messaggi
   che indicano il percorso (`elements.<id>.x: atteso un numero`).
5. **Coerenza** — `validate()` di `core` (riferimenti, terminali, fogli).
   Se trova problemi il file non si apre e l'elenco viene mostrato.

Proprietà sconosciute vengono scartate (con un avviso), così un file un po'
"sporco" si apre lo stesso. Nessuna riparazione automatica nel punto 3: se
servirà, sarà un comando esplicito "ripara progetto".

### 4.1 Migrazioni

```
packages/formats/src/migrations/
  index.ts      registro: { from: 1, to: 2, migrate(json) } …
```

Ogni migrazione è una funzione pura su JSON grezzo, con test che parte da un
file di esempio della versione precedente. Nel punto 3 c'è solo la versione 1,
quindi il registro è vuoto ma il meccanismo è pronto e testato con una
migrazione finta.

## 5. Test

- Andata e ritorno: `parse(serialize(doc))` uguale a `doc` (anche sui progetti
  generati dai test casuali di `core`).
- Stabilità: serializzare due volte dà lo stesso testo; spostare un elemento
  cambia solo le sue righe.
- Errori: JSON rotto, `format` sbagliato, versione futura, campi mancanti o di
  tipo sbagliato, riferimenti rotti → messaggi attesi.
- File di esempio versionati in `packages/formats/fixtures/` usati come test
  di regressione per le versioni future.

## 6. Struttura dei file sorgente

```
packages/formats/src/
  project.ts      serializeProject / parseProject
  symbol.ts       serializeSymbol / parseSymbol
  schema.ts       schema di forma per ProjectDoc e SymbolDef
  stable-json.ts  JSON con chiavi ordinate e numeri arrotondati
  migrations/
  index.ts
packages/formats/fixtures/
  demo-v1.cwp
```

## 7. Scelte

| # | Scelta | Decisione | Alternativa scartata |
|---|---|---|---|
| F1 | Contenitore `.cwp` | JSON semplice (zip eventualmente come `.cwpz` in futuro) | Zip con `project.json`, come scritto in progetto.md |
| F2 | Controllo dello schema | Libreria Valibot (~5 KB usati, tipi TypeScript ricavati dallo schema) | Controlli scritti a mano |

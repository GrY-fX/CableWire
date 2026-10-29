# Design di `@cablewire/render`

> Stato: **approvato** · fase 1, punto 2 · 29 ottobre 2026
> Le scelte **[R#]** sono riassunte in fondo.

## 1. Obiettivo del punto 2

Dato un `ProjectDoc` e un foglio, produrre il disegno del foglio:

- riquadro con numerazione di colonne e righe e un cartiglio semplice;
- elementi (grafica del simbolo trasformata, testi con i valori dell'elemento);
- fili (polilinea con numero del filo) e giunzioni (pallino);
- stati visivi richiesti dall'editor: selezionato, potenziale evidenziato,
  anteprima (es. filo in costruzione).

Lo stesso disegno serve a tre usi: **editor** (aggiornato a ogni modifica),
**export SVG/PNG** e **stampa**. Fuori dal punto 2: cartigli personalizzabili
(fase 2), riferimenti incrociati sotto i contatti (fase 2), PDF.

## 2. Architettura: una "scena" e due uscite **[R1]**

```
ProjectDoc + SheetId ──buildScene()──▶ Scene (oggetti JS semplici)
                                          ├─ toSvgString()  → export, stampa, test (anche in Node)
                                          └─ DomRenderer    → editor: aggiorna solo ciò che è cambiato
```

- **`buildScene(doc, sheetId)`** è una funzione pura: trasforma il modello in
  un albero di forme già posizionate (`group`, `path`, `circle`, `text`) con
  un `key` stabile (es. `element:<id>`, `wire:<id>`) e delle classi.
  Tutto il "come appare" (trasformazioni, testi, posizione del numero di filo,
  riquadro) si decide qui, una volta sola.
- **`toSvgString(scene)`**: SVG autonomo con stili incorporati, in millimetri
  (`viewBox` = dimensioni del foglio), quindi stampabile in scala reale.
- **`DomRenderer`**: mantiene un `<svg>` nel browser e, quando lo store
  segnala cosa è cambiato, ricostruisce e sostituisce solo i gruppi toccati
  (per chiave). Ogni gruppo ha `data-key`, così l'editor sa su cosa si è
  cliccato.
- Gli **stati visivi** non cambiano la scena: l'editor passa insiemi di chiavi
  (`selected`, `highlighted`) e il renderer applica classi CSS. Colori e
  spessori stanno in un unico foglio di stile.

Il pacchetto non dipende da Svelte: `apps/web` userà `DomRenderer` dentro un
componente.

## 3. Cosa disegna

### 3.1 Foglio

- Dimensioni ISO (A4–A0) in millimetri, verticale/orizzontale.
- Riquadro a 10 mm dal bordo (5 mm su A4), fascia con numeri di colonna in
  alto e lettere di riga a sinistra, come negli schemi IEC; colonne e righe da
  `sheet.cols` / `sheet.rows`.
- Cartiglio semplice in basso a destra: titolo del progetto, titolo del
  foglio, numero foglio `n / N`, autore, data. In fase 2 diventerà un modello
  personalizzabile.
- Griglia di aggancio: **solo a video**, disegnata dal `DomRenderer` come
  pattern, mai nell'export.

### 3.2 Elementi

- Grafica del simbolo con rotazione/specchio applicati come `transform` del
  gruppo.
- **Testi dinamici [R3]**: un testo del simbolo può contenere segnaposto
  `{label}`, `{function}`, `{plc_address}`… sostituiti con `element.info`.
  I testi restano **sempre leggibili**: con rotazione 180° o 270° vengono
  girati di 180° in più, come fa il disegno tecnico (si leggono dal basso o da
  destra).
- Terminali: un piccolo segno solo a video (aiuta l'aggancio), non nell'export.

### 3.3 Fili e giunzioni

- Polilinea `from → bends → to`, con estremi calcolati da `endPosition`.
- Numero del filo al centro del tratto più lungo, sopra i tratti orizzontali e
  a sinistra di quelli verticali (ruotato di 90°).
- Giunzione: pallino pieno Ø 1 mm.
- A video ogni filo ha anche una fascia invisibile larga 2 mm per poterlo
  cliccare facilmente; non compare nell'export.
- Estremo non risolto (dato incoerente): il filo non si disegna e viene
  segnalato in console in sviluppo.

### 3.4 Stile

| Cosa | Valore proposto |
|---|---|
| Carta | Sempre bianca con tratto nero, anche con l'interfaccia in tema scuro (è un disegno da stampare) |
| Spessori | Simboli e fili 0,25 mm, riquadro 0,5 mm |
| Testi | Altezza 2,5 mm (etichette), 3,5 mm (cartiglio) |
| Selezione / potenziale | Colori solo a video (es. blu selezione, arancio potenziale) |

### 3.5 Carattere **[R2]**

Per avere lo stesso risultato a video, in export e su ogni PC, il carattere
va incluso nell'app. Proposta: **osifont** (lettering tecnico ISO 3098,
GPL-3.0 con eccezione per i font, compatibile con AGPL), incorporato nell'SVG
esportato come sottoinsieme quando serve. Alternativa: un sans-serif di sistema
(nessun file in più, ma l'export cambia da PC a PC).

## 4. Prestazioni

- `buildScene` per un intero foglio è lineare nel numero di oggetti del
  foglio; il `DomRenderer` ricostruisce solo i gruppi cambiati.
- Si disegna solo il foglio visibile; la scena di un foglio è memorizzata per
  versione del documento (come i potenziali).

## 5. Test

- `buildScene`: posizioni dei terminali ruotati/specchiati, testi dinamici e
  leggibilità, posizione del numero di filo, riquadro e cartiglio.
- `toSvgString`: confronto con file di riferimento (snapshot) per un foglio di
  esempio, più verifica che l'SVG sia XML valido.
- `DomRenderer`: test in ambiente DOM simulato (happy-dom) che dopo una
  modifica cambia solo il gruppo interessato.
- Verifica a occhio: un foglio di esempio mostrato in `apps/web`.

## 6. Modifiche al modello di `core`

- Il primitivo `text` accetta segnaposto `{campo}` (nessun cambio di tipo, solo
  una convenzione documentata) e un allineamento opzionale
  (`anchor: 'start' | 'middle' | 'end'`).
- Nessun'altra modifica.

## 7. Struttura dei file

```
packages/render/src/
  scene.ts        tipi della scena
  sheet.ts        formati ISO, riquadro, cartiglio
  build.ts        buildScene(doc, sheetId)
  text.ts         segnaposto e leggibilità dei testi
  svg-string.ts   toSvgString(scene)
  dom.ts          DomRenderer
  style.ts        foglio di stile condiviso
  index.ts
```

## 8. Scelte

| # | Scelta | Decisione | Alternativa scartata |
|---|---|---|---|
| R1 | Architettura | Scena unica + uscita SVG testuale + renderer DOM incrementale | Componenti Svelte per l'editor e funzione separata per l'export |
| R2 | Carattere | osifont incluso | Sans-serif di sistema |
| R3 | Testi dei simboli | Segnaposto `{campo}` nei testi del simbolo | Campi posizionati a parte, fuori dalla grafica (come i "testi dinamici" di QET) |

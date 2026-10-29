# Design dell'editor di simboli e della libreria

> Stato: **approvato** · fase 1, punto 4 · 29 ottobre 2026
> Dettaglia la sezione 4.4 di [progetto.md](progetto.md). Le scelte **[S#]**
> sono riassunte in fondo.

## 1. Obiettivo

Un utente crea un simbolo da zero (o partendo da uno esistente), lo salva
nella propria libreria, lo ritrova con la ricerca e lo esporta/importa come
`.cwsym`. CableWire offre un set di simboli di base da cui partire.

È il primo pezzo con un'interfaccia vera: le basi dell'interazione scritte qui
(vista con zoom, aggancio, strumenti, selezione, maniglie) saranno riusate
dall'editor di schemi al punto 5.

Per tenere i passi piccoli e verificabili, il punto 4 si divide in due commit:

- **4a — editor**: basi dell'interazione in `packages/editor` e spazio di
  lavoro "Simboli" con disegno, terminali, proprietà, anteprima, undo.
- **4b — libreria**: archivio nel browser, ricerca e categorie, set di base,
  import/export `.cwsym`.

## 2. Interfaccia

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CableWire   [Schema] [Simboli]                                  ...      │
├────────────┬───────────────────────────────────────────┬─────────────────┤
│ Libreria   │ Strumenti: ⬚ Seleziona  ╱ Linea  ⌇ Polilinea  ▭ Rettangolo   │
│ 🔍 cerca   │ ◯ Cerchio  ◠ Arco  T Testo  ⊕ Terminale                      │
│ ▸ Base     ├───────────────────────────────────────────┤ Proprietà       │
│   Contatti │                                           │ (della selezione │
│   Bobine   │        area di disegno del simbolo        │  o del simbolo)  │
│ ▸ Personali│        (zoom, griglia fine, origine)      │                 │
│   ...      │                                           │ Terminali       │
│ ★ Preferiti│                                           │ Collegamenti int.│
│ [Nuovo]    ├───────────────────────────────────────────┤ Anteprima 0/90/ │
│ [Importa]  │ barra di stato: coordinate, griglia, aiuto│ 180/270°        │
└────────────┴───────────────────────────────────────────┴─────────────────┘
```

- Le due schede **Schema / Simboli** sono gli spazi di lavoro dell'app; la
  scheda Schema per ora mostra il foglio di prova attuale.
- **Proprietà** mostra i campi della forma selezionata (coordinate, raggio,
  testo, riempito…) oppure, senza selezione, quelli del simbolo: nome,
  categoria, tipo, campi predefiniti (`label`, `function`…).
- **Anteprima**: il simbolo con la sigla compilata nelle quattro rotazioni,
  così si vede subito se i testi restano leggibili.

## 3. Interazione

| Azione | Come |
|---|---|
| Zoom | Rotella (centrato sul cursore), `+`/`-`, `0` adatta alla vista |
| Spostare la vista | Trascinare con il tasto centrale, oppure `Spazio` + trascinamento |
| Linea | Clic sul punto iniziale, clic sul punto finale |
| Polilinea | Clic per ogni vertice, doppio clic o `Invio` per finire, clic sul primo punto per chiuderla |
| Rettangolo | Trascinare da un angolo all'altro |
| Cerchio | Clic al centro, clic sul raggio |
| Arco | Clic al centro, clic sull'inizio, clic sulla fine (verso orario) |
| Testo | Clic sul punto, scrittura nel pannello; pulsanti rapidi per `{label}`, `{function}` … |
| Terminale | Clic sul punto, direzione proposta in base al lato più vicino al bordo del simbolo |
| Selezione | Clic, `Maiusc`+clic per aggiungere, trascinamento su area vuota per la selezione a rettangolo |
| Modifica | Trascinare per spostare; maniglie sui vertici (estremi della linea, vertici della polilinea, angoli del rettangolo, raggio del cerchio, posizione del terminale) |
| Tastiera | `Canc` elimina, frecce spostano di un passo di griglia, `Ctrl+D` duplica, `Ctrl+Z`/`Ctrl+Y`, `Esc` torna a Seleziona |

**Griglia [S2]**: le forme si agganciano a una griglia fine; i **terminali
sono sempre sulla griglia di 2,5 mm**, così nello schema i fili restano
allineati. L'origine (punto di inserimento) è sempre al centro della vista, ben
visibile.

## 4. Architettura

### 4.1 `packages/editor` (senza Svelte, riusato al punto 5)

```
editor/src/
  viewport.ts     zoom/pan, conversione schermo ↔ millimetri
  snap.ts         aggancio a griglia (e, dal punto 5, a terminali e fili)
  hit.ts          ricerca dell'oggetto sotto il cursore (distanza da segmenti, archi…)
  tool.ts         interfaccia degli strumenti: pointerDown/Move/Up, key, anteprima
  history.ts      undo/redo a istantanee (vedi S1)
  symbol/
    document.ts   modello in modifica del simbolo
    tools.ts      Seleziona, Linea, Polilinea, Rettangolo, Cerchio, Arco, Testo, Terminale
    handles.ts    maniglie per forma
    checks.ts     controlli prima del salvataggio
```

Gli strumenti ricevono eventi già convertiti in millimetri e agganciati, e
restituiscono una nuova versione del simbolo più un'"anteprima" da disegnare
(es. la linea mentre la si traccia). L'interfaccia Svelte collega eventi del
mouse, strumenti, pannelli e `DomRenderer`.

### 4.2 Undo del simbolo: istantanee **[S1]**

Un simbolo pesa pochi KB ed è immutabile: ogni modifica produce un nuovo
`SymbolDef` e lo storico conserva le versioni precedenti (fino a 200). È più
semplice delle operazioni per id usate nel progetto e adatto alle liste
(`graphics`, `terminals`) che non hanno id. Il trascinamento crea una sola voce
di undo, come le transazioni di `core`.

### 4.3 `packages/render`

- `buildSymbolScene(symbol, options)`: forme selezionabili con chiave
  (`shape:<indice>`, `terminal:<id>`), origine, maniglie e anteprima
  dello strumento, riusando `primitivePath` e le regole dei testi.
- Il `DomRenderer` si estende con un livello "overlay" (maniglie, anteprima,
  rettangolo di selezione) e accetta un `viewBox` libero (zoom).

### 4.4 Libreria (4b)

- **Archivio**: IndexedDB nel browser (piccolo modulo senza dipendenze), con i
  simboli personali e i preferiti. Richiesta di storage persistente al primo
  salvataggio.
- **Simboli di base**: file `.cwsym` in `apps/web/src/library/base/`, inclusi
  nell'app e in sola lettura; "Duplica" crea una copia personale modificabile.
- **Categorie**: dal campo `category` del simbolo (testo libero con
  suggerimenti), raggruppate nel pannello Libreria; ricerca per nome e
  categoria.
- **Import/export**: esporta il simbolo aperto in `.cwsym`; importa uno o più
  `.cwsym` (se l'id esiste già: sostituisci, tieni entrambi o annulla).
- **Versioni**: ogni salvataggio incrementa `version`. L'aggiornamento delle
  copie nei progetti arriva con l'editor di schemi.

### 4.5 Set di base (4b)

Circa 20 simboli disegnati con il nostro editor, secondo IEC 60617:
contatto NA/NC, contatto di scambio, bobina, pulsanti NA/NC, selettore,
interruttore magnetotermico, fusibile, salvamotore, contattore di potenza
(3 poli), motore trifase, lampada, morsetto, rimando di foglio (uscita/entrata),
alimentazione +/−, terra/PE.

**Licenza [S3]** dei simboli di base: separata dal codice, dichiarata in ogni
file e in `THIRD_PARTY.md`.

## 5. Controlli al salvataggio

- Errori (bloccano): nome vuoto, terminali fuori dalla griglia di 2,5 mm,
  id di terminale duplicati, collegamenti interni verso terminali inesistenti.
- Avvisi (non bloccano): nessun terminale, nomi di terminale ripetuti, nessun
  testo `{label}`, grafica lontana dall'origine.

## 6. Test

- `editor`: viewport (conversioni e zoom sul cursore), aggancio, hit test,
  ogni strumento (sequenza di eventi → simbolo atteso), maniglie, storico,
  controlli.
- `render`: scena del simbolo e overlay.
- Libreria: archivio con IndexedDB simulato (`fake-indexeddb`), import con id
  duplicati, set di base che si legge tutto senza errori.
- Prova a mano nel browser a fine 4a e 4b.

## 7. Scelte

| # | Scelta | Decisione | Alternative scartate |
|---|---|---|---|
| S1 | Undo nell'editor di simboli | Istantanee del simbolo | Operazioni per id come nel progetto (richiede id per ogni forma) |
| S2 | Griglia fine delle forme | 0,5 mm (terminali sempre a 2,5 mm) | 1,25 mm; nessuna griglia |
| S3 | Licenza dei simboli di base | CC0 (riuso libero, anche in altri programmi) | CC-BY 4.0 (con attribuzione); AGPL come il codice |

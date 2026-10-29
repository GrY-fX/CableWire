# Design di `@cablewire/core`

> Stato: **approvato** · fase 1, punto 1 · 29 ottobre 2026
> Dettaglia la sezione 4 di [progetto.md](progetto.md). Le scelte **[C#]** sono
> riassunte in fondo.

## 1. Obiettivo del punto 1

Al termine, `core` deve offrire (senza interfaccia, solo codice e test):

- il **documento** di progetto (fogli, simboli, elementi, fili, giunzioni);
- i **comandi** per modificarlo, ognuno reversibile;
- **undo/redo** con raggruppamento (es. un trascinamento = un solo undo);
- il calcolo dei **potenziali**;
- la **validazione** del documento (riferimenti coerenti).

Restano fuori dal punto 1: autonumerazione, riferimenti incrociati, cartigli,
liste (arrivano nei punti successivi, sopra questa base).

## 2. Il documento: tabelle piatte per id **[C1]**

Invece di annidare elementi e fili dentro i fogli, ogni tipo di oggetto vive in
una **tabella piatta** `Record<Id, Oggetto>`; l'appartenenza al foglio è un
campo (`sheetId`). È lo stesso principio di un database normalizzato.

Perché: ogni modifica tocca un solo indirizzo `(tabella, id)`; patch, undo,
salvataggio e una futura sincronizzazione restano semplici; spostare un
elemento su un altro foglio è cambiare un campo.

```ts
type Id<T extends string> = string & { readonly __kind: T }; // UUID tipizzato

interface ProjectDoc {
  formatVersion: 1;
  meta: { title: string; author: string; createdAt: string; updatedAt: string };
  settings: { gridStep: number; /* altro nei punti successivi */ };
  sheetOrder: SheetId[];                       // ordine dei fogli
  sheets:    Record<SheetId, Sheet>;
  symbols:   Record<SymbolId, SymbolDef>;      // copie incorporate
  elements:  Record<ElementId, Element>;
  wires:     Record<WireId, Wire>;
  junctions: Record<JunctionId, Junction>;
}

interface Sheet    { id: SheetId; title: string; size: 'A4' | 'A3' | ...; orientation: 'landscape' | 'portrait'; rows: number; cols: number }
interface Element  { id: ElementId; sheetId: SheetId; symbolId: SymbolId;
                     x: number; y: number; rotation: 0 | 90 | 180 | 270; mirrored: boolean;
                     info: Record<string, string>;   // label, function, plc_address, …
                     link?: ElementId }              // rimando/slave → partner (usato nei punti successivi)
interface Junction { id: JunctionId; sheetId: SheetId; x: number; y: number }
type WireEnd = { element: ElementId; terminal: TerminalId } | { junction: JunctionId };
interface Wire     { id: WireId; sheetId: SheetId; from: WireEnd; to: WireEnd;
                     bends: Point[];                 // punti di piega intermedi (ortogonali)
                     props: { number?: string; numberLocked?: boolean; section?: string; color?: string } }

interface SymbolDef {
  id: SymbolId; name: string; category: string; kind: 'simple' | 'master' | 'slave' | 'report' | 'terminal' | 'plc';
  graphics: Primitive[];                  // line | polyline | arc | circle | rect | text
  terminals: { id: TerminalId; name: string; x: number; y: number; dir: 'n' | 'e' | 's' | 'w' }[];
  bridges: [TerminalId, TerminalId][];    // collegamenti interni (stesso potenziale)
  defaultInfo: Record<string, string>;
  version: number;
}
```

Il documento è **JSON puro** (niente classi, niente `Map`): è direttamente il
`project.json` del file `.cwp`.

## 3. Unità e coordinate **[C2]**

- Unità: **millimetri**, coordinate del foglio con origine in alto a sinistra,
  asse Y verso il basso (come SVG).
- Griglia di aggancio predefinita **2,5 mm** (multipli usati nel disegno
  tecnico IEC), configurabile.
- Simboli disegnati su griglia di 2,5 mm, terminali sempre sulla griglia:
  così i fili restano ortogonali e allineati.
- Rotazioni solo a multipli di 90°, specchio orizzontale.

## 4. Modifiche: operazioni, comandi, transazioni

### 4.1 Operazioni elementari (le "patch")

Il documento si modifica **solo** tramite tre operazioni sulle tabelle:

```ts
type Op =
  | { op: 'put';    table: Table; id: string; value: object }         // crea o sostituisce
  | { op: 'patch';  table: Table; id: string; set: object }           // aggiorna campi
  | { op: 'delete'; table: Table; id: string }
  | { op: 'meta';   set: Partial<Pick<ProjectDoc, 'meta' | 'settings' | 'sheetOrder'>> };
```

Applicando un'operazione si ottiene il nuovo documento **e la sua inversa**
(es. l'inversa di `delete` è un `put` del valore precedente). Il documento è
trattato come immutabile: si copiano solo gli oggetti toccati, il resto è
condiviso; quindi confrontare due stati è un confronto di riferimenti.

### 4.2 Comandi

Un comando è una **funzione pura** `(doc, argomenti) → Op[]` con un'etichetta
per il menu Annulla. Esempi del punto 1:

| Comando | Effetto |
|---|---|
| `updateProjectMeta`, `updateSettings` | Dati del progetto e impostazioni (es. griglia) |
| `addSheet`, `removeSheet`, `updateSheet`, `moveSheet` | Gestione fogli (rimuovere un foglio rimuove il suo contenuto) |
| `importSymbol` | Copia un `SymbolDef` nel progetto |
| `placeElement`, `moveItems`, `rotateElements`, `mirrorElements`, `setElementInfo` | Elementi (`moveItems` sposta anche giunzioni e pieghe dei fili interni alla selezione) |
| `removeItems` | Elimina elementi/fili/giunzioni; elimina anche i fili rimasti senza un estremo |
| `addWire`, `setWireBends`, `setWireProps` | Fili |
| `splitWire` | Crea una giunzione su un filo e lo divide in due (derivazione a T) |

I comandi verificano le precondizioni (es. il terminale esiste) e restituiscono
un errore tipizzato invece di lanciare eccezioni.

### 4.3 Store, transazioni e undo

```ts
const store = createStore(doc);
store.run(placeElement, { ... });         // una transazione = una voce di undo
store.begin('Sposta');                    // transazione aperta (trascinamento)
store.run(moveElements, { ... }); store.run(moveElements, { ... });
store.commit();                           // unisce tutto in una sola voce
store.undo(); store.redo();
store.subscribe((doc, changes) => …);     // changes = (tabella, id) toccati
```

- Lo stack di undo contiene le **inverse** delle operazioni; dimensione massima
  configurabile (default 200 voci).
- `subscribe` comunica cosa è cambiato: render e calcoli derivati aggiornano
  solo il necessario. L'adattamento a Svelte sarà in `apps/web`, non in `core`.

## 5. Potenziali **[C3]**

- Nodi del grafo: ogni terminale di elemento (`elementId:terminalId`) e ogni
  giunzione.
- Archi: ogni filo; ogni `bridge` dei simboli (morsetti passanti, contatti di
  rimando interni); più avanti, le coppie di rimandi tra fogli (`link`).
- Algoritmo: **union-find**, ricalcolo completo memorizzato per versione del
  documento. Con 2.000 elementi e qualche migliaio di fili richiede pochi
  millisecondi, quindi **niente ricalcolo incrementale nel punto 1**: lo
  aggiungiamo solo se le misure lo richiedono.
- API: `potentialOf(node)`, `nodesOf(potential)`, `wiresOf(potential)`,
  usati da evidenziazione e numerazione.
- Un potenziale non ha un id salvato: è un risultato del calcolo. Il numero di
  filo resta salvato sui fili (sezione 4.2 di progetto.md).

## 6. Validazione

`validate(doc)` restituisce l'elenco dei problemi: riferimenti a oggetti
inesistenti, fili tra fogli diversi, terminali inesistenti nel simbolo,
`sheetOrder` incoerente. Usata nei test dopo ogni comando, all'apertura di un
file e (in sviluppo) dopo ogni transazione.

## 7. Test

- Ogni comando: test di effetto, test che `undo` riporta esattamente al
  documento precedente, test delle precondizioni.
- Proprietà generali con sequenze casuali di comandi: dopo N comandi e N
  undo il documento è identico all'iniziale, e `validate` non trova problemi.
- Potenziali: casi tipici (serie, derivazioni, morsetti passanti, fili
  eliminati).

## 8. Struttura dei file

```
packages/core/src/
  ids.ts          id tipizzati e generazione UUID
  model.ts        tipi del documento, createEmptyProject()
  ops.ts          operazioni e applicazione con inversa
  store.ts        store, transazioni, undo/redo, subscribe
  commands/       sheets.ts, symbols.ts, elements.ts, wires.ts
  potentials.ts   union-find e API
  validate.ts
  geometry.ts     punti, rotazioni, posizione assoluta dei terminali
  index.ts        API pubblica
```

## 9. Scelte

| # | Scelta | Decisione | Alternativa scartata |
|---|---|---|---|
| C1 | Struttura del documento | Tabelle piatte per id con `sheetId` | Oggetti annidati foglio → elementi/fili |
| C2 | Unità e griglia | Millimetri, griglia 2,5 mm | Unità astratte/pixel come QET (griglia 10) |
| C3 | Ricalcolo potenziali | Completo e memorizzato; incrementale solo se serve | Incrementale fin da subito |

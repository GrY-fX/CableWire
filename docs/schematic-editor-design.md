# Design dell'editor di schemi

> Stato: **approvato** · fase 1, punto 5 · 29 ottobre 2026
> Le scelte **[E#]** sono riassunte in fondo.

## 1. Obiettivo

Disegnare uno schema su più fogli: inserire simboli dalla libreria, collegarli
con fili ortogonali, spostare/ruotare/eliminare, modificare le proprietà, con
annulla e senza perdere il lavoro. È il cuore dell'MVP: deve essere **più
rapido di QElectroTech** per le operazioni di tutti i giorni.

Fuori dal punto 5: numerazione automatica dei fili (punto 6), apri/salva su
disco ed export (punto 7), riferimenti incrociati e morsettiere (fase 2).

Diviso in due commit verificabili:

- **5a — elementi e fogli**: inserimento dalla libreria, selezione, sposta,
  ruota, specchia, elimina, copia/incolla, proprietà, fogli, salvataggio
  automatico.
- **5b — fili**: disegno con percorso ortogonale, derivazioni, modifica dei
  tratti, fili che seguono gli elementi, evidenziazione del potenziale.

## 2. Interfaccia

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CableWire   [Schema] [Simboli]                         progetto: Quadro pompa│
├────────────┬────────────────────────────────────────────────┬────────────────┤
│ Libreria   │ ⬚ Seleziona  ⌐ Filo   ↶ ↷   − + Adatta   Griglia│ Proprietà      │
│ 🔍 cerca   ├────────────────────────────────────────────────┤ (elemento,     │
│ ★ Preferiti│                                                │  filo o foglio)│
│ Personali  │              foglio (zoom, pan, griglia)       │                │
│ Base       │                                                │                │
│  …         │                                                │                │
│            ├────────────────────────────────────────────────┤                │
│            │ [1 Comando] [2 Potenza] [+]        stato/aiuto  │                │
└────────────┴────────────────────────────────────────────────┴────────────────┘
```

- La **libreria** è la stessa della scheda Simboli (stessi dati, aggiornati in
  tempo reale).
- I **fogli** sono linguette in basso, come in un foglio di calcolo: clic per
  cambiare, doppio clic per rinominare, trascinamento per riordinare, `+` per
  aggiungere, menu per eliminare.
- Il pannello **Proprietà** mostra l'elemento selezionato (sigla, funzione,
  posizione `+`, indirizzo PLC e gli altri campi del simbolo), il filo
  selezionato (numero, sezione, colore) oppure, senza selezione, il foglio
  (titolo, formato, orientamento, righe/colonne) e il progetto (titolo, autore).

## 3. Elementi (5a)

| Azione | Come |
|---|---|
| Inserire | Clic su un simbolo della libreria: il simbolo segue il cursore agganciato alla griglia di 2,5 mm; clic per posarlo. Resta attivo per posarne altri; `Esc` per finire. `R` ruota e `M` specchia prima di posarlo |
| Selezionare | Clic; `Maiusc`+clic aggiunge; trascinamento su area vuota per il rettangolo di selezione |
| Spostare | Trascinare (passo 2,5 mm); frecce della tastiera |
| Ruotare / specchiare | `R` / `M` sulla selezione (intorno al punto di inserimento di ogni elemento) |
| Eliminare | `Canc` (elimina anche i fili rimasti senza un capo, come già fa `core`) |
| Copiare | `Ctrl+C` / `Ctrl+V` (anche su un altro foglio), `Ctrl+D` duplica accanto |
| Modificare la sigla | Doppio clic sull'elemento: il campo sigla del pannello prende il fuoco |

Il simbolo viene copiato nel progetto alla prima posa. **Simbolo cambiato in
libreria [E4]**: se nel progetto c'è già una versione diversa dello stesso
simbolo, cosa fare.

## 4. Fili (5b)

### 4.1 Disegno **[E1]**

Proposta "ibrida":

1. Strumento Filo (`W`) oppure clic su un terminale libero con lo strumento
   Seleziona.
2. Clic sul terminale (o su un filo esistente: crea una derivazione con
   giunzione) di partenza.
3. Il percorso ortogonale verso il cursore viene **proposto automaticamente**
   (a L o a Z, tenendo conto del lato da cui esce il terminale).
4. Clic in un punto vuoto fissa una piega e continua da lì (per guidare il
   percorso quando serve).
5. Clic sul terminale (o filo) di arrivo: il filo è creato. `Esc` annulla.

L'aggancio ai terminali è "magnetico" entro alcuni pixel; i terminali liberi
vicino al cursore si evidenziano. Un filo non può finire nel vuoto (ogni capo è
un terminale o una giunzione), come in QET.

### 4.2 Modifica

- Ogni tratto di un filo selezionato ha una maniglia al centro: trascinandola
  il tratto si sposta parallelamente a se stesso (le pieghe vicine seguono).
- Comando "Ricalcola percorso" per tornare al percorso automatico.
- Trascinare il capo di un filo su un altro terminale lo ricollega.

### 4.3 Elementi spostati **[E2]**

Cosa succede ai fili collegati quando si sposta un elemento.

### 4.4 Potenziale

Selezionando un filo si evidenzia tutto il suo potenziale (anche sugli altri
fogli, con un contatore "N fili su M fogli"), come nel foglio di prova attuale.

## 5. Salvataggio **[E3]**

Il salvataggio su disco (`.cwp`) arriva al punto 7. Per non perdere il lavoro
già da ora, proposta: **salvataggio automatico** del progetto aperto in
IndexedDB (un progetto alla volta), un secondo dopo ogni modifica, e riapertura
automatica all'avvio. "Nuovo progetto" chiede conferma. Il foglio di prova
attuale sparisce.

## 6. Architettura

```
packages/editor/src/schematic/
  controller.ts   SchematicEditor: strumenti, selezione, trascinamenti, tastiera;
                  modifica il progetto solo tramite i comandi e lo store di core
                  (undo/redo e transazioni già pronti)
  hit.ts          oggetto sotto il cursore: terminali, elementi, fili, giunzioni
  route.ts        percorso ortogonale tra due punti con direzioni di uscita
  clipboard.ts    copia/incolla con nuovi id
packages/core     comandi nuovi: reconnectWire, reroute…, paste
packages/render   overlay per l'editor di schemi: anteprima filo, simbolo
                  fantasma, maniglie, terminali vicini
apps/web/src/
  library/        stato della libreria condiviso tra le due schede
  schema/         spazio di lavoro Schema, linguette dei fogli, pannelli
```

`SchematicEditor` riusa `viewport`, `snap` e lo schema già usato da
`SymbolEditor` (eventi in millimetri dall'interfaccia, notifiche di
ridisegno). Il disegno usa `buildScene` + `DomRenderer`, che aggiorna solo gli
oggetti cambiati.

## 7. Test

- `route`: percorsi per ogni combinazione di direzioni dei terminali.
- `SchematicEditor`: sequenze di eventi → progetto atteso (inserimento,
  selezione, spostamento con fili, disegno di fili e derivazioni, copia/
  incolla, annulla), sempre con `validate()` attivo.
- Prove a mano nel browser a fine 5a e 5b.
- Prestazioni: foglio con 300 elementi e 500 fili, spostamento fluido
  (misura in un test con tempo massimo).

## 8. Scelte

| # | Scelta | Decisione | Alternative scartate |
|---|---|---|---|
| E1 | Disegno dei fili | Ibrido: percorso automatico proposto, clic nel vuoto per fissare pieghe | Solo automatico (nessuna piega a mano durante il disegno); solo manuale (ogni piega con un clic) |
| E2 | Fili quando si sposta un elemento | Mantengono la forma e si "allungano": si muovono solo i tratti vicini all'elemento | Ricalcolo automatico completo del percorso |
| E3 | Salvataggio nel punto 5 | Salvataggio automatico in IndexedDB del progetto aperto | Nessun salvataggio fino al punto 7 |
| E4 | Simbolo cambiato in libreria già usato nel progetto | Chiedere: aggiornare tutte le copie nel progetto o tenere la versione del progetto | Aggiornare sempre; non aggiornare mai (solo comando manuale) |

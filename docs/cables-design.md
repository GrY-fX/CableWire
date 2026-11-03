# Cavi — design

> Stato: **approvato e realizzato**. Codice: `packages/core/src/cables.ts`,
> `commands/cables.ts`, pannello `apps/web/src/schema/CablePanel.svelte`. Il segno
> si posiziona a un quarto del tratto comune (a metà ci sono i numeri dei fili).

## 1. Obiettivo

Più fili dello schema possono essere raccolti in un **cavo**, un oggetto del
progetto con le sue proprietà (sigla, tipo, sezione, lunghezza). Ogni filo del
cavo occupa un **conduttore**, riconosciuto dal colore (BN, BK, GY, BU, GNYE…)
o dal numero (1, 2, 3… nei cavi a conduttori numerati). Sullo schema il cavo
si vede come un **segno obliquo** che attraversa i suoi fili, con accanto
sigla e formazione:

```
   |   |   |
 --/---/---/--  W1 5G2,5
   |   |   |
```

## 2. Modello

### 2.1 Cavo **[K1]**

Nuova tabella `cables` del progetto (file vecchi: nessun cavo):

```ts
interface Cable {
  id: CableId;
  label: string;          // sigla, es. W1 (automatica: {foglio}W{n})
  type?: string;          // tipo commerciale, es. FG16OR16
  section?: string;       // sezione dei conduttori in mm², es. "2,5"
  length?: number;        // lunghezza in metri
  numbered?: boolean;     // conduttori numerati invece che colorati
  conductors: Conductor[];
  /** Posizione del segno su ogni foglio dove il cavo ha fili. */
  marks: Record<SheetId, CableMark>;
}
interface Conductor {
  id: string;
  code: string;           // colore IEC (BN, GNYE…) o numero ("1", "2"…)
  wire?: WireId;          // il filo che lo occupa; vuoto = conduttore libero
}
```

- La **formazione** non si salva: si calcola dai conduttori, es. 5 conduttori
  di cui uno GNYE e sezione 2,5 → `5G2,5`; senza GNYE → `5x2,5`.
- Un filo sta al massimo in **un** cavo (in un conduttore). L'appartenenza è
  del singolo filo, non del potenziale: un potenziale può passare da un cavo
  all'altro attraverso una morsettiera.
- Il colore del conduttore vale **per quel filo**: nello schema il filo si
  disegna col colore del conduttore, anche se il potenziale ha un altro colore.
  Il numero del filo resta quello del potenziale.

### 2.2 Segno sullo schema **[K2]**

Su ogni foglio dove il cavo ha fili c'è un segno, posizionato
automaticamente a metà del tratto comune ai fili e **spostabile** col mouse
lungo i fili:

```ts
interface CableMark { at: number }  // coordinata lungo i fili (y se verticali, x se orizzontali)
```

- Il segno è una linea sottile che attraversa tutti i fili del cavo sul foglio,
  con un trattino obliquo su ogni filo; accanto, `sigla formazione`.
- Fili non paralleli o lontani: il segno prende i tratti dei fili che
  attraversano la coordinata scelta; un filo che non la attraversa resta nel
  cavo ma senza trattino (lo si vede nel pannello).

### 2.3 Conduttori predefiniti **[K3]**

Creando un cavo da N fili selezionati, i conduttori prendono i colori della
sequenza normalizzata (CEI UNEL 00722), assegnati da sinistra a destra (o
dall'alto in basso):

| Fili | Conduttori |
|---|---|
| 2 | BU, BN |
| 3 | BN, BK, GY (o BU, BN, GNYE se un filo è PE) |
| 4 | BU, BN, BK, GY |
| 5 | BU, BN, BK, GY, GNYE |
| oltre 5 | numerati 1, 2, 3… + GNYE |

Un filo il cui potenziale ha già colore GNYE prende il conduttore GNYE. Ogni
conduttore si può cambiare dal pannello; si possono aggiungere conduttori
liberi (riserve) per arrivare alla formazione reale del cavo.

## 3. Interfaccia

- **Creare**: selezionati più fili, pulsante «Raggruppa in cavo» nella scheda
  Selezione → nuovo cavo `{foglio}W{n}` con i conduttori assegnati.
- **Pannello del cavo** (clic sul segno): sigla, tipo, sezione, lunghezza,
  numerato/colorato; tabella dei conduttori con codice (modificabile),
  numero del filo, «togli dal cavo»; «Aggiungi i fili selezionati»,
  «Aggiungi conduttore libero»; elimina cavo (i fili restano).
- **Pannello del filo**: «Cavo W1 · conduttore BN» con link al cavo, menu per
  scegliere il conduttore o togliere il filo dal cavo.
- Il segno si seleziona, si sposta lungo i fili, si copia con i fili.
- Eliminando un filo, il suo conduttore torna libero. Eliminando tutti i fili
  di un cavo, il cavo resta (con i conduttori liberi) finché non lo si elimina.
- **Proprietà del progetto → Cavi**: elenco dei cavi con sigla, formazione,
  fogli; modello della sigla (`{foglio}W{n}`), «Ricalcola sigle».

## 4. Fuori da questo passo

- Lista cavi stampabile (con «da / a» ricavati dai dispositivi ai capi dei
  fili): nelle tabelle, passo successivo.
- Cavi in rappresentazione unifilare (un solo filo che rappresenta il cavo).
- Libreria di tipi di cavo con formazioni predefinite.

## 5. Test

- Creazione da fili selezionati: conduttori e colori predefiniti, GNYE sul PE.
- Formazione calcolata (`5G2,5`, `4x1,5`), conduttori liberi.
- Colore del filo dal conduttore, numero dal potenziale.
- Segno: posizione automatica, spostamento, fili non paralleli, più fogli.
- Eliminare fili/cavi, copia e incolla, annulla; file vecchi senza cavi.

## 6. Scelte

| # | Scelta | Decisione |
|---|---|---|
| K1 | Modello | Tabella `cables`; conduttori con codice e filo; formazione calcolata |
| K2 | Aspetto | Segno obliquo sui fili con sigla e formazione, spostabile, uno per foglio |
| K3 | Conduttori | Colore IEC o numero per conduttore; il colore del filo segue il conduttore |

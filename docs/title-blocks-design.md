# Cartigli — design

> Stato: **approvato; C1 realizzato** (`packages/core/src/titleblock.ts`,
> disegno in `render/src/sheet.ts`, cartigli base generati in
> `apps/web/src/library/base`). Due passi: **C1** modelli di cartiglio,
> campi del progetto, quattro cartigli predefiniti e scelta nel progetto;
> **C2** modifica dei cartigli nell'editor dei simboli. Il logo (immagini) è
> fuori da questi passi.

## 1. Obiettivo

Oggi il cartiglio è disegnato nel codice (`render/src/sheet.ts`) e non si può
cambiare. Diventa un **modello**: un disegno con linee, rettangoli e testi con
segnaposto (`{titolo}`, `{cliente}`, `{foglio}`…), scelto per il progetto e
modificabile come un simbolo.

## 2. Modelli **[C1, scelta 1]**

- Un modello di cartiglio è un **simbolo di tipo `titleblock`** («Cartiglio»):
  sta nella libreria (base, personali, esporta/importa `.cwsym`) e il progetto
  ne tiene una copia, come per i simboli.
- Nuovo campo nel simbolo:

  ```ts
  titleBlock?: { anchor: 'corner' | 'band'; width: number; height: number };
  ```

  Coordinate del disegno con origine nell'angolo **in alto a sinistra** del
  cartiglio; niente terminali.

- **Posizione [scelta 3]**: la sceglie il modello.
  - `corner`: nell'angolo in basso a destra della cornice, grande
    `width × height` mm (come quello attuale, 120 × 20).
  - `band`: fascia in basso **su tutta la larghezza** della cornice, alta
    `height`. Il modello è disegnato per una larghezza di riferimento
    (`width`); sui fogli più larghi o più stretti linee e posizioni dei testi
    si allungano in proporzione, i caratteri restano della loro misura.
- Un cartiglio d'angolo sta sopra l'area di disegno, come oggi. Una
  **fascia** invece riduce l'area di disegno: le righe di riferimento
  (A, B, C…) e la banda a sinistra finiscono sopra la fascia e si
  ridistribuiscono nello spazio rimasto (anche `{riga}` dei rimandi).

## 3. Campi del progetto **[scelta 2]**

Nuovi dati nel progetto (`meta.fields`), modificabili nel pannello Progetto:

| Campo | Segnaposto |
|---|---|
| Cliente | `{cliente}` |
| Commessa | `{commessa}` |
| Impianto | `{impianto}` |
| Revisione | `{revisione}` |
| Data revisione | `{data_revisione}` |
| Disegnato | `{disegnato}` |
| Verificato | `{verificato}` |
| Approvato | `{approvato}` |
| + campi liberi | `{nome_del_campo}` |

Sempre disponibili: `{titolo}` (progetto), `{autore}`, `{data}` (ultima
modifica), `{titolo_foglio}`, `{foglio}` (numero), `{fogli}` (totale).
Un segnaposto senza valore resta vuoto.

## 4. Cartigli predefiniti **[scelta 4]**

Quattro modelli nella libreria di base (categoria «Cartigli», CC0):

1. **Semplice** — angolo 120 × 20, identico a quello di oggi (i progetti
   esistenti non cambiano aspetto).
2. **Completo con revisioni** — angolo più grande: titolo, titolo del foglio,
   cliente, commessa, impianto, revisione e data, disegnato/verificato/
   approvato, foglio n/N.
3. **Fascia** — su tutta la larghezza, alta 10 mm: titolo, titolo del foglio,
   autore, data, foglio n/N in fila.
4. **Completo a fascia** — come il completo ma su tutta la larghezza, in due
   righe.

## 5. Scelta nel progetto

- Proprietà del progetto → **Cartiglio**: menu con i cartigli della libreria;
  scegliendone uno se ne copia l'ultima versione nel progetto
  (`settings.titleBlock` = id del simbolo).
- Nella libreria dello Schema i cartigli hanno la loro categoria: un clic
  propone «Usa questo cartiglio nel progetto» invece di inserirlo come
  elemento.
- Senza scelta si usa **Semplice**.
- L'avviso «simbolo aggiornato in libreria» vale anche per il cartiglio in uso.

## 6. Modifica dei cartigli **[C2]**

Nell'editor dei simboli, con tipo **Cartiglio**:

- campi *Posizione* (angolo / fascia), *Larghezza*, *Altezza*; il riquadro del
  cartiglio è mostrato sul foglio di lavoro;
- l'elenco dei segnaposto disponibili da inserire nei testi (come oggi per
  `{label}`);
- i controlli avvisano se qualcosa esce dal riquadro e non permettono
  terminali.

## 7. Test

- Disegno di un modello d'angolo e a fascia su A4 e A3, con i segnaposto.
- «Semplice» uguale al cartiglio attuale (stesse linee e testi).
- Campi del progetto e campi liberi nei segnaposto.
- Scelta del cartiglio, copia nel progetto, aggiornamento dalla libreria.
- Stampa, SVG e PDF con il cartiglio scelto.

## 8. Scelte

| # | Scelta | Decisione |
|---|---|---|
| 1 | Dove vivono | Simboli di tipo Cartiglio in libreria, copia nel progetto |
| 2 | Campi | Campi tipici (cliente, commessa…) + campi liberi |
| 3 | Posizione | La sceglie il modello: angolo o fascia a tutta larghezza |
| 4 | Predefiniti | Semplice, Completo con revisioni, Fascia, Completo a fascia |

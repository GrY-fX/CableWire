# Tabelle stampabili — design

> Stato: **approvato e realizzato**. Codice: `packages/core/src/lists.ts`,
> `packages/render/src/tables.ts`, `apps/web/src/files/pdf.ts`.

## 1. Obiettivo

Esportare in PDF le **liste del progetto**, calcolate dallo schema:

- **lista fili** (un tratto per riga, per il cablaggio punto-punto);
- **lista dispositivi**;
- **lista cavi**;
- **morsettiere** (una tabella per morsettiera, con i collegamenti).

Le pagine delle tabelle hanno lo **stesso formato, cornice e cartiglio** dei
fogli dello schema: sono fogli in più del progetto.

## 2. Contenuto delle liste **[L1–L4]**

### 2.1 Lista fili

Una riga per **tratto di filo**, in ordine di numero (poi foglio e posizione).

| Numero | Da | A | Colore | Sezione | Cavo | Foglio |
|---|---|---|---|---|---|---|
| 1.01 | 1Q1:2 | X1:1 | BN | 1,5 | 1W1 / BN | 1.3 |

- **Da / A**: `sigla:morsetto` del dispositivo a quel capo (per i morsetti la
  sigla di morsettiera, es. `X1:3`). Un capo su una giunzione mostra
  `giunzione 1.4` (foglio.colonna).
- **Colore**: del conduttore se il filo è in un cavo, altrimenti del
  potenziale. **Cavo**: sigla e conduttore. **Foglio**: foglio.colonna del
  tratto.

### 2.2 Lista dispositivi

Una riga per **dispositivo** (simboli normali, comandi, PLC), in ordine di
sigla. Non sono elencati a parte: contatti (stanno col loro comando), morsetti
(nelle morsettiere), rimandi, alimentazioni, cartigli.

| Sigla | Descrizione | Funzione | Posizione | Costruttore | Codice prodotto | … | Foglio | Contatti |
|---|---|---|---|---|---|---|---|---|
| 1K1 | Bobina | Marcia pompa | +Q1 | ABB | AF09-30-10 | | 1.4 | 2 NA, 1 NC |

- **Descrizione**: nome del simbolo. **Contatti**: per bobine e comandi, i
  contatti collegati per tipo.
- **Costruttore** e **Codice prodotto** sono campi fissi di ogni dispositivo.
- **Proprietà del progetto** (Progetto → Proprietà dei dispositivi): altre
  proprietà comuni a tutti i dispositivi (es. Tensione, Fornitore), con una
  casella «Tabelle» che le aggiunge come colonne (al posto di «…»). I campi
  aggiunti a mano a un solo dispositivo non diventano colonne.

### 2.3 Lista cavi

| Sigla | Tipo | Formazione | Lunghezza | Da | A | Fogli |
|---|---|---|---|---|---|---|
| 1W1 | FG16OR16 | 5G2,5 | 12 m | X1 | 1M1 | 1 |

- **Da / A**: i dispositivi ai due capi dei fili del cavo, divisi rispetto al
  segno (sopra/sinistra = Da, sotto/destra = A).

### 2.4 Morsettiere

Una tabella per morsettiera, i morsetti in ordine di numero:

| Morsetto | Filo | Interno (sopra) | Esterno (sotto) | Cavo |
|---|---|---|---|---|
| X1:1 | 1.01 | 1Q1:2 | 1M1:U1 | 1W1 / BN |

- **Interno / Esterno**: cosa è collegato al terminale superiore e a quello
  inferiore del morsetto. **Cavo**: il cavo del filo sul lato esterno.

## 3. Pagine **[L5]**

- Formato, cornice, righe/colonne e cartiglio come i fogli (formato del primo
  foglio). Nel cartiglio il titolo del foglio è il nome della lista
  («Lista fili»…); i numeri di foglio **continuano dopo l'ultimo foglio**
  dello schema, e `{fogli}` li conta.
- La tabella occupa l'area di disegno: intestazione delle colonne ripetuta su
  ogni pagina, righe alternate leggermente grigie, colonne larghe in
  proporzione al contenuto. Una lista lunga continua sulla pagina dopo
  («Lista fili (2)»).

## 4. Esportazione **[L6]**

- Menu **Progetto → Tabelle in PDF…**: finestra con le quattro liste da
  scegliere (tutte selezionate) → PDF delle sole tabelle.
- Menu **Progetto → PDF di tutti i fogli e tabelle**: lo schema seguito dalle
  liste scelte nella stessa finestra, con un segnalibro per lista.

## 5. Struttura

- `core/lists.ts`: le liste come dati (righe e colonne), senza disegno;
  testate.
- `render/tables.ts`: impaginazione delle liste in pagine (scene con cornice e
  cartiglio), testata.
- `web/files/pdf.ts`: aggiunge le pagine al PDF come i fogli.

## 6. Fuori da questo passo

- Esportazione CSV/Excel.
- Fogli tabella dentro lo schema, che si aggiornano da soli.
- Scelta delle colonne e dell'ordinamento da parte dell'utente.

## 7. Scelte

| # | Scelta | Decisione |
|---|---|---|
| L1 | Lista fili | Una riga per tratto: numero, da, a, colore, sezione, cavo, foglio |
| L2 | Lista dispositivi | Per sigla: descrizione, funzione, posizione, foglio, contatti |
| L3 | Lista cavi | Sigla, tipo, formazione, lunghezza, da/a, fogli |
| L4 | Morsettiere | Una tabella per morsettiera: filo, interno (sopra), esterno (sotto), cavo |
| L5 | Pagine | Formato, cornice e cartiglio dei fogli; numeri dopo l'ultimo foglio |
| L6 | Esportazione | PDF delle sole tabelle, oppure in coda al PDF dei fogli |

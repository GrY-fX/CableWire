# Design dei rimandi di foglio

> Stato: **approvato** · fase 2 (anticipata) · 31 ottobre 2026
> Le scelte **[K#]** sono riassunte in fondo. Due commit: **R1** rimandi
> (modello, collegamento, nome, riferimento, pannello) e **R2** export PDF con link.

## 1. Obiettivo

Un filo che continua su un altro foglio esce da un **rimando uscente** e
rientra da un **rimando entrante**. Richieste:

1. il rimando mostra come nome il **numero del filo** a cui è collegato; se
   non è collegato a nessun filo ha un suo codice: `N/C_1`, `N/C_2`…;
2. cliccando un rimando si sceglie, tra quelli **del tipo opposto ancora
   liberi**, quello a cui collegarlo;
3. nel **PDF** i rimandi sono **link**: cliccandoli si salta al rimando
   collegato.

## 2. Modello

### 2.1 Entrata e uscita **[K1]**

Il simbolo dice se è un rimando entrante o uscente: nuovo campo opzionale
`report: 'in' | 'out'` nei simboli di tipo *rimando*. I due simboli di base
lo ricevono; l'editor di simboli lo mostra quando il tipo è "Rimando di foglio".

### 2.2 Collegamento

- Si usa il campo `link` già presente negli elementi: **entrambi** i rimandi
  puntano all'altro (`A.link = B`, `B.link = A`).
- Un collegamento è **1 a 1** **[K4]**: un'uscita va a un'entrata.
- Comandi nuovi in `core`: `linkReports(a, b)` (scollega eventuali vecchi
  partner, collega i nuovi) e `unlinkReport(a)`. Eliminare un rimando
  scollega l'altro (già gestito da `removeItems`).

### 2.3 Potenziale attraverso i fogli

I due terminali dei rimandi collegati diventano **lo stesso potenziale**:
il calcolo dei potenziali li unisce. Di conseguenza, senza altro codice:

- il numero del filo passa da un foglio all'altro (eredità e "Numero filo"
  già esistenti);
- l'evidenziazione del potenziale mostra "N fili su 2 fogli";
- conflitti e ricalcolo valgono attraverso i fogli.

Collegando due rimandi i cui fili hanno numeri diversi nasce un conflitto
"potenziali uniti" (già gestito dal pannello conflitti).

### 2.4 Nome mostrato

Nel simbolo il testo `{ref_name}` del rimando viene calcolato (il codice `N/C_n` è salvato
nel campo `ref_id`; `{label}`, se vuoto, mostra lo stesso nome per i simboli già esistenti):

| Situazione | Nome |
|---|---|
| Collegato a un filo numerato | numero del filo (es. `1.03`) |
| Non collegato a nessun filo | codice proprio `N/C_n` |
| Collegato a un filo senza numero | codice proprio `N/C_n` |

Il codice `N/C_n` viene assegnato alla posa (primo libero nel progetto) e
salvato nell'elemento, così resta stabile.

### 2.5 Indicazione della destinazione **[K2]**

Accanto al rimando si scrive dove continua il filo, come negli schemi
tradizionali: **foglio e colonna** del rimando collegato, es. `→ 3.5`
(foglio 3, colonna 5). Un rimando non collegato mostra `→ ?`.

Il testo è **personalizzabile** nelle impostazioni del progetto con un
modello (predefinito `→ {foglio}.{colonna}`), segnaposto `{foglio}`,
`{colonna}`, `{riga}` (lettera della riga), `{titolo}` (titolo del foglio).
Nei simboli il punto in cui compare è il testo `{ref_target}`.

## 3. Interazione

- **Clic su un rimando** (strumento Seleziona): nel pannello proprietà compare
  la sezione "Collegamento" con l'elenco dei rimandi del tipo opposto **liberi**
  (nome, foglio, colonna), e "Scollega" se è già collegato.
- **Doppio clic su un rimando collegato**: si va al foglio del rimando
  collegato e lo si seleziona.
- Un rimando senza collegamento è segnalato (testo `→ ?` e un avviso nel
  pannello conflitti/controlli).

## 4. PDF con link **[K3]**

La stampa del browser non crea in modo affidabile link interni tra pagine.
Proposta: un **export PDF diretto** (menu Esporta → "PDF di tutti i fogli"):

- ogni foglio è una pagina vettoriale nel suo formato (testi selezionabili,
  carattere incorporato);
- ogni rimando collegato è un'**area cliccabile** che porta alla pagina e alla
  posizione del rimando collegato;
- un **segnalibro** per foglio nel pannello laterale del lettore PDF.

Librerie: `jsPDF` + `svg2pdf.js` (MIT), caricate **solo quando si esporta**
(il resto dell'app non diventa più pesante). La stampa del browser resta per
la carta.

## 5. Test

- Potenziali e numeri attraverso rimandi collegati; scollegamento.
- `linkReports`: 1 a 1, ricollegamento, eliminazione; nome `N/C_n` stabile.
- Testo calcolato e indicazione della destinazione `→ foglio.colonna`.
- PDF: numero di pagine, formati, presenza dei link verso le pagine giuste
  (lettura del PDF generato nei test).
- Prova a mano: collegare, saltare con doppio clic, aprire il PDF e cliccare.

## 6. Scelte

| # | Scelta | Decisione |
|---|---|---|
| K1 | Entrata / uscita | Campo `report: in/out` nel simbolo |
| K2 | Destinazione scritta accanto | `→ {foglio}.{colonna}` di default, modello personalizzabile per progetto |
| K3 | PDF con link | Export PDF diretto con jsPDF + svg2pdf (caricate solo all'uso) |
| K4 | Collegamenti | 1 a 1 (un'uscita → un'entrata) |

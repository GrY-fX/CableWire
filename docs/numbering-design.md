# Design dell'autonumerazione dei fili

> Stato: **approvato** · fase 1, punto 6 · 30 ottobre 2026
> Dettaglia la sezione 4.3 di [progetto.md](progetto.md). Le scelte **[N#]**
> sono riassunte in fondo.

## 1. Obiettivo

Dare un numero a ogni potenziale senza scriverlo a mano, con regole simili a
quelle di QElectroTech, più la numerazione "dal terminale raggiunto" del branch
`feature/terminal-wire-number` (indirizzo PLC, nome del terminale di un
morsetto, sigla dell'elemento) e una scelta esplicita quando le sorgenti non
sono d'accordo.

Base già pronta (punto 5): il numero appartiene al **potenziale**. Tutti i fili
di un potenziale hanno lo stesso numero, che si eredita collegando e cambia
insieme ovunque (`core/numbering.ts`).

Diviso in due commit:

- **6a — regole e contatore**: modello di numero con contatore,
  numerazione automatica dei potenziali nuovi, comando "Rinumera", numeri
  bloccati, impostazioni nel pannello del progetto.
- **6b — sorgenti e conflitti**: numero preso da indirizzo PLC, morsetto o
  sigla, e pannello dei conflitti con la scelta.

## 2. Regola di numerazione

Una regola per progetto, salvata in `settings.numbering` del file `.cwp`.
Il campo è **opzionale** con valori predefiniti: i file esistenti restano
validi senza cambiare versione del formato.

```
1. Sorgenti, in ordine di priorità (6b)   es. indirizzo PLC → morsetto
2. Se nessuna sorgente dà un valore: modello con contatore
```

### 2.1 Modello

Testo con segnaposto, come i campi dei simboli:

| Segnaposto | Valore |
|---|---|
| `{n}` | contatore (es. `{n:2}` = almeno 2 cifre: 01, 02 …) |
| `{foglio}` | numero del foglio nel progetto (1, 2, 3 …) |
| `{colonna}` | colonna del riquadro in cui inizia il filo |
| testo libero | copiato così com'è (es. `W`, `-`, `.`) |

Esempi: `{n}` → 1, 2, 3 · `{foglio}.{n:2}` → 1.01, 1.02, 2.01 ·
`W{n:3}` → W001 · `{foglio}.{colonna}.{n}` → 2.7.1 (posizione).

Il modello deve contenere `{n}`, così due potenziali non possono mai avere lo
stesso numero. Predefinito: `{foglio}.{n:2}`.

Il contatore riparte per foglio se il modello contiene `{foglio}`, altrimenti
conta su tutto il progetto. Il numero scelto è sempre il primo **libero**:
non si duplica mai un numero già usato da un altro potenziale nello stesso
ambito.

### 2.2 Sorgenti (6b) **[N4]**

Valori presi dagli elementi raggiunti dal potenziale:

| Sorgente | Da dove viene | Esempio |
|---|---|---|
| Indirizzo PLC | campo `plc_address` di un elemento del potenziale | `I0.3` |
| Morsetto | nome del terminale di un elemento di tipo *morsetto* | `X1` morsetto `5` → `5` (o `X1:5`, opzione) |
| Sigla | campo `label` di un elemento di un tipo scelto | `KM1` |

Se una sorgente trova **un solo valore** lo usa. Se ne trova più di uno
diverso (es. il potenziale tocca due ingressi PLC) è un **conflitto** (§4).

Quali sorgenti usare, e in che ordine, si **sceglie nelle impostazioni di
ogni progetto**, perché dipende dal tipo di impianto. Predefinito: solo
indirizzo PLC. Preset pronti:

| Preset | Sorgenti |
|---|---|
| Quadro con PLC (predefinito) | indirizzo PLC |
| Quadro elettromeccanico | morsetto |
| PLC e morsettiere | indirizzo PLC → morsetto |
| Solo contatore | nessuna |
| Personalizzato | scelta e ordine liberi |

## 3. Quando si numera **[N1]**

- **Automatico**: un potenziale che nasce senza numero (primo filo tra
  terminali liberi, o unione di potenziali senza numero) riceve subito il
  numero secondo la regola. Può essere disattivato nelle impostazioni.
- **Comando "Ricalcola numerazione"**: sul foglio corrente o su tutto il
  progetto, rifà i numeri in ordine di lettura (fogli in ordine; nel foglio
  per colonne del riquadro da sinistra a destra, dall'alto in basso),
  saltando i numeri bloccati. Serve soprattutto a **ricompattare** la
  sequenza quando fili cancellati hanno lasciato dei buchi.
- I fili **incollati** perdono il numero e vengono rinumerati come nuovi, per
  non duplicare i numeri degli originali.

### 3.1 Numeri bloccati **[N3]**

Un numero scritto a mano nel pannello del filo viene segnato come bloccato
(`numberLocked`, già nel modello): "Rinumera" non lo cambia e il contatore
lo considera occupato. Un lucchetto nel pannello permette di sbloccarlo.

## 4. Conflitti

Un potenziale è in conflitto quando:

- le sorgenti danno valori diversi (6b), oppure
- un filo unisce due potenziali che avevano numeri diversi (caso lasciato
  aperto nel punto 5).

I conflitti **non bloccano** il lavoro: il potenziale tiene il primo valore e
compare in un pannello "Conflitti di numerazione" (con contatore nella barra di
stato). Per ciascuno si sceglie tra i valori proposti o se ne scrive uno; la
scelta diventa un numero bloccato, così non viene più riproposta.

## 5. Interfaccia

- **Pannello del progetto** (senza selezione): sezione "Numerazione fili" con
  modello, anteprima dei primi numeri, numerazione automatica sì/no, ordine
  delle sorgenti (6b).
- **Pannello del filo**: numero con lucchetto; se il numero viene da una
  sorgente, lo dice ("da indirizzo PLC di KA3").
- **Barra strumenti**: "Rinumera" con menu foglio / progetto.
- **Conflitti** (6b): pannello a scomparsa con l'elenco, clic per vedere il
  potenziale evidenziato.

## 6. Architettura

```
packages/core/src/
  numbering.ts        (esistente) numero del potenziale
  autonumber/
    rule.ts           tipi della regola, parsing del modello, formattazione
    allocate.ts       primo numero libero nell'ambito, ordine di lettura
    sources.ts        valori dalle sorgenti per un potenziale (6b)
    conflicts.ts      elenco dei conflitti (6b)
  commands/numbering.ts  numberPotential, renumber, setNumbering, resolveConflict
packages/core/src/sheet.ts  formati e riquadro del foglio (spostati da render:
                      servono anche per calcolare la colonna di un filo)
packages/formats      schema di settings.numbering (campo opzionale)
packages/editor       numerazione automatica dopo "Collega filo" e "Incolla"
                      (stessa voce di annulla)
apps/web              pannelli e comando
```

Tutto passa dai comandi di `core`: annulla, salvataggio e test come il resto.

## 7. Test

- Modello: parsing e formattazione (`{n:2}`, `{foglio}`, testo), errori di
  sintassi segnalati.
- Allocazione: primo libero, ambito foglio/progetto, numeri bloccati
  rispettati, ordine di lettura.
- Automatico: nuovo potenziale numerato nella stessa voce di annulla.
- File senza `settings.numbering` (versione attuale) letti con i valori
  predefiniti.
- Sorgenti e conflitti (6b) sui casi tipici: ingresso PLC, morsetto passante,
  due sorgenti diverse, unione di potenziali numerati.

## 8. Scelte

| # | Scelta | Decisione |
|---|---|---|
| N1 | Quando numerare | Automatico di default con regola sequenziale; regole configurabili (foglio, posizione, testo); pulsante "Ricalcola numerazione" per ricompattare dopo le cancellazioni |
| N2 | Modello predefinito | `{foglio}.{n:2}` (1.01, 1.02 … 2.01) |
| N3 | Numeri scritti a mano | Bloccati (il ricalcolo non li tocca), con lucchetto per sbloccarli |
| N4 | Sorgenti | Scelte e ordinate nelle impostazioni di ogni progetto, con preset per tipo di progetto; predefinito: solo indirizzo PLC |

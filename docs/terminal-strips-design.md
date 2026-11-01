# Morsettiere e numerazione dei morsetti — design

> Stato: **approvato e realizzato**. Codice: `packages/core/src/strips.ts`,
> `commands/strips.ts`. Eliminando un foglio, le sue morsettiere per foglio
> usate anche altrove diventano personalizzate col nome che avevano.

## 1. Obiettivo

Ogni morsetto (simbolo di tipo *morsetto*) appartiene a una **morsettiera**.
La morsettiera ha un nome; i suoi morsetti sono numerati 1, 2, 3… e la sigla
mostrata è `morsettiera:numero` (es. `X1:1`, `X1:2`).

Le morsettiere si chiamano in due modi:

- **per foglio**: nome da un modello del progetto, es. `{foglio}X{n}` →
  `1X1`, `1X2` sul foglio 1, `5X1` sul foglio 5;
- **personalizzata**: nome libero (`-X1`, `XPOMPA`…), usabile su tutti i fogli
  (la stessa morsettiera richiamata da fogli diversi).

## 2. Modello

### 2.1 Morsettiere nel progetto **[T1, T2]**

Nuovo elenco nelle impostazioni del progetto (salvato nel `.cwp`, annullabile
come le altre impostazioni):

```ts
terminalStrips?: {
  id: string;
  mode: 'sheet' | 'custom';
  name?: string;      // custom: il nome scelto
  sheetId?: SheetId;  // sheet: il foglio a cui appartiene
}[];
stripPattern?: string; // per foglio, predefinito `{foglio}X{n}`
```

- Il nome di una morsettiera **per foglio** si calcola: `{foglio}` = numero
  del foglio, `{n}` = posizione tra le morsettiere per foglio di quel foglio
  (in ordine di creazione). Riordinando i fogli il nome si aggiorna.
- Una morsettiera **personalizzata** ha il suo nome, unico nel progetto.
- Si può passare da un modo all'altro (es. una morsettiera per foglio diventa
  personalizzata tenendo il nome attuale).

### 2.2 Morsetti **[T3]**

Nell'elemento morsetto due campi nuovi:

- `strip`: id della morsettiera;
- `terminalNo`: il numero del morsetto (testo, così si può scrivere a mano
  anche `PE` o `5a`).

La sigla del morsetto (`{label}` nel disegno) diventa `nome:numero`, calcolata:
rinominando la morsettiera tutti i suoi morsetti si aggiornano. Un morsetto
senza morsettiera mostra la sigla scritta a mano, come oggi.

La numerazione dei fili dal **morsetto raggiunto** usa questa sigla (con lo
stile già esistente "solo numero" `X1:5 → 5` o "sigla completa").

### 2.3 Numeri dei morsetti

- Inserendo un morsetto prende il **primo numero libero** della sua
  morsettiera, contando i morsetti di **tutti i fogli**.
- Incollando, le copie restano nella stessa morsettiera con numeri nuovi.
- **Ricalcola morsetti** (menu «Ricalcola numerazione»): rinumera una
  morsettiera, o tutte, in ordine di lettura (foglio, colonna, dall'alto in
  basso). I numeri scritti a mano non numerici (`PE`, `5a`) restano.

### 2.4 Morsettiera predefinita **[T4]**

Inserendo un morsetto va nell'**ultima morsettiera usata** (scelta o
cambiata dal pannello di un morsetto). Se il progetto non ne ha ancora, ne
crea una **per foglio** sul foglio corrente.

## 3. Interfaccia

- **Pannello del morsetto**: menu *Morsettiera* (con «+ Nuova morsettiera…»),
  campo *Numero*; la sigla risultante è mostrata sotto.
- **Proprietà del progetto → Morsettiere**: elenco con nome, modo, foglio e
  numero di morsetti; rinomina, cambio modo, elimina (solo se vuota, oppure
  i morsetti restano senza morsettiera); campo modello per i nomi per foglio.
- **Menu Ricalcola numerazione**: «Morsetti: morsettiera del morsetto
  selezionato / tutte».

## 4. Fuori da questo passo

- Elenco/esportazione della morsettiera (tabella morsetti, collegamenti
  interno/esterno): un passo successivo, se serve.

## 5. Test

- Nome per foglio e personalizzato; aggiornamento riordinando i fogli.
- Primo numero libero su più fogli; incolla; ricalcolo in ordine di lettura
  con numeri non numerici mantenuti.
- Sigla calcolata nel disegno e numerazione dei fili dal morsetto.
- Morsettiera predefinita (ultima usata, creazione della prima).

## 6. Scelte

| # | Scelta | Decisione |
|---|---|---|
| T1 | Definizione | Elenco di morsettiere nel progetto, il morsetto ne sceglie una |
| T2 | Nomi | Per foglio (modello `{foglio}X{n}`) o personalizzato, per morsettiera |
| T3 | Numeri | 1, 2, 3… per morsettiera su tutti i fogli, sigla `morsettiera:numero` |
| T4 | Predefinita | L'ultima usata; la prima viene creata per foglio |

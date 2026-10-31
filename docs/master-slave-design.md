# Rimandi padre → figlio (bobina → contatti) — design

> Stato: **proposta da approvare**. Due passi: **P1** collegamento, sigla,
> posizione sotto il contatto, pannello e salto; **P2** tabellina dei
> contatti sotto la bobina e link nel PDF.

## 1. Obiettivo

Una bobina (simbolo *master*) comanda dei contatti (simboli *slave*) sparsi su
più fogli. Come in QElectroTech:

- ogni contatto sa a quale bobina appartiene, ne porta la sigla e dice dove
  si trova la bobina (`/1.4` = foglio 1, colonna 4);
- sotto la bobina una **tabellina NA | NC** elenca i suoi contatti con morsetti
  e posizione;
- si salta dall'uno all'altro (doppio clic, pannello, link nel PDF).

## 2. Modello

### 2.1 Tipo di contatto **[M4]**

Nuovo campo opzionale nei simboli *slave*:
`contact: 'no' | 'nc' | 'changeover' | 'power'` (NA, NC, scambio, potenza).
I simboli di base lo ricevono (NA, NC, scambio, contattore tripolare = potenza);
l'editor di simboli mostra la scelta quando il tipo è *Slave*.

### 2.2 Collegamento **[M1]**

- Il contatto punta alla bobina con il campo `link` già esistente
  (`contatto.link = bobina`); la bobina non salva nulla: i suoi contatti sono
  quelli che puntano a lei. Una bobina ha **quanti contatti si vuole**.
- **Esplicito**: selezionato un contatto, il pannello elenca le bobine
  (sigla, foglio.colonna); un clic lo collega, "Scollega" lo stacca.
- **Per sigla**: scrivendo nel contatto la sigla di una bobina esistente
  (es. `KM1`) il contatto si collega a quella bobina. Se le bobine con quella
  sigla sono più d'una non collega e lo segnala.
- Comandi in `core`: `linkSlave(slave, master)`, `unlinkSlave(slave)`.
- Eliminare la bobina stacca i suoi contatti (già fatto da `removeItems`).
- Copia/incolla: un contatto incollato **resta collegato** alla stessa bobina se
  questa esiste ancora nel progetto (diverso dai rimandi, che sono 1 a 1);
  se si copiano insieme bobina e contatti, le copie si collegano tra loro.

### 2.3 Sigla del contatto

Un contatto collegato mostra **la sigla della bobina** e la segue quando cambia
(calcolata al disegno, come il nome dei rimandi). Nel pannello il campo Sigla
del contatto collegato mostra la sigla della bobina; cambiarla in quella di
un'altra bobina lo ricollega, in una sigla senza bobina lo scollega.

### 2.4 Posizione della bobina sotto il contatto **[M3]**

Nel simbolo del contatto il testo `{master_ref}` mostra dove si trova la
bobina, con un modello del progetto (predefinito `/{foglio}.{colonna}`,
segnaposto come per i rimandi: `{foglio}`, `{colonna}`, `{riga}`, `{titolo}`).
Contatto non collegato: testo vuoto e avviso nel pannello. I simboli di base
dei contatti ricevono il testo `{master_ref}` sotto la sigla.

### 2.5 Tabellina sotto la bobina **[M2]** (P2)

Disegnata automaticamente sotto la bobina (non è un testo del simbolo):

```
  NA   |   NC
 13-14 2.5 | 21-22 3.1
 43-44 4.7 |
 ─ potenza: 1-2 3-4 5-6  2.3
```

- una riga per contatto, morsetti dal simbolo (nomi dei terminali) e
  foglio.colonna del contatto;
- lo **scambio** compare in tutte e due le colonne (NA 11-14, NC 11-12);
- i contatti di **potenza** in righe a parte sotto la tabellina;
- ordine: foglio, colonna, dall'alto in basso.
- Impostazione del progetto per nasconderla (predefinito: visibile).

**Posizione regolabile.** Di default la tabellina sta subito sotto la bobina,
centrata. Per ogni bobina si può spostare, così non si sovrappone ad altri
simboli quando le bobine sono in punti diversi dei fogli:

- nuovo campo opzionale nell'elemento bobina: `xrefOffset: { dx, dy }` in mm,
  spostamento rispetto alla posizione predefinita (assente = predefinita);
- si sposta **trascinandola** nello schema (aggancio alla griglia, un solo
  passo di annulla) oppure con i campi **Spostamento X / Y** nel pannello della
  bobina, con "Posizione predefinita" per azzerarlo;
- spostando, ruotando o specchiando la bobina la tabellina la segue, mantenendo
  lo spostamento; resta sempre orizzontale e leggibile;
- copia/incolla e annulla/ripeti portano con sé lo spostamento.

## 3. Interazione

- **Doppio clic su un contatto collegato**: si va alla bobina e la si
  seleziona (come per i rimandi).
- **Bobina selezionata**: il pannello elenca i suoi contatti (tipo, morsetti,
  foglio.colonna) con "Vai" per ciascuno.
- Il pannello progetto elenca i **contatti non collegati**, cliccabili.

## 4. PDF (P2)

- Ogni contatto collegato è un link alla bobina.
- Ogni riga della tabellina è un link al suo contatto.

## 5. Test

- Collegamento esplicito e per sigla (anche sigla ambigua), scollegamento,
  eliminazione della bobina, copia/incolla con e senza la bobina.
- Sigla e `{master_ref}` calcolati; la sigla segue la bobina.
- Tabellina: colonne, scambio in entrambe, potenza a parte, ordine.
- Spostamento della tabellina: trascinamento, campi del pannello, azzeramento,
  segue la bobina spostata o ruotata.
- PDF: link contatto → bobina e righe → contatti.

## 6. Scelte

| # | Scelta | Decisione |
|---|---|---|
| M1 | Collegamento | Esplicito dal pannello + automatico scrivendo la sigla |
| M2 | Sotto la bobina | Tabellina NA \| NC con morsetti e foglio.colonna, sotto la bobina con spostamento regolabile per bobina |
| M3 | Accanto al contatto | Posizione della bobina, modello `/{foglio}.{colonna}` |
| M4 | Tipo di contatto | Campo `contact` nel simbolo slave |

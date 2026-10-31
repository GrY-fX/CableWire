# Design di file, export, stampa e app offline

> Stato: **approvato** · fase 1, punto 7 · 30 ottobre 2026
> Ultimo punto dell'MVP (sezione 8 di [progetto.md](progetto.md)). Le scelte **[P#]**
> sono riassunte in fondo.

## 1. Obiettivo

Lavorare con file veri e portare lo schema fuori dall'app:

- **aprire e salvare** progetti `.cwp` sul disco, con "Salva", "Salva con nome"
  e i file recenti;
- **esportare** il foglio corrente in SVG e PNG;
- **stampare** uno o tutti i fogli in scala reale (e quindi ottenere un PDF con
  "Salva come PDF" del browser);
- **usare l'app offline** e installarla come applicazione (PWA);
- **pubblicarla** come sito statico.

Con questo l'MVP è completo: si crea un progetto, lo si disegna, lo si numera,
lo si salva, lo si riapre identico e lo si stampa.

## 2. File di progetto

### 2.1 Apri / Salva **[P1]**

| Comando | Chrome / Edge | Firefox / Safari |
|---|---|---|
| Nuovo | progetto vuoto (conferma se ci sono modifiche non salvate su disco) | uguale |
| Apri… (`Ctrl+O`) | scelta del file `.cwp`, l'app ricorda il file aperto | scelta del file (solo lettura del file) |
| Salva (`Ctrl+S`) | riscrive lo stesso file sul disco | scarica `nome.cwp` |
| Salva con nome… | sceglie nome e cartella | scarica con un nome nuovo |
| File recenti | ultimi 8 file aperti (riaprire chiede il permesso al browser) | non disponibile |

- Il formato è quello del punto 3 (`.cwp` JSON stabile, letto col parser
  sicuro: errori chiari, versione, migrazioni).
- Il **salvataggio automatico nel browser** resta come rete di sicurezza:
  riaprendo l'app si ritrova il lavoro anche senza aver salvato.
- La barra mostra il nome del file e se ci sono **modifiche non salvate su
  disco** (•); chiudere la pagina in quello stato chiede conferma.
- `meta.updatedAt` viene aggiornato a ogni salvataggio su disco.

### 2.2 Dove sta il codice

```
apps/web/src/files/
  fileAccess.ts   File System Access API con ripiego su input/download
  recent.ts       file recenti (handle salvati in IndexedDB)
  projectFile.ts  apri/salva: parse/serialize, nome file, stato "modificato"
```

## 3. Export

### 3.1 SVG e PNG del foglio **[P2]**

- **SVG**: quello di oggi (scala reale, carattere incorporato).
- **PNG**: lo stesso SVG disegnato su un canvas alla risoluzione scelta
  (150 / 300 dpi; un A3 a 300 dpi è circa 4960 × 3508 pixel), sfondo bianco.
- Menu "Esporta" con: foglio corrente in SVG, foglio corrente in PNG.

### 3.2 Stampa e PDF

- "Stampa…" (`Ctrl+P`) apre la stampa del browser con **una pagina per foglio**,
  ognuna nel suo formato e orientamento (CSS `@page` con pagine nominate),
  disegnata in **scala reale** e senza griglia né aiuti a video.
- Si può stampare solo il foglio corrente o tutti.
- Dalla stessa finestra il browser permette **"Salva come PDF"**: è il PDF
  dell'MVP, vettoriale, senza librerie in più. Un export PDF diretto con
  segnalibri resta in fase 2 (decisione D2).

## 4. App offline (PWA) **[P3]**

- `manifest.webmanifest` (nome, icone, colore) e un **service worker** che
  tiene in cache l'app (HTML, JS, CSS, carattere, simboli di base).
- Dopo la prima visita l'app si apre **senza rete**; Chrome/Edge propongono
  "Installa CableWire".
- Quando esce una versione nuova: avviso "Aggiornamento disponibile — ricarica".
- Icona dell'app: un semplice simbolo vettoriale (contatto e filo) in SVG.

## 5. Pubblicazione **[P4]**

Workflow GitHub Actions che, a ogni push su `main` con la CI verde, pubblica
`apps/web/dist` su **GitHub Pages**: `https://gry-fx.github.io/CableWire/`.
I dati restano nel browser di chi la usa: il sito è solo l'app.

## 6. Test

- Apri/salva: serializzazione → file → parsing identico; nomi file; stato
  "modificato"; ripiego senza File System Access (simulato).
- Stampa: struttura della pagina di stampa (una pagina per foglio, formato e
  orientamento giusti) in DOM simulato.
- PNG: dimensioni in pixel dalla risoluzione scelta.
- Prova a mano: salva, chiudi, riapri; stampa in PDF; app offline (rete
  disattivata).

## 7. Scelte

| # | Scelta | Decisione | Alternative scartate |
|---|---|---|---|
| P1 | Salvataggio su disco | "Salva" manuale (`Ctrl+S`) sul file aperto + salvataggio automatico nel browser come rete di sicurezza | Salvataggio automatico anche sul file su disco ogni pochi secondi |
| P2 | Export e PDF | SVG e PNG (150/300 dpi) del foglio; PDF tramite "Stampa → Salva come PDF" del browser | Aggiungere subito un export PDF diretto con una libreria (jsPDF + svg2pdf) |
| P3 | Service worker | `vite-plugin-pwa` (Workbox, solo in sviluppo, standard e manutenuto) | Service worker scritto a mano |
| P4 | Pubblicazione | GitHub Pages automatico da `main` | Nessuna pubblicazione per ora; altro hosting |

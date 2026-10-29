# CableWire

Applicazione web open source per disegnare schemi elettrici di automazione e
quadri, in stile QElectroTech. Gira interamente nel browser: niente
installazione, niente account, funziona offline e i progetti restano sul tuo
computer. Include un editor per creare la propria libreria di simboli.

> **Stato:** fase 0 — progettazione. Non c'è ancora codice applicativo.
> Il documento di progetto è in [docs/progetto.md](docs/progetto.md).

## Obiettivi

- Semplicità d'uso prima di tutto
- Editor di simboli e libreria personale
- Numerazione fili, potenziali, riferimenti incrociati, morsettiere
- Configurazioni e librerie di simboli esportabili e condivisibili
- In seguito: compatibilità con QElectroTech (`.qet`, `.elmt`)

## Struttura del repository

```
apps/web/          applicazione web (interfaccia, PWA)
packages/core/     modello dei dati, comandi, undo, potenziali, autonumerazione
packages/formats/  formati nativi (.cwp, .cwsym, .cwpack)
packages/render/   rendering SVG
packages/editor/   interazione con il disegno
docs/              documentazione
```

## Sviluppo

Serve Node.js 22 o successivo.

```bash
npm install        # dipendenze
npm run dev        # app in sviluppo su http://localhost:5173
npm run build      # sito statico in apps/web/dist
npm run lint       # ESLint + Prettier
npm run typecheck  # TypeScript e svelte-check
npm test           # Vitest
```

## Licenza

CableWire è software libero: GNU Affero General Public License v3.0 o
successiva. Vedi [LICENSE](LICENSE).

CableWire si ispira a QElectroTech, ma è un progetto indipendente e non
affiliato.

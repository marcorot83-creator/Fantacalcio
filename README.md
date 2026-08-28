# Asta Mantra 4-3-3 — Copilota

Motore decisionale per l'asta Fantacalcio Mantra 2026/27, costruito sul file
`strumento_asta_mantra_2026_27_RIMODULATO.xlsx`. Non è un visualizzatore
dell'Excel: il file viene importato una volta come **Player & Strategy
Database permanente**, e tutte le formule del listone (`Lista calciatori`,
`Graduatorie 433`, `Strategia 433`, `Coppie & Gioielli`) sono ricostruite in
codice (`packages/shared/src/formulas.ts`) invece di essere lette come valori
Excel cache (che nel file non sono presenti).

## Architettura

```
packages/shared   motore deterministico (formule, budget dinamico, mercato,
                  scarsità, matching pluriruolo, decisione RILANCIA/MOLLA,
                  nomination engine, opponent modelling, what-if, parser NL)
packages/server   API Express + SQLite (better-sqlite3). Importa l'Excel,
                  persiste il Player Database e le AuctionSession.
apps/web          React/Vite: schermata Live, wizard nuova asta, chat.
```

Principio architetturale (sezione 64-65 del master prompt): **nessuna
matematica nel prompt di un LLM**. Il motore quantitativo è tutto
deterministico in `packages/shared`; l'interfaccia conversazionale è un
parser NL a regole (`packages/shared/src/parser.ts`) che estrae intento,
giocatore (fuzzy match) e prezzo, poi delega la decisione al motore.

Separazione dati permanenti / sessione (sezioni 72-87): `PlayerDatabase`
(giocatori, graduatorie, coppie, gioielli, config strategia) vive in una
singola riga SQLite e non viene mai toccato da un'asta. Ogni
`AuctionSession` è un documento indipendente con il proprio `auction_id`,
manager, stato dei giocatori, event log, budget dinamico, ecc.
`createNewAuctionSession` (in `packages/shared/src/session.ts`) è l'unico
punto che crea una sessione da zero; "Reset rapido" richiama la stessa
funzione mantenendo l'id, "Inizia nuova asta" ne crea una nuova e archivia la
precedente.

## Avvio

```bash
npm install
npm run build:shared         # compila il motore condiviso (serve anche al server)
npm run dev:server           # API su :4000, importa l'Excel al primo avvio
npm run dev:web              # frontend su :5173 (proxy /api verso :4000)
```

Al primo avvio il server importa `packages/server/seed/strumento_asta_mantra_2026_27.xlsx`
e salva il Player Database in `packages/server/data/fantacalcio.sqlite`
(SQLite, local-first — nessuna dipendenza da rete durante l'asta). Per
caricare una versione aggiornata dell'Excel durante la stagione, usa
`POST /api/import` (multipart `file`): il merge mantiene stabili gli id dei
giocatori già presenti in una sessione attiva (sezione 53).

## Cosa è implementato

- **Import & Player Database** (priorità 1): tutte le formule delle sezioni
  7-21 del master prompt, verificate contro le formule Excel reali del file.
- **Mia rosa + budget dinamico** (priorità 2): 28 slot strategici, walk-away
  cap, `DynamicMax`, motore di ribilanciamento/finanziamento (sezioni 19-22)
  con log esplicito di ogni taglio/reinvestimento.
- **Registrazione acquisti di tutti i partecipanti** (priorità 3): event log
  con undo (snapshot before/after per evento).
- **Ricerca giocatori e graduatorie** (priorità 4): fuzzy search, `Graduatorie
  433` come segnale primario, `Coppie & Gioielli`, pacchetti portieri.
- **Motore RILANCIA/MOLLA/ATTACCA/COMPRA** (priorità 5): sezioni 29-30, con
  motivazioni esplicite (mai "dipende da diversi fattori").
- **Chat conversazionale** (priorità 6): copre le frasi naturali e gli slash
  command delle sezioni 26/62; per i comandi non ambigui (es. "Preso Hojlund
  a 140") registra l'evento subito, come richiesto dalla sezione 61/71.
- **Alternative dinamiche** (priorità 7): `AlternativeScore` (sezione 50).
- **Nomination engine** (priorità 8): ATTACK/DRAIN/INFORMATION/HIDE
  (sezioni 39-40), con gioielli tenuti nascosti finché il mercato non ha
  speso abbastanza.
- **Opponent modelling** (priorità 9): stile probabilistico per avversario,
  `MaxBidCapacity` (sezione 42).
- Matching pluriruolo↔slot con augmenting-path bipartito (sezione 23),
  riassegnato dopo ogni acquisto.
- Wizard "Nuova asta" completo (sezione 77), conferma con
  salva/esporta/elimina (sezione 75), reset rapido separato.

## Limiti noti (priorità 10, fuori scope MVP)

- Nessun simulatore con 11 avversari virtuali (sezione 59): l'opponent
  modelling è realistico ma reattivo, non proattivo.
- Nessuna integrazione API con una piattaforma d'asta esterna: la modalità
  "autopilot" (sezione 44) è quindi solo decisionale — comunica cosa fare,
  non esegue offerte reali, come previsto dalla sezione 44 in assenza di
  un'integrazione.
- La modalità voce (sezione 28) non è implementata: l'headline sintetica è
  comunque sempre la prima cosa mostrata nella card del giocatore.

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
packages/server   API Express. Importa l'Excel, persiste il Player Database
                  e le AuctionSession su SQLite in locale, o su Postgres
                  quando è impostata la variabile DATABASE_URL (per un
                  deploy cloud senza disco persistente, es. Render free).
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

## Deploy sul cloud (gratis): Render + Supabase

Il piano gratuito di Render non ha un disco permanente, quindi in produzione
il Player Database e le AuctionSession vanno su un database Postgres esterno
gratuito (Supabase) invece che su SQLite. Il codice sceglie da solo il
backend giusto: se la variabile d'ambiente `DATABASE_URL` è impostata usa
Postgres, altrimenti usa SQLite in locale (`packages/server/src/persistence`).

### 1. Crea il database gratuito su Supabase

1. Vai su [supabase.com](https://supabase.com) e crea un account gratuito.
2. **New project** → dai un nome, imposta una password del database (salvala,
   ti servirà) e scegli una regione vicina a te. Aspetta 1-2 minuti che il
   progetto sia pronto.
3. Vai su **Project Settings → Database → Connection string**, scheda
   **URI**, e scegli **Connection pooling** (porta 6543, modalità
   `transaction`) — è la stringa pensata per un backend serverless/free come
   Render. Copiala: è del tipo
   `postgresql://postgres.xxxx:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`.
4. Sostituisci `[PASSWORD]` con la password scelta al punto 2. Questa stringa
   completa è il valore da usare come `DATABASE_URL`.

### 2. Metti il codice su GitHub

Il repository è già pronto (incluso `render.yaml`); ti serve solo che sia su
GitHub, così Render può collegarcisi. Se non l'hai già fatto: crea un
repository su GitHub e pusha questo progetto.

### 3. Crea il servizio su Render

1. Vai su [render.com](https://render.com), crea un account gratuito
   (accesso diretto con GitHub è il più rapido).
2. **New → Blueprint**, scegli il repository GitHub di questo progetto.
   Render legge `render.yaml` da solo e propone un web service chiamato
   `fantacalcio-asta` con piano **Free**.
3. Quando richiesto, incolla nel campo `DATABASE_URL` la stringa di
   connessione di Supabase preparata al punto 1.
4. **Apply / Create**. Il primo deploy fa la build completa (installa le
   dipendenze, compila motore/frontend/server) e può richiedere qualche
   minuto: alla fine Render ti dà un link tipo
   `https://fantacalcio-asta.onrender.com`. Aprilo: al primo avvio l'app
   importa da sola l'Excel incluso nel repo e crea le tabelle su Supabase.

Da quel momento in poi l'app vive tutta lì: nessuna installazione locale,
accessibile da telefono o computer con quel link.

### Limite del piano free da conoscere

Render "addormenta" il servizio dopo ~15 minuti senza richieste; il primo
caricamento dopo una pausa lunga può richiedere 20-30 secondi per
risvegliarsi. Durante un'asta attiva (richieste continue) questo non
succede — è un problema solo se apri il link per la primissima volta dopo
ore di inattività.

### Aggiornare l'Excel una volta online

Usa la stessa app: dalla schermata Home/Live non c'è ancora un pulsante
dedicato, ma puoi caricare un nuovo file con una richiesta diretta all'API,
ad esempio da un terminale (anche dal telefono con un'app tipo Termux, o da
un PC):

```bash
curl -F "file=@nuovo_listone.xlsx" https://fantacalcio-asta.onrender.com/api/import
```

Il merge mantiene stabili gli id dei giocatori già presenti in una sessione
attiva (sezione 53).

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

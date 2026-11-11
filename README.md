# 🦉 Owly

Owly aiuta i bambini dai 6 ai 10 anni a trovare libri da leggere.
Si scrive un argomento in italiano (per esempio “draghi” o “spazio”) e Owly mostra
una lista di libri con copertina, titolo e autori. Toccando un libro si legge una
breve trama, semplice e adatta ai bambini.

I libri e le copertine arrivano da [Open Library](https://openlibrary.org).
Un modello AI (tramite [Groq](https://groq.com)) si occupa di:

- capire l'argomento richiesto, tradurlo in inglese per la ricerca e **bloccare** gli argomenti non adatti ai bambini;
- controllare ogni libro della lista (titolo, autori e argomenti del catalogo) e **mostrare solo quelli adatti ai bambini**;
- tradurre in italiano i titoli dei libri (il titolo originale resta visibile);
- riscrivere la trama in 2-3 frasi semplici, in italiano, e scartare i libri non adatti.

Se il filtro scarta tutti i libri di una pagina, Owly passa da sola alla pagina successiva
(o alla precedente, se si stava tornando indietro), fino a 3 pagine per volta.

La ricerca resta nell'indirizzo della pagina, per esempio `/?q=draghi&page=2&raw=1`:
il tasto "indietro" del browser funziona e un link condiviso riapre gli stessi risultati.

## Struttura del progetto

```
Owly/
├── backend/            Server Node.js (Express): Open Library + AI
│   ├── src/
│   │   ├── index.js    Avvio del server
│   │   ├── app.js      Rotte /api/books e /api/description
│   │   └── ai.js       Chiamate a Groq (con cache in memoria)
│   └── test/
└── frontend/           Pagina web (Vite, JavaScript senza framework)
    ├── index.html
    ├── src/
    │   ├── css/style.css
    │   └── js/         app, api, libri, copertine, paginazione, finestra di dettaglio…
    └── test/
```

## Requisiti

- Node.js (versione recente) e npm
- Una chiave API di Groq: si ottiene gratis su <https://console.groq.com>

## Installazione

```bash
cd backend && npm install
cd ../frontend && npm install
```

Poi crea il file `backend/.env`:

```env
GROQ_API_KEY=la-tua-chiave
# Facoltative:
GROQ_MODEL=qwen/qwen3.8-27b   # modello Groq da usare (questo è il predefinito)
PORT=3000                     # porta del backend
```

## Avvio in sviluppo

Servono due terminali:

```bash
# 1) Backend su http://localhost:3000 (si riavvia da solo a ogni modifica)
cd backend
npm run server
```

```bash
# 2) Frontend su http://localhost:5173
cd frontend
npm run dev
```

Apri <http://localhost:5173>. Vite inoltra al backend tutte le richieste `/api/...`
(vedi `frontend/vite.config.js`). Se cambi `PORT`, aggiorna anche l'indirizzo lì.

## API del backend

### `GET /api/books?category=<testo>&page=<n>`

Cerca i libri su un argomento. Ogni pagina ha 12 libri; le pagine sono al massimo 10.
`page` è facoltativo (predefinito: 1).

Prima cerca libri in italiano; se non ne trova nessuno, ripiega su libri in qualsiasi lingua
(`language: "any"`).

```json
{
  "subject": "dragons",
  "language": "it",
  "page": 1,
  "totalPages": 8,
  "total": 93,
  "filtered": 2,
  "works": [
    {
      "key": "/works/OL123W",
      "title": "Il drago gentile",
      "originalTitle": "The Kind Dragon",
      "coverId": 8231856,
      "authors": [{ "name": "Anna Rossi" }]
    }
  ]
}
```

Se l'argomento non è adatto ai bambini risponde `{ "blocked": true, "works": [] }`.

Ogni pagina viene controllata dall'AI con una sola chiamata, che traduce i titoli e scarta i libri
non adatti ai bambini dai 6 ai 10 anni. `filtered` dice quanti libri della pagina sono stati scartati,
quindi una pagina può contenere meno di 12 libri (o nessuno). `total` e `totalPages` vengono da
Open Library e contano anche i libri che poi saranno scartati.
Se l'AI non risponde, la ricerca fallisce con `502`: nessun libro viene mostrato senza controllo.

### `GET /api/description?key=/works/OL123W`

Restituisce la trama semplificata in italiano:
`{ "description": "…", "suitable": true }`.
Se il libro non ha una descrizione, o non è adatto, `description` è `null`.

### Dati originali: `raw=1`

Entrambe le rotte accettano `raw=1` (o `raw=true`) per ricevere titoli e trame così come sono su
Open Library, senza la rielaborazione dell'AI: niente `originalTitle` e la trama originale al posto
di quella semplificata. Il filtro per bambini resta attivo: ricerche e libri non adatti vengono
bloccati come sempre, quindi l'AI viene comunque interpellata per il giudizio.
Nell'interfaccia corrisponde all'interruttore "Mostra titoli e trame originali".

### Errori e limiti

- `400`: parametri mancanti o non validi (categoria vuota, pagina fuori intervallo, chiave non valida)
- `502`: Open Library o Groq non rispondono
- Massimo 30 richieste al minuto per client
- Le risposte dell'AI restano in cache per 24 ore, per risparmiare chiamate e restare nei limiti del piano gratuito

## Test

I test usano [Vitest](https://vitest.dev) e non fanno chiamate reali né a Groq né
a Open Library.

```bash
cd backend && npx vitest run    # oppure: npm test (modalità watch)
cd frontend && npm run test:run # oppure: npm test (modalità watch)
```

## Build di produzione del frontend

```bash
cd frontend
npm run build     # crea frontend/dist
npm run preview   # anteprima locale della build
```

## Deploy

[https://owly-rho.vercel.app/](https://owly-rho.vercel.app/)
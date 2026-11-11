import axios from "axios";

// Comunicazione con il backend Node (che a sua volta usa Open Library e l'AI).
const client = axios.create({
  baseURL: "/api",
  timeout: 20_000, // la ricerca con l'AI può richiedere qualche secondo
});

// Serve ad app.js per distinguere una richiesta annullata da un vero errore
export const isCancel = axios.isCancel;

// axios lancia già un errore per i codici HTTP non 2xx.
// Qui controlliamo anche che la risposta sia JSON: se manca il proxy di Vite,
// /api/... restituisce index.html (una stringa) e l'errore sarebbe poco chiaro.
async function get(url, { params, signal } = {}) {
  const { data } = await client.get(url, { params, signal });

  if (typeof data !== "object" || data === null) {
    throw new Error(
      "Il server non ha risposto con JSON: controlla il proxy /api",
    );
  }
  return data;
}

// raw: true chiede titoli e trame originali di Open Library, senza la rielaborazione dell'AI
// (il filtro per bambini resta attivo). Il parametro viene inviato solo quando serve.
const rawParam = (raw) => (raw ? { raw: 1 } : {});

// -> { works: [{ key, title, authors: [{ name }] }], page, totalPages, total, language?, blocked? }
export function fetchBooks(category, { page = 1, raw = false, signal } = {}) {
  return get("/books", {
    params: { category, page, ...rawParam(raw) },
    signal,
  });
}

// -> { description: string | null }
export function fetchDescription(workKey, { raw = false, signal } = {}) {
  return get("/description", {
    params: { key: workKey, ...rawParam(raw) },
    signal,
  });
}

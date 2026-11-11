// Stato della ricerca nell'indirizzo della pagina: ?q=draghi&page=2&raw=1
// La pagina 1 e la modalità normale non si scrivono: l'indirizzo resta corto.

// Stesso limite del backend (MAX_PAGES): un numero più alto non darebbe risultati
export const MAX_PAGES = 10;
// Il backend usa solo i primi 60 caratteri della ricerca
const MAX_TEXT = 60;

// "?q=..." -> { text, page, raw }; i valori strani diventano quelli predefiniti
export function readUrl(search) {
  const params = new URLSearchParams(search);
  const text = (params.get("q") ?? "").trim().slice(0, MAX_TEXT);
  const page = Number(params.get("page"));
  return {
    text,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGES ? page : 1,
    raw: params.get("raw") === "1",
  };
}

// { text, page, raw } -> "/percorso?q=..."
export function urlFor(pathname, { text, page = 1, raw = false }) {
  const params = new URLSearchParams({ q: text });
  if (page > 1) params.set("page", String(page));
  if (raw) params.set("raw", "1");
  return `${pathname}?${params}`;
}

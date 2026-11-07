import express from "express";
import rateLimit from "express-rate-limit";
import { categoryToSubject, kidDescription, reviewBooks } from "./ai.js";

const OPEN_LIBRARY = "https://openlibrary.org";

async function getJson(url) {
  const res = await fetch(url, {
    // Open Library chiede di identificarsi: metti un tuo contatto
    headers: { "User-Agent": "Owly (contatto@esempio.it)" },
  });
  if (!res.ok) throw new Error(`Open Library: HTTP ${res.status}`);
  return res.json();
}

// Open Library identifica le copertine con un numero intero: tutto il resto diventa null.
// Il frontend ricostruisce l'URL dell'immagine da questo numero.
const toCoverId = (id) => (Number.isInteger(id) && id > 0 ? id : null);

// Stesso formato che il frontend già conosce: { key, title, coverId, authors: [{ name }] }.
// "subjects" (gli argomenti del catalogo) serve solo all'AI per giudicare il libro:
// viene tolto prima di rispondere.
const asList = (value) => (Array.isArray(value) ? value : []);
const fromSearch = (doc) => ({
  key: doc.key,
  title: doc.title,
  coverId: toCoverId(doc.cover_i),
  authors: asList(doc.author_name).map((name) => ({ name })),
  subjects: asList(doc.subject),
});
const fromSubjects = (work) => ({
  key: work.key,
  title: work.title,
  coverId: toCoverId(work.cover_id),
  authors: asList(work.authors).map((a) => ({ name: a.name })),
  subjects: asList(work.subject),
});

const SERVICE_ERROR = "Servizio non disponibile, riprova tra poco";

// Paginazione: pochi libri per pagina (ogni pagina costa una revisione con l'AI)
// e un numero massimo di pagine, perché oltre un certo punto i risultati sono poco pertinenti.
export const PAGE_SIZE = 12;
export const MAX_PAGES = 10;

// Numero di pagina dalla query: intero tra 1 e MAX_PAGES, altrimenti null (richiesta non valida)
function parsePage(raw) {
  if (raw === undefined) return 1;
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 && page <= MAX_PAGES ? page : null;
}

const countPages = (total) =>
  Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PAGE_SIZE)));

// Tiene solo i libri che l'AI giudica adatti ai bambini, con il titolo in italiano
// (se il titolo cambia, si conserva anche l'originale).
// Il filtro è una protezione: se l'AI non risponde, l'errore arriva alla rotta (502)
// e nessun libro viene mostrato senza controllo.
async function onlyKidBooks(works) {
  if (works.length === 0) return works;

  const reviews = await reviewBooks(
    works.map((work) => ({
      key: work.key,
      title: work.title,
      authors: work.authors.map((a) => a.name),
      subjects: work.subjects,
    })),
  );

  return works.flatMap(({ subjects: _subjects, ...work }, i) => {
    const review = reviews[i];
    if (!review?.suitable) return [];
    return review.title !== work.title
      ? [{ ...work, title: review.title, originalTitle: work.title }]
      : [work];
  });
}

// Factory: ogni chiamata crea un'app nuova (con un rate limiter nuovo),
// così i test non si influenzano a vicenda.
export function createApp({ rateLimitPerMinute = 30 } = {}) {
  const app = express();

  // Limita le richieste (ogni ricerca può costare una chiamata all'AI)
  app.use("/api", rateLimit({ windowMs: 60_000, limit: rateLimitPerMinute }));

  // GET /api/books?category=draghi&page=2
  app.get("/api/books", async (req, res) => {
    const category = String(req.query.category ?? "")
      .trim()
      .slice(0, 60);
    if (!category) return res.status(400).json({ error: "Manca la categoria" });

    const page = parsePage(req.query.page);
    if (page === null) {
      return res.status(400).json({ error: "Pagina non valida" });
    }

    try {
      const { subject, safe } = await categoryToSubject(category);
      if (!safe) return res.json({ blocked: true, works: [] });

      // Prima prova: solo libri in italiano
      const search = await getJson(
        `${OPEN_LIBRARY}/search.json?subject=${encodeURIComponent(subject)}` +
          `&language=ita&limit=${PAGE_SIZE}&page=${page}` +
          `&fields=key,title,author_name,cover_i,subject`,
      );
      let works = (search.docs ?? []).map(fromSearch);
      let total = search.numFound ?? works.length;
      let language = "it";

      // Ripiego: libri di qualsiasi lingua, solo se in italiano non c'è proprio nulla
      // (una pagina vuota oltre la fine dei risultati italiani non deve cambiare lingua)
      if (total === 0) {
        const slug = subject.replace(/ /g, "_");
        const offset = (page - 1) * PAGE_SIZE;
        const data = await getJson(
          `${OPEN_LIBRARY}/subjects/${encodeURIComponent(slug)}.json` +
            `?limit=${PAGE_SIZE}&offset=${offset}`,
        );
        works = (data.works ?? []).map(fromSubjects);
        total = data.work_count ?? works.length;
        language = "any";
      }

      const found = works.length;
      works = await onlyKidBooks(works);

      res.json({
        subject,
        language,
        works,
        page,
        totalPages: countPages(total),
        total,
        filtered: found - works.length, // libri scartati perché non adatti
      });
    } catch (err) {
      console.error("Errore /api/books:", err);
      res.status(502).json({ error: SERVICE_ERROR });
    }
  });

  // GET /api/description?key=/works/OL8193508W
  app.get("/api/description", async (req, res) => {
    const key = String(req.query.key ?? "");
    if (!/^\/works\/OL\d+W$/.test(key)) {
      return res.status(400).json({ error: "Chiave non valida" });
    }

    try {
      const data = await getJson(`${OPEN_LIBRARY}${key}.json`);
      const original =
        typeof data.description === "string"
          ? data.description
          : data.description?.value;

      if (!original) return res.json({ description: null });

      const { text, suitable } = await kidDescription(
        key,
        data.title ?? "",
        original,
      );
      res.json({ description: suitable ? text : null, suitable });
    } catch (err) {
      console.error("Errore /api/description:", err);
      res.status(502).json({ error: SERVICE_ERROR });
    }
  });

  return app;
}

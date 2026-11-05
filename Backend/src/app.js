import express from "express";
import rateLimit from "express-rate-limit";
import { categoryToSubject, kidDescription } from "./ai.js";

const OPEN_LIBRARY = "https://openlibrary.org";

async function getJson(url) {
  const res = await fetch(url, {
    // Open Library chiede di identificarsi: metti un tuo contatto
    headers: { "User-Agent": "Owly (contatto@esempio.it)" },
  });
  if (!res.ok) throw new Error(`Open Library: HTTP ${res.status}`);
  return res.json();
}

// Stesso formato che il frontend già conosce: { key, title, authors: [{ name }] }
const fromSearch = (doc) => ({
  key: doc.key,
  title: doc.title,
  authors: (doc.author_name ?? []).map((name) => ({ name })),
});
const fromSubjects = (work) => ({
  key: work.key,
  title: work.title,
  authors: (work.authors ?? []).map((a) => ({ name: a.name })),
});

const SERVICE_ERROR = "Servizio non disponibile, riprova tra poco";

// Factory: ogni chiamata crea un'app nuova (con un rate limiter nuovo),
// così i test non si influenzano a vicenda.
export function createApp({ rateLimitPerMinute = 30 } = {}) {
  const app = express();

  // Limita le richieste (ogni ricerca può costare una chiamata all'AI)
  app.use("/api", rateLimit({ windowMs: 60_000, limit: rateLimitPerMinute }));

  // GET /api/books?category=draghi
  app.get("/api/books", async (req, res) => {
    const category = String(req.query.category ?? "").trim().slice(0, 60);
    if (!category) return res.status(400).json({ error: "Manca la categoria" });

    try {
      const { subject, safe } = await categoryToSubject(category);
      if (!safe) return res.json({ blocked: true, works: [] });

      // Prima prova: solo libri in italiano
      const search = await getJson(
        `${OPEN_LIBRARY}/search.json?subject=${encodeURIComponent(subject)}` +
          `&language=ita&limit=12&fields=key,title,author_name`,
      );
      let works = (search.docs ?? []).map(fromSearch);
      let language = "it";

      // Ripiego: libri di qualsiasi lingua
      if (works.length === 0) {
        const slug = subject.replace(/ /g, "_");
        const data = await getJson(
          `${OPEN_LIBRARY}/subjects/${encodeURIComponent(slug)}.json?limit=12`,
        );
        works = (data.works ?? []).map(fromSubjects);
        language = "any";
      }

      res.json({ subject, language, works });
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

      const { text, suitable } = await kidDescription(key, data.title ?? "", original);
      res.json({ description: suitable ? text : null, suitable });
    } catch (err) {
      console.error("Errore /api/description:", err);
      res.status(502).json({ error: SERVICE_ERROR });
    }
  });

  return app;
}

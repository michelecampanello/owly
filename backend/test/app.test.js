import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { categoryToSubject, kidDescription, reviewBooks } from "../src/ai.js";

// Le funzioni AI sono finte: qui si testano solo le rotte.
vi.mock("../src/ai.js", () => ({
  categoryToSubject: vi.fn(),
  kidDescription: vi.fn(),
  reviewBooks: vi.fn(),
}));

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const httpError = (status = 500) => ({
  ok: false,
  status,
  json: async () => ({}),
});

const SERVICE_ERROR = "Servizio non disponibile, riprova tra poco";

let app;
let fetchMock;
let errorSpy;

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock); // finto Open Library (supertest non usa fetch)
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  categoryToSubject.mockResolvedValue({ subject: "dragons", safe: true });
  // di base: tutti i libri adatti, nessuna traduzione
  reviewBooks.mockImplementation(async (books) =>
    books.map((book) => ({ title: book.title, suitable: true })),
  );
  app = createApp();
});

const calledUrl = (n = 0) => fetchMock.mock.calls[n][0];

// ---------------------------------------------------------------
describe("GET /api/books", () => {
  const get = (category) => request(app).get("/api/books").query({ category });

  describe("validazione", () => {
    it.each([[undefined], [""], ["   "]])(
      "risponde 400 se la categoria è %j",
      async (category) => {
        const res = await get(category);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Manca la categoria" });
        expect(categoryToSubject).not.toHaveBeenCalled();
      },
    );

    it("toglie gli spazi ai bordi prima di passare il testo all'AI", async () => {
      fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
      fetchMock.mockResolvedValueOnce(ok({ works: [] }));
      await get("  draghi  ");
      expect(categoryToSubject).toHaveBeenCalledWith("draghi");
    });

    it("taglia la categoria a 60 caratteri", async () => {
      fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
      fetchMock.mockResolvedValueOnce(ok({ works: [] }));
      await get("a".repeat(100));
      expect(categoryToSubject).toHaveBeenCalledWith("a".repeat(60));
    });
  });

  describe("filtro di sicurezza", () => {
    it("restituisce blocked e non interroga Open Library", async () => {
      categoryToSubject.mockResolvedValue({ subject: null, safe: false });

      const res = await get("cose brutte");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ blocked: true, works: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("libri in italiano", () => {
    beforeEach(() => {
      categoryToSubject.mockResolvedValue({
        subject: "science fiction",
        safe: true,
      });
    });

    it("cerca per argomento codificato, in italiano, 12 risultati", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ docs: [{ key: "/works/OL1W", title: "T" }] }),
      );

      await get("fantascienza");

      expect(calledUrl()).toBe(
        "https://openlibrary.org/search.json?subject=science%20fiction" +
          "&language=ita&limit=12&page=1&fields=key,title,author_name,cover_i,subject",
      );
    });

    it("si identifica con uno User-Agent", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ docs: [{ key: "/works/OL1W", title: "T" }] }),
      );

      await get("fantascienza");

      expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toContain(
        "Owly",
      );
    });

    it("converte i risultati nel formato del frontend", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          docs: [
            {
              key: "/works/OL1W",
              title: "Il drago",
              author_name: ["Anna Rossi", "Luca Bianchi"],
              cover_i: 12345,
            },
            { key: "/works/OL2W", title: "Senza autore" },
          ],
        }),
      );

      const res = await get("fantascienza");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        subject: "science fiction",
        language: "it",
        page: 1,
        totalPages: 1,
        total: 2,
        filtered: 0,
        works: [
          {
            key: "/works/OL1W",
            title: "Il drago",
            coverId: 12345,
            authors: [{ name: "Anna Rossi" }, { name: "Luca Bianchi" }],
          },
          {
            key: "/works/OL2W",
            title: "Senza autore",
            coverId: null,
            authors: [],
          },
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1); // nessun ripiego
    });
  });

  describe("ripiego su libri di qualsiasi lingua", () => {
    beforeEach(() => {
      categoryToSubject.mockResolvedValue({
        subject: "science fiction",
        safe: true,
      });
    });

    it.each([
      ["docs è vuoto", { docs: [] }],
      ["docs manca", {}],
    ])("scatta quando %s", async (_label, searchResponse) => {
      fetchMock.mockResolvedValueOnce(ok(searchResponse));
      fetchMock.mockResolvedValueOnce(
        ok({
          works: [
            {
              key: "/works/OL9W",
              title: "Dragons",
              authors: [{ name: "J. Smith", key: "/authors/OL1A" }],
              cover_id: 777,
            },
            { key: "/works/OL8W", title: "No authors" },
          ],
        }),
      );

      const res = await get("fantascienza");

      expect(calledUrl(1)).toBe(
        "https://openlibrary.org/subjects/science_fiction.json?limit=12&offset=0",
      );
      expect(res.body).toEqual({
        subject: "science fiction",
        language: "any",
        page: 1,
        totalPages: 1,
        total: 2,
        filtered: 0,
        works: [
          {
            key: "/works/OL9W",
            title: "Dragons",
            coverId: 777,
            authors: [{ name: "J. Smith" }],
          },
          {
            key: "/works/OL8W",
            title: "No authors",
            coverId: null,
            authors: [],
          },
        ],
      });
    });

    it("restituisce works vuoto se anche il ripiego non trova nulla", async () => {
      fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
      fetchMock.mockResolvedValueOnce(ok({}));

      const res = await get("fantascienza");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        subject: "science fiction",
        language: "any",
        works: [],
        page: 1,
        totalPages: 1,
        total: 0,
        filtered: 0,
      });
    });
  });

  describe("errori", () => {
    it("risponde 502 se l'AI fallisce", async () => {
      categoryToSubject.mockRejectedValue(new Error("API giù"));

      const res = await get("draghi");

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: SERVICE_ERROR });
      expect(errorSpy).toHaveBeenCalled();
    });

    it("risponde 502 se Open Library risponde con un errore", async () => {
      fetchMock.mockResolvedValueOnce(httpError(503));

      const res = await get("draghi");

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: SERVICE_ERROR });
    });

    it("risponde 502 se il ripiego fallisce", async () => {
      fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
      fetchMock.mockResolvedValueOnce(httpError(500));

      const res = await get("draghi");

      expect(res.status).toBe(502);
    });

    it("risponde 502 se la rete non funziona", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
      const res = await get("draghi");
      expect(res.status).toBe(502);
    });

    it("non rivela dettagli interni nel messaggio d'errore", async () => {
      categoryToSubject.mockRejectedValue(
        new Error("chiave sk-ant-segreta non valida"),
      );

      const res = await get("draghi");

      expect(JSON.stringify(res.body)).not.toContain("sk-ant");
    });
  });
});

// ---------------------------------------------------------------
describe("GET /api/books: paginazione", () => {
  const get = (query) =>
    request(app)
      .get("/api/books")
      .query({ category: "draghi", ...query });
  const docs = [{ key: "/works/OL1W", title: "A" }];

  it("chiede a Open Library la pagina richiesta", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs, numFound: 40 }));

    const res = await get({ page: 3 });

    expect(calledUrl()).toContain("&limit=12&page=3&");
    expect(res.body).toMatchObject({ page: 3, totalPages: 4, total: 40 });
  });

  it("senza page parte dalla prima pagina", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs, numFound: 1 }));

    const res = await get();

    expect(calledUrl()).toContain("&page=1&");
    expect(res.body).toMatchObject({ page: 1, totalPages: 1 });
  });

  it("limita il numero di pagine a MAX_PAGES", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs, numFound: 5000 }));

    const res = await get();

    expect(res.body.totalPages).toBe(10);
    expect(res.body.total).toBe(5000);
  });

  it.each([["0"], ["-1"], ["2.5"], ["abc"], ["11"]])(
    "risponde 400 se la pagina è %j",
    async (page) => {
      const res = await get({ page });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Pagina non valida" });
      expect(categoryToSubject).not.toHaveBeenCalled();
    },
  );

  it("non passa al ripiego se la pagina è oltre i risultati italiani", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [], numFound: 20 }));

    const res = await get({ page: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ language: "it", works: [], totalPages: 2 });
  });

  it("nel ripiego usa offset e work_count", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [], numFound: 0 }));
    fetchMock.mockResolvedValueOnce(
      ok({ works: [{ key: "/works/OL9W", title: "B" }], work_count: 30 }),
    );

    const res = await get({ page: 2 });

    expect(calledUrl(1)).toBe(
      "https://openlibrary.org/subjects/dragons.json?limit=12&offset=12",
    );
    expect(res.body).toMatchObject({
      language: "any",
      page: 2,
      totalPages: 3,
      total: 30,
    });
  });
});

// ---------------------------------------------------------------
describe("GET /api/books: revisione AI (filtro per bambini e titoli)", () => {
  const get = () =>
    request(app).get("/api/books").query({ category: "draghi" });
  const docs = [
    {
      key: "/works/OL1W",
      title: "The Dragon",
      author_name: ["Anna Rossi"],
      subject: ["Juvenile fiction", "Dragons"],
    },
    { key: "/works/OL2W", title: "Il gatto" },
    { key: "/works/OL3W", title: "Dark Tales", subject: ["Horror"] },
  ];
  const reviewed = (...reviews) => reviewBooks.mockResolvedValue(reviews);

  it("passa all'AI titolo, autori e argomenti di ogni libro, in ordine", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs }));

    await get();

    expect(reviewBooks).toHaveBeenCalledTimes(1);
    expect(reviewBooks).toHaveBeenCalledWith([
      {
        key: "/works/OL1W",
        title: "The Dragon",
        authors: ["Anna Rossi"],
        subjects: ["Juvenile fiction", "Dragons"],
      },
      { key: "/works/OL2W", title: "Il gatto", authors: [], subjects: [] },
      { key: "/works/OL3W", title: "Dark Tales", authors: [], subjects: ["Horror"] },
    ]);
  });

  it("toglie i libri non adatti e conta quanti ne ha scartati", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs, numFound: 3 }));
    reviewed(
      { title: "Il drago", suitable: true },
      { title: "Il gatto", suitable: true },
      { title: "Racconti oscuri", suitable: false },
    );

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.works.map((w) => w.key)).toEqual(["/works/OL1W", "/works/OL2W"]);
    expect(res.body.filtered).toBe(1);
  });

  it("traduce i titoli e conserva quello originale", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs }));
    reviewed(
      { title: "Il drago", suitable: true },
      { title: "Il gatto", suitable: true },
      { title: "Racconti oscuri", suitable: false },
    );

    const res = await get();

    expect(res.body.works[0]).toEqual({
      key: "/works/OL1W",
      title: "Il drago",
      originalTitle: "The Dragon",
      coverId: null,
      authors: [{ name: "Anna Rossi" }],
    });
    // titolo già in italiano: niente originalTitle
    expect(res.body.works[1]).toEqual({
      key: "/works/OL2W",
      title: "Il gatto",
      coverId: null,
      authors: [],
    });
  });

  it("non manda al frontend gli argomenti del catalogo", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs }));
    const res = await get();
    expect(res.body.works.every((w) => !("subjects" in w))).toBe(true);
  });

  it("se tutti i libri sono scartati restituisce una lista vuota", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs, numFound: 30 }));
    reviewed(
      { title: "A", suitable: false },
      { title: "B", suitable: false },
      { title: "C", suitable: false },
    );

    const res = await get();

    expect(res.body).toMatchObject({ works: [], filtered: 3, totalPages: 3 });
  });

  it("filtra anche i libri del ripiego su altre lingue", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
    fetchMock.mockResolvedValueOnce(
      ok({
        works: [
          { key: "/works/OL9W", title: "Dragons", subject: ["Picture books"] },
          { key: "/works/OL8W", title: "War", subject: ["Violence"] },
        ],
      }),
    );
    reviewed(
      { title: "Draghi", suitable: true },
      { title: "Guerra", suitable: false },
    );

    const res = await get();

    expect(reviewBooks.mock.calls[0][0][0].subjects).toEqual(["Picture books"]);
    expect(res.body.language).toBe("any");
    expect(res.body.works).toHaveLength(1);
    expect(res.body.works[0]).toMatchObject({
      title: "Draghi",
      originalTitle: "Dragons",
    });
  });

  it("se l'AI fallisce risponde 502: nessun libro passa senza controllo", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs }));
    reviewBooks.mockRejectedValue(new Error("Groq: 429 - limite"));

    const res = await get();

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: SERVICE_ERROR });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("scarta i libri senza giudizio se la risposta è incompleta", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs }));
    reviewed({ title: "Il drago", suitable: true }); // solo il primo

    const res = await get();

    expect(res.body.works.map((w) => w.key)).toEqual(["/works/OL1W"]);
  });

  it("ignora un campo subject che non è un elenco", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ docs: [{ key: "/works/OL1W", title: "A", subject: "Horror" }] }),
    );
    await get();
    expect(reviewBooks.mock.calls[0][0][0].subjects).toEqual([]);
  });

  it("non chiama l'AI se non ci sono libri", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
    fetchMock.mockResolvedValueOnce(ok({ works: [] }));

    await get();

    expect(reviewBooks).not.toHaveBeenCalled();
  });

  it("non chiama l'AI per gli argomenti bloccati", async () => {
    categoryToSubject.mockResolvedValue({ subject: null, safe: false });

    await get();

    expect(reviewBooks).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
describe("GET /api/books: copertine", () => {
  const get = () =>
    request(app).get("/api/books").query({ category: "draghi" });
  const coverIds = (res) => res.body.works.map((w) => w.coverId);

  it("restituisce coverId a partire da cover_i (ricerca)", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ docs: [{ key: "/works/OL1W", title: "A", cover_i: 240727 }] }),
    );
    expect(coverIds(await get())).toEqual([240727]);
  });

  it("restituisce coverId a partire da cover_id (ripiego)", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
    fetchMock.mockResolvedValueOnce(
      ok({ works: [{ key: "/works/OL1W", title: "A", cover_id: 555 }] }),
    );
    expect(coverIds(await get())).toEqual([555]);
  });

  it.each([
    ["manca", undefined],
    ["è null", null],
    ["è zero", 0],
    ["è negativo", -4],
    ["è decimale", 1.5],
    ["è una stringa", "240727"],
    ["è una stringa pericolosa", "1/../../x"],
    ["è un oggetto", { id: 1 }],
  ])("coverId è null se cover_i %s", async (_label, cover_i) => {
    fetchMock.mockResolvedValueOnce(
      ok({ docs: [{ key: "/works/OL1W", title: "A", cover_i }] }),
    );
    expect(coverIds(await get())).toEqual([null]);
  });

  it("chiede a Open Library il campo cover_i", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ docs: [{ key: "/works/OL1W", title: "A" }] }),
    );
    await get();
    expect(fetchMock.mock.calls[0][0]).toContain(
      "fields=key,title,author_name,cover_i",
    );
  });

  it("la traduzione dei titoli non fa perdere la copertina", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ docs: [{ key: "/works/OL1W", title: "The Dragon", cover_i: 99 }] }),
    );
    reviewBooks.mockResolvedValue([{ title: "Il drago", suitable: true }]);

    const res = await get();

    expect(res.body.works[0]).toMatchObject({ title: "Il drago", coverId: 99 });
  });
});

// ---------------------------------------------------------------
describe("GET /api/description", () => {
  const get = (key) => request(app).get("/api/description").query({ key });

  describe("validazione della chiave", () => {
    it.each([
      [undefined],
      [""],
      ["/works/OL1"],
      ["/works/OL1W/../x"],
      ["/works/OL1W.json"],
      ["/authors/OL1A"],
      ["../etc/passwd"],
      ["https://evil.example/works/OL1W"],
      ["/works/OLabcW"],
    ])("risponde 400 per la chiave %j", async (key) => {
      const res = await get(key);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Chiave non valida" });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("descrizione", () => {
    beforeEach(() => {
      kidDescription.mockResolvedValue({
        text: "Un drago gentile.",
        suitable: true,
      });
    });

    it("scarica l'opera da Open Library e restituisce il testo semplificato", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ title: "Il drago", description: "A friendly dragon." }),
      );

      const res = await get("/works/OL1W");

      expect(calledUrl()).toBe("https://openlibrary.org/works/OL1W.json");
      expect(kidDescription).toHaveBeenCalledWith(
        "/works/OL1W",
        "Il drago",
        "A friendly dragon.",
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        description: "Un drago gentile.",
        suitable: true,
      });
    });

    it("legge la descrizione anche quando è un oggetto {value}", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          title: "Il drago",
          description: { type: "/type/text", value: "In oggetto." },
        }),
      );

      await get("/works/OL1W");

      expect(kidDescription).toHaveBeenCalledWith(
        "/works/OL1W",
        "Il drago",
        "In oggetto.",
      );
    });

    it("usa un titolo vuoto se l'opera non ha titolo", async () => {
      fetchMock.mockResolvedValueOnce(ok({ description: "Testo." }));

      await get("/works/OL1W");

      expect(kidDescription).toHaveBeenCalledWith("/works/OL1W", "", "Testo.");
    });

    it.each([
      ["manca", {}],
      ["è vuota", { description: "" }],
      ["è un oggetto senza value", { description: { type: "/type/text" } }],
    ])(
      "restituisce description:null se %s, senza usare l'AI",
      async (_label, data) => {
        fetchMock.mockResolvedValueOnce(ok(data));

        const res = await get("/works/OL1W");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ description: null });
        expect(kidDescription).not.toHaveBeenCalled();
      },
    );

    it("nasconde il testo se il libro non è adatto ai bambini", async () => {
      kidDescription.mockResolvedValue({
        text: "Storia per adulti.",
        suitable: false,
      });
      fetchMock.mockResolvedValueOnce(
        ok({ title: "T", description: "Adult story." }),
      );

      const res = await get("/works/OL1W");

      expect(res.body).toEqual({ description: null, suitable: false });
    });
  });

  describe("errori", () => {
    it("risponde 502 se Open Library risponde con un errore", async () => {
      fetchMock.mockResolvedValueOnce(httpError(404));

      const res = await get("/works/OL1W");

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: SERVICE_ERROR });
      expect(errorSpy).toHaveBeenCalled();
    });

    it("risponde 502 se l'AI fallisce", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ title: "T", description: "Testo." }),
      );
      kidDescription.mockRejectedValue(new Error("API giù"));

      const res = await get("/works/OL1W");

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: SERVICE_ERROR });
    });

    it("risponde 502 se la rete non funziona", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
      const res = await get("/works/OL1W");
      expect(res.status).toBe(502);
    });
  });
});

// ---------------------------------------------------------------
describe("modalità raw (dati originali, senza rielaborazione)", () => {
  const doc = { key: "/works/OL1W", title: "The Dragon", author_name: ["Anna Rossi"] };

  it("/api/books con raw=1 lascia il titolo originale", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [doc], numFound: 1 }));
    reviewBooks.mockResolvedValue([{ title: "Il drago", suitable: true }]);

    const res = await request(app)
      .get("/api/books")
      .query({ category: "draghi", raw: "1" });

    expect(res.status).toBe(200);
    expect(res.body.works).toEqual([
      {
        key: "/works/OL1W",
        title: "The Dragon",
        coverId: null,
        authors: [{ name: "Anna Rossi" }],
      },
    ]);
  });

  it("/api/books con raw=1 tiene comunque il filtro per bambini", async () => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [doc], numFound: 1 }));
    reviewBooks.mockResolvedValue([{ title: "Il drago", suitable: false }]);

    const res = await request(app)
      .get("/api/books")
      .query({ category: "draghi", raw: "1" });

    expect(res.body.works).toEqual([]);
    expect(res.body.filtered).toBe(1);
  });

  it("/api/books con raw=1 blocca comunque le ricerche non adatte", async () => {
    categoryToSubject.mockResolvedValue({ subject: null, safe: false });

    const res = await request(app)
      .get("/api/books")
      .query({ category: "cose brutte", raw: "1" });

    expect(res.body).toEqual({ blocked: true, works: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["0", "no", ""])("raw=%s non attiva la modalità originale", async (raw) => {
    fetchMock.mockResolvedValueOnce(ok({ docs: [doc], numFound: 1 }));
    reviewBooks.mockResolvedValue([{ title: "Il drago", suitable: true }]);

    const res = await request(app)
      .get("/api/books")
      .query({ category: "draghi", raw });

    expect(res.body.works[0].title).toBe("Il drago");
  });

  it("/api/description con raw=1 restituisce la trama originale", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ title: "The Dragon", description: "A friendly dragon." }),
    );
    kidDescription.mockResolvedValue({ text: "Un drago gentile.", suitable: true });

    const res = await request(app)
      .get("/api/description")
      .query({ key: "/works/OL1W", raw: "1" });

    expect(res.body).toEqual({ description: "A friendly dragon.", suitable: true });
  });

  it("/api/description con raw=1 nasconde comunque le trame non adatte", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ title: "T", description: "Adult story." }),
    );
    kidDescription.mockResolvedValue({ text: "Per adulti.", suitable: false });

    const res = await request(app)
      .get("/api/description")
      .query({ key: "/works/OL1W", raw: "1" });

    expect(res.body).toEqual({ description: null, suitable: false });
  });
});

// ---------------------------------------------------------------
describe("rate limit", () => {
  it("blocca con 429 le richieste oltre il limite", async () => {
    const limited = createApp({ rateLimitPerMinute: 2 });
    const hit = () =>
      request(limited).get("/api/description").query({ key: "x" });

    expect((await hit()).status).toBe(400); // 1ª: arriva alla rotta
    expect((await hit()).status).toBe(400); // 2ª: arriva alla rotta
    expect((await hit()).status).toBe(429); // 3ª: bloccata
  });

  it("vale per tutte le rotte /api", async () => {
    const limited = createApp({ rateLimitPerMinute: 1 });

    await request(limited).get("/api/books"); // 400, ma conta
    const res = await request(limited)
      .get("/api/description")
      .query({ key: "x" });

    expect(res.status).toBe(429);
  });

  it("dietro al proxy conta ogni client separatamente", async () => {
    const limited = createApp({ rateLimitPerMinute: 1 });
    const hit = (ip) =>
      request(limited).get("/api/books").set("X-Forwarded-For", ip);

    expect((await hit("203.0.113.1")).status).toBe(400);
    expect((await hit("203.0.113.1")).status).toBe(429);
    expect((await hit("203.0.113.2")).status).toBe(400);
  });

  it("ogni app creata ha il suo contatore", async () => {
    const first = createApp({ rateLimitPerMinute: 1 });
    await request(first).get("/api/books");
    expect((await request(first).get("/api/books")).status).toBe(429);

    const second = createApp({ rateLimitPerMinute: 1 });
    expect((await request(second).get("/api/books")).status).toBe(400);
  });
});

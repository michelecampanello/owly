import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { categoryToSubject, kidDescription } from "../src/ai.js";

// Le funzioni AI sono finte: qui si testano solo le rotte.
vi.mock("../ai.js", () => ({
  categoryToSubject: vi.fn(),
  kidDescription: vi.fn(),
}));

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const httpError = (status = 500) => ({ ok: false, status, json: async () => ({}) });

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
      categoryToSubject.mockResolvedValue({ subject: "science fiction", safe: true });
    });

    it("cerca per argomento codificato, in italiano, 12 risultati", async () => {
      fetchMock.mockResolvedValueOnce(ok({ docs: [{ key: "/works/OL1W", title: "T" }] }));

      await get("fantascienza");

      expect(calledUrl()).toBe(
        "https://openlibrary.org/search.json?subject=science%20fiction" +
          "&language=ita&limit=12&fields=key,title,author_name",
      );
    });

    it("si identifica con uno User-Agent", async () => {
      fetchMock.mockResolvedValueOnce(ok({ docs: [{ key: "/works/OL1W", title: "T" }] }));

      await get("fantascienza");

      expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toContain("Owly");
    });

    it("converte i risultati nel formato del frontend", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          docs: [
            { key: "/works/OL1W", title: "Il drago", author_name: ["Anna Rossi", "Luca Bianchi"] },
            { key: "/works/OL2W", title: "Senza autore" },
          ],
        }),
      );

      const res = await get("fantascienza");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        subject: "science fiction",
        language: "it",
        works: [
          {
            key: "/works/OL1W",
            title: "Il drago",
            authors: [{ name: "Anna Rossi" }, { name: "Luca Bianchi" }],
          },
          { key: "/works/OL2W", title: "Senza autore", authors: [] },
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1); // nessun ripiego
    });
  });

  describe("ripiego su libri di qualsiasi lingua", () => {
    beforeEach(() => {
      categoryToSubject.mockResolvedValue({ subject: "science fiction", safe: true });
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
            },
            { key: "/works/OL8W", title: "No authors" },
          ],
        }),
      );

      const res = await get("fantascienza");

      expect(calledUrl(1)).toBe(
        "https://openlibrary.org/subjects/science_fiction.json?limit=12",
      );
      expect(res.body).toEqual({
        subject: "science fiction",
        language: "any",
        works: [
          { key: "/works/OL9W", title: "Dragons", authors: [{ name: "J. Smith" }] },
          { key: "/works/OL8W", title: "No authors", authors: [] },
        ],
      });
    });

    it("restituisce works vuoto se anche il ripiego non trova nulla", async () => {
      fetchMock.mockResolvedValueOnce(ok({ docs: [] }));
      fetchMock.mockResolvedValueOnce(ok({}));

      const res = await get("fantascienza");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ subject: "science fiction", language: "any", works: [] });
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
      categoryToSubject.mockRejectedValue(new Error("chiave sk-ant-segreta non valida"));

      const res = await get("draghi");

      expect(JSON.stringify(res.body)).not.toContain("sk-ant");
    });
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
      kidDescription.mockResolvedValue({ text: "Un drago gentile.", suitable: true });
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
      expect(res.body).toEqual({ description: "Un drago gentile.", suitable: true });
    });

    it("legge la descrizione anche quando è un oggetto {value}", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ title: "Il drago", description: { type: "/type/text", value: "In oggetto." } }),
      );

      await get("/works/OL1W");

      expect(kidDescription).toHaveBeenCalledWith("/works/OL1W", "Il drago", "In oggetto.");
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
    ])("restituisce description:null se %s, senza usare l'AI", async (_label, data) => {
      fetchMock.mockResolvedValueOnce(ok(data));

      const res = await get("/works/OL1W");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ description: null });
      expect(kidDescription).not.toHaveBeenCalled();
    });

    it("nasconde il testo se il libro non è adatto ai bambini", async () => {
      kidDescription.mockResolvedValue({ text: "Storia per adulti.", suitable: false });
      fetchMock.mockResolvedValueOnce(ok({ title: "T", description: "Adult story." }));

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
      fetchMock.mockResolvedValueOnce(ok({ title: "T", description: "Testo." }));
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
describe("rate limit", () => {
  it("blocca con 429 le richieste oltre il limite", async () => {
    const limited = createApp({ rateLimitPerMinute: 2 });
    const hit = () => request(limited).get("/api/description").query({ key: "x" });

    expect((await hit()).status).toBe(400); // 1ª: arriva alla rotta
    expect((await hit()).status).toBe(400); // 2ª: arriva alla rotta
    expect((await hit()).status).toBe(429); // 3ª: bloccata
  });

  it("vale per tutte le rotte /api", async () => {
    const limited = createApp({ rateLimitPerMinute: 1 });

    await request(limited).get("/api/books"); // 400, ma conta
    const res = await request(limited).get("/api/description").query({ key: "x" });

    expect(res.status).toBe(429);
  });

  it("ogni app creata ha il suo contatore", async () => {
    const first = createApp({ rateLimitPerMinute: 1 });
    await request(first).get("/api/books");
    expect((await request(first).get("/api/books")).status).toBe(429);

    const second = createApp({ rateLimitPerMinute: 1 });
    expect((await request(second).get("/api/books")).status).toBe(400);
  });
});

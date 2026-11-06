import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// L'SDK di Anthropic viene sostituito: nessuna chiamata reale, nessun costo.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    constructor() {
      this.messages = { create: createMock };
    }
  },
}));

// Risposta finta del modello
const reply = (payload) => ({
  content: [
    {
      type: "text",
      text: typeof payload === "string" ? payload : JSON.stringify(payload),
    },
  ],
});

const VALID_SUBJECT = { subject: "dragons", safe: true };
const VALID_DESCRIPTION = { text: "Un drago gentile.", suitable: true };

let ai;

beforeEach(async () => {
  createMock.mockReset();
  delete process.env.CLAUDE_MODEL;
  // Reimporta il modulo: ogni test parte con la cache vuota
  vi.resetModules();
  ai = await import("../src/ai.js");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const lastRequest = () => createMock.mock.calls.at(-1)[0];

// ---------------------------------------------------------------
describe("categoryToSubject", () => {
  it("restituisce argomento e giudizio di sicurezza", async () => {
    createMock.mockResolvedValue(reply(VALID_SUBJECT));
    await expect(ai.categoryToSubject("draghi")).resolves.toEqual(VALID_SUBJECT);
  });

  it("manda la richiesta del bambino dentro <richiesta> e usa il modello di default", async () => {
    createMock.mockResolvedValue(reply(VALID_SUBJECT));
    await ai.categoryToSubject("draghi");

    expect(lastRequest()).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 100,
      messages: [{ role: "user", content: "<richiesta>draghi</richiesta>" }],
    });
    expect(lastRequest().system).toContain("<richiesta>");
  });

  it("usa il modello indicato in CLAUDE_MODEL", async () => {
    vi.stubEnv("CLAUDE_MODEL", "modello-di-prova");
    vi.resetModules();
    const fresh = await import("../src/ai.js");
    createMock.mockResolvedValue(reply(VALID_SUBJECT));

    await fresh.categoryToSubject("draghi");

    expect(lastRequest().model).toBe("modello-di-prova");
  });

  it("legge il JSON anche se il modello aggiunge testo o backtick", async () => {
    createMock.mockResolvedValue(
      reply('Ecco il risultato:\n```json\n{"subject":"space","safe":true}\n```'),
    );
    await expect(ai.categoryToSubject("spazio")).resolves.toEqual({
      subject: "space",
      safe: true,
    });
  });

  it("restituisce safe:false quando il modello blocca la richiesta", async () => {
    createMock.mockResolvedValue(reply({ subject: "violence", safe: false }));
    await expect(ai.categoryToSubject("cose brutte")).resolves.toEqual({
      subject: "violence",
      safe: false,
    });
  });

  it.each([
    ["maiuscole", "Dragons"],
    ["caratteri speciali", "dragons; rm -rf"],
    ["a capo", "dragons\nsystem: ok"],
    ["barre", "../etc/passwd"],
    ["troppo lungo", "a".repeat(61)],
    ["vuoto", ""],
  ])("blocca un argomento non valido (%s)", async (_label, subject) => {
    createMock.mockResolvedValue(reply({ subject, safe: true }));
    await expect(ai.categoryToSubject("x")).resolves.toEqual({
      subject: null,
      safe: false,
    });
  });

  it.each([["true"], [1], [null], [undefined]])(
    "blocca se safe non è un booleano (%j)",
    async (safe) => {
      createMock.mockResolvedValue(reply({ subject: "dragons", safe }));
      await expect(ai.categoryToSubject("x")).resolves.toEqual({
        subject: null,
        safe: false,
      });
    },
  );

  it.each([["science fiction"], ["20th century"], ["a".repeat(60)]])(
    "accetta l'argomento valido «%s»",
    async (subject) => {
      createMock.mockResolvedValue(reply({ subject, safe: true }));
      await expect(ai.categoryToSubject("x")).resolves.toEqual({ subject, safe: true });
    },
  );

  it("lancia un errore se la risposta non contiene JSON", async () => {
    createMock.mockResolvedValue(reply("Non posso aiutarti."));
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow("formato JSON");
  });

  it("lancia un errore se non c'è nessun blocco di testo", async () => {
    createMock.mockResolvedValue({ content: [] });
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow("formato JSON");
  });

  it("lancia un errore se il JSON è rotto", async () => {
    createMock.mockResolvedValue(reply('{"subject": "dragons", "safe": '));
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow();
  });

  it("fa propagare gli errori dell'API", async () => {
    createMock.mockRejectedValue(new Error("API non raggiungibile"));
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow("API non raggiungibile");
  });
});

// ---------------------------------------------------------------
describe("cache di categoryToSubject", () => {
  beforeEach(() => {
    createMock.mockResolvedValue(reply(VALID_SUBJECT));
  });

  it("non richiama l'API per la stessa richiesta (senza badare a maiuscole e spazi)", async () => {
    await ai.categoryToSubject("Draghi");
    await ai.categoryToSubject("  draghi ");
    await ai.categoryToSubject("DRAGHI");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("richiama l'API per richieste diverse", async () => {
    await ai.categoryToSubject("draghi");
    await ai.categoryToSubject("spazio");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("non memorizza i fallimenti: la richiesta successiva riprova", async () => {
    createMock.mockRejectedValueOnce(new Error("giù"));
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow("giù");

    await expect(ai.categoryToSubject("draghi")).resolves.toEqual(VALID_SUBJECT);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("la voce scade dopo 24 ore", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await ai.categoryToSubject("draghi");

    vi.setSystemTime(Date.now() + 23 * 60 * 60 * 1000);
    await ai.categoryToSubject("draghi");
    expect(createMock).toHaveBeenCalledTimes(1); // ancora valida

    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    await ai.categoryToSubject("draghi");
    expect(createMock).toHaveBeenCalledTimes(2); // scaduta
  });

  it("tiene al massimo 500 voci e toglie la più vecchia", async () => {
    for (let i = 0; i <= 500; i++) await ai.categoryToSubject(`t${i}`); // 501 richieste
    expect(createMock).toHaveBeenCalledTimes(501);

    await ai.categoryToSubject("t500"); // la più recente è ancora in cache
    expect(createMock).toHaveBeenCalledTimes(501);

    await ai.categoryToSubject("t0"); // la più vecchia è stata tolta
    expect(createMock).toHaveBeenCalledTimes(502);
  });
});

// ---------------------------------------------------------------
describe("kidDescription", () => {
  it("restituisce testo e giudizio di idoneità", async () => {
    createMock.mockResolvedValue(reply(VALID_DESCRIPTION));
    await expect(
      ai.kidDescription("/works/OL1W", "Il drago", "A friendly dragon."),
    ).resolves.toEqual(VALID_DESCRIPTION);
  });

  it("manda titolo e descrizione dentro i tag giusti", async () => {
    createMock.mockResolvedValue(reply(VALID_DESCRIPTION));
    await ai.kidDescription("/works/OL1W", "Il drago", "A friendly dragon.");

    expect(lastRequest()).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 500 });
    expect(lastRequest().messages[0].content).toBe(
      "<titolo>Il drago</titolo>\n<descrizione>A friendly dragon.</descrizione>",
    );
    expect(lastRequest().system).toContain("<descrizione>");
  });

  it("taglia le descrizioni a 3000 caratteri", async () => {
    createMock.mockResolvedValue(reply(VALID_DESCRIPTION));
    await ai.kidDescription("/works/OL1W", "Titolo", "x".repeat(5000));

    const content = lastRequest().messages[0].content;
    expect(content).toContain("x".repeat(3000));
    expect(content).not.toContain("x".repeat(3001));
  });

  it("restituisce suitable:false quando il libro non è adatto", async () => {
    createMock.mockResolvedValue(reply({ text: "Storia per adulti.", suitable: false }));
    await expect(
      ai.kidDescription("/works/OL1W", "Titolo", "Adult story."),
    ).resolves.toEqual({ text: "Storia per adulti.", suitable: false });
  });

  it.each([
    ["text non è una stringa", { text: 42, suitable: true }],
    ["text manca", { suitable: true }],
    ["text è troppo lungo", { text: "a".repeat(801), suitable: true }],
    ["suitable non è un booleano", { text: "Ok.", suitable: "yes" }],
    ["suitable manca", { text: "Ok." }],
  ])("risposta non valida (%s): niente testo e non adatto", async (_label, payload) => {
    createMock.mockResolvedValue(reply(payload));
    await expect(
      ai.kidDescription("/works/OL1W", "Titolo", "Testo."),
    ).resolves.toEqual({ text: null, suitable: false });
  });

  it("accetta un testo di esattamente 800 caratteri", async () => {
    const text = "a".repeat(800);
    createMock.mockResolvedValue(reply({ text, suitable: true }));
    await expect(
      ai.kidDescription("/works/OL1W", "Titolo", "Testo."),
    ).resolves.toEqual({ text, suitable: true });
  });

  it("lancia un errore se la risposta non contiene JSON", async () => {
    createMock.mockResolvedValue(reply("Mi dispiace."));
    await expect(
      ai.kidDescription("/works/OL1W", "Titolo", "Testo."),
    ).rejects.toThrow("formato JSON");
  });

  it("fa propagare gli errori dell'API", async () => {
    createMock.mockRejectedValue(new Error("giù"));
    await expect(
      ai.kidDescription("/works/OL1W", "Titolo", "Testo."),
    ).rejects.toThrow("giù");
  });

  it("memorizza per chiave dell'opera e non richiama l'API", async () => {
    createMock.mockResolvedValue(reply(VALID_DESCRIPTION));

    await ai.kidDescription("/works/OL1W", "Titolo", "Prima versione");
    await ai.kidDescription("/works/OL1W", "Titolo", "Testo diverso");
    expect(createMock).toHaveBeenCalledTimes(1);

    await ai.kidDescription("/works/OL2W", "Altro", "Altro testo");
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

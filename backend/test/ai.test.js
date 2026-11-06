import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// axios è finto: nessuna chiamata reale a Groq, nessun consumo del piano gratuito.
const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({ post: postMock })),
    isAxiosError: (error) => error?.isAxiosError === true,
  },
}));

// Risposta finta di Groq (formato OpenAI)
const reply = (payload) => ({
  data: {
    choices: [
      {
        message: {
          content:
            typeof payload === "string" ? payload : JSON.stringify(payload),
        },
      },
    ],
  },
});

// Errore finto come quello di axios: contiene anche la configurazione con la chiave!
const axiosError = ({ status, message, code, detail } = {}) => ({
  isAxiosError: true,
  message: message ?? `Request failed with status code ${status}`,
  code,
  response: status
    ? { status, data: { error: { message: detail } } }
    : undefined,
  config: { headers: { Authorization: "Bearer gsk_test" } },
});

const VALID_SUBJECT = { subject: "dragons", safe: true };
const VALID_DESCRIPTION = { text: "Un drago gentile.", suitable: true };

let ai;

beforeEach(async () => {
  postMock.mockReset();
  process.env.GROQ_API_KEY = "gsk_test";
  delete process.env.GROQ_MODEL;
  // Reimporta il modulo: ogni test parte con la cache vuota
  vi.resetModules();
  ai = await import("../src/ai.js");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete process.env.GROQ_API_KEY;
});

const lastCall = () => postMock.mock.calls.at(-1); // [url, body, config]
const lastBody = () => lastCall()[1];

// ---------------------------------------------------------------
describe("richiesta a Groq", () => {
  beforeEach(() => {
    postMock.mockResolvedValue(reply(VALID_SUBJECT));
  });

  it("fa una POST a /chat/completions con modello, JSON mode e messaggi", async () => {
    await ai.categoryToSubject("draghi");

    expect(lastCall()[0]).toBe("/chat/completions");
    expect(lastBody()).toMatchObject({
      model: "llama-3.3-70b-versatile",
      max_completion_tokens: 100,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect(lastBody().messages).toEqual([
      { role: "system", content: expect.stringContaining("<richiesta>") },
      { role: "user", content: "<richiesta>draghi</richiesta>" },
    ]);
  });

  it("manda la chiave API nell'intestazione Authorization", async () => {
    await ai.categoryToSubject("draghi");
    expect(lastCall()[2].headers.Authorization).toBe("Bearer gsk_test");
  });

  it("usa il modello indicato in GROQ_MODEL", async () => {
    vi.stubEnv("GROQ_MODEL", "modello-di-prova");
    vi.resetModules();
    const fresh = await import("../src/ai.js");

    await fresh.categoryToSubject("draghi");

    expect(lastBody().model).toBe("modello-di-prova");
  });

  it("senza GROQ_API_KEY lancia un errore chiaro e non chiama Groq", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow(
      "GROQ_API_KEY",
    );
    expect(postMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
describe("errori di Groq", () => {
  it("trasforma l'errore HTTP in un messaggio pulito, senza la chiave", async () => {
    postMock.mockRejectedValue(
      axiosError({ status: 401, detail: "Invalid API Key" }),
    );

    const error = await ai.categoryToSubject("draghi").catch((e) => e);

    expect(error.message).toBe("Groq: 401 - Invalid API Key");
    expect(error.config).toBeUndefined(); // niente configurazione (quindi niente chiave)
    expect(error.message).not.toContain("gsk_test");
  });

  it("segnala il superamento del limite del piano gratuito (429)", async () => {
    postMock.mockRejectedValue(
      axiosError({ status: 429, detail: "Rate limit reached" }),
    );
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow("Groq: 429");
  });

  it("gestisce gli errori senza risposta (timeout, rete)", async () => {
    postMock.mockRejectedValue(
      axiosError({
        code: "ECONNABORTED",
        message: "timeout of 20000ms exceeded",
      }),
    );
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow(
      "Groq: ECONNABORTED - timeout of 20000ms exceeded",
    );
  });

  it("fa propagare gli errori che non vengono da axios", async () => {
    postMock.mockRejectedValue(new TypeError("boom"));
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow("boom");
  });

  it.each([
    ["testo senza JSON", reply("Non posso aiutarti.")],
    ["risposta vuota", { data: {} }],
    ["nessuna scelta", { data: { choices: [] } }],
  ])(
    "lancia un errore se la risposta non contiene JSON (%s)",
    async (_label, response) => {
      postMock.mockResolvedValue(response);
      await expect(ai.categoryToSubject("draghi")).rejects.toThrow(
        "formato JSON",
      );
    },
  );

  it("lancia un errore se il JSON è rotto", async () => {
    postMock.mockResolvedValue(reply('{"subject": "dragons", "safe": '));
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------
describe("categoryToSubject", () => {
  it("restituisce argomento e giudizio di sicurezza", async () => {
    postMock.mockResolvedValue(reply(VALID_SUBJECT));
    await expect(ai.categoryToSubject("draghi")).resolves.toEqual(
      VALID_SUBJECT,
    );
  });

  it("legge il JSON anche se il modello aggiunge testo o backtick", async () => {
    postMock.mockResolvedValue(
      reply(
        'Ecco il risultato:\n```json\n{"subject":"space","safe":true}\n```',
      ),
    );
    await expect(ai.categoryToSubject("spazio")).resolves.toEqual({
      subject: "space",
      safe: true,
    });
  });

  it("restituisce safe:false quando il modello blocca la richiesta", async () => {
    postMock.mockResolvedValue(reply({ subject: "violence", safe: false }));
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
    postMock.mockResolvedValue(reply({ subject, safe: true }));
    await expect(ai.categoryToSubject("x")).resolves.toEqual({
      subject: null,
      safe: false,
    });
  });

  it.each([["true"], [1], [null], [undefined]])(
    "blocca se safe non è un booleano (%j)",
    async (safe) => {
      postMock.mockResolvedValue(reply({ subject: "dragons", safe }));
      await expect(ai.categoryToSubject("x")).resolves.toEqual({
        subject: null,
        safe: false,
      });
    },
  );

  it.each([["science fiction"], ["20th century"], ["a".repeat(60)]])(
    "accetta l'argomento valido «%s»",
    async (subject) => {
      postMock.mockResolvedValue(reply({ subject, safe: true }));
      await expect(ai.categoryToSubject("x")).resolves.toEqual({
        subject,
        safe: true,
      });
    },
  );
});

// ---------------------------------------------------------------
describe("cache di categoryToSubject", () => {
  beforeEach(() => {
    postMock.mockResolvedValue(reply(VALID_SUBJECT));
  });

  it("non richiama Groq per la stessa richiesta (senza badare a maiuscole e spazi)", async () => {
    await ai.categoryToSubject("Draghi");
    await ai.categoryToSubject("  draghi ");
    await ai.categoryToSubject("DRAGHI");
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("richiama Groq per richieste diverse", async () => {
    await ai.categoryToSubject("draghi");
    await ai.categoryToSubject("spazio");
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  it("non memorizza i fallimenti: la richiesta successiva riprova", async () => {
    postMock.mockRejectedValueOnce(
      axiosError({ status: 429, detail: "limite" }),
    );
    await expect(ai.categoryToSubject("draghi")).rejects.toThrow("429");

    await expect(ai.categoryToSubject("draghi")).resolves.toEqual(
      VALID_SUBJECT,
    );
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  it("la voce scade dopo 24 ore", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await ai.categoryToSubject("draghi");

    vi.setSystemTime(Date.now() + 23 * 60 * 60 * 1000);
    await ai.categoryToSubject("draghi");
    expect(postMock).toHaveBeenCalledTimes(1); // ancora valida

    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    await ai.categoryToSubject("draghi");
    expect(postMock).toHaveBeenCalledTimes(2); // scaduta
  });

  it("tiene al massimo 500 voci e toglie la più vecchia", async () => {
    for (let i = 0; i <= 500; i++) await ai.categoryToSubject(`t${i}`); // 501 richieste
    expect(postMock).toHaveBeenCalledTimes(501);

    await ai.categoryToSubject("t500"); // la più recente è ancora in cache
    expect(postMock).toHaveBeenCalledTimes(501);

    await ai.categoryToSubject("t0"); // la più vecchia è stata tolta
    expect(postMock).toHaveBeenCalledTimes(502);
  });
});

// ---------------------------------------------------------------
describe("kidDescription", () => {
  it("restituisce testo e giudizio di idoneità", async () => {
    postMock.mockResolvedValue(reply(VALID_DESCRIPTION));
    await expect(
      ai.kidDescription("/works/OL1W", "Il drago", "A friendly dragon."),
    ).resolves.toEqual(VALID_DESCRIPTION);
  });

  it("manda titolo e descrizione dentro i tag giusti", async () => {
    postMock.mockResolvedValue(reply(VALID_DESCRIPTION));
    await ai.kidDescription("/works/OL1W", "Il drago", "A friendly dragon.");

    expect(lastBody()).toMatchObject({
      model: "llama-3.3-70b-versatile",
      max_completion_tokens: 500,
    });
    expect(lastBody().messages[0].content).toContain("<descrizione>");
    expect(lastBody().messages[1]).toEqual({
      role: "user",
      content:
        "<titolo>Il drago</titolo>\n<descrizione>A friendly dragon.</descrizione>",
    });
  });

  it("taglia le descrizioni a 3000 caratteri", async () => {
    postMock.mockResolvedValue(reply(VALID_DESCRIPTION));
    await ai.kidDescription("/works/OL1W", "Titolo", "x".repeat(5000));

    const content = lastBody().messages[1].content;
    expect(content).toContain("x".repeat(3000));
    expect(content).not.toContain("x".repeat(3001));
  });

  it("restituisce suitable:false quando il libro non è adatto", async () => {
    postMock.mockResolvedValue(
      reply({ text: "Storia per adulti.", suitable: false }),
    );
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
  ])(
    "risposta non valida (%s): niente testo e non adatto",
    async (_label, payload) => {
      postMock.mockResolvedValue(reply(payload));
      await expect(
        ai.kidDescription("/works/OL1W", "Titolo", "Testo."),
      ).resolves.toEqual({ text: null, suitable: false });
    },
  );

  it("accetta un testo di esattamente 800 caratteri", async () => {
    const text = "a".repeat(800);
    postMock.mockResolvedValue(reply({ text, suitable: true }));
    await expect(
      ai.kidDescription("/works/OL1W", "Titolo", "Testo."),
    ).resolves.toEqual({ text, suitable: true });
  });

  it("lancia un errore se la risposta non contiene JSON", async () => {
    postMock.mockResolvedValue(reply("Mi dispiace."));
    await expect(
      ai.kidDescription("/works/OL1W", "Titolo", "Testo."),
    ).rejects.toThrow("formato JSON");
  });

  it("memorizza per chiave dell'opera e non richiama Groq", async () => {
    postMock.mockResolvedValue(reply(VALID_DESCRIPTION));

    await ai.kidDescription("/works/OL1W", "Titolo", "Prima versione");
    await ai.kidDescription("/works/OL1W", "Titolo", "Testo diverso");
    expect(postMock).toHaveBeenCalledTimes(1);

    await ai.kidDescription("/works/OL2W", "Altro", "Altro testo");
    expect(postMock).toHaveBeenCalledTimes(2);
  });
});

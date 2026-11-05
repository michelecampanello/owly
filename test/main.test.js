// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------- DOM di prova (stessi id dell'index.html) ----------
const FIXTURE = `
  <form id="search-form">
    <input id="category-input" type="text" required />
    <button type="submit" id="search-btn">Cerca</button>
  </form>
  <div id="suggestions"></div>
  <div id="status-message"></div>
  <section id="results-container"></section>
  <div id="book-modal" class="modal hidden">
    <div class="modal-content">
      <button type="button" id="close-modal">&times;</button>
      <h2 id="modal-title"></h2>
      <p id="modal-authors"></p>
      <div id="modal-description"></div>
    </div>
  </div>
`;

// ---------- Helper ----------
const $ = (id) => document.getElementById(id);
const cards = () => [...document.querySelectorAll(".book-card")];

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const httpError = (status = 500) => ({
  ok: false,
  status,
  json: async () => ({}),
});

const book = (overrides = {}) => ({
  key: "/works/OL1W",
  title: "Il drago gentile",
  authors: [{ name: "Anna Rossi" }],
  ...overrides,
});

let fetchMock;
let windowListeners;

async function loadApp() {
  // main.js legge il DOM e registra listener al momento dell'import:
  // lo reimportiamo da zero ad ogni test.
  vi.resetModules();
  document.body.innerHTML = FIXTURE;
  await import("../src/main.js");
}

function search(text) {
  $("category-input").value = text;
  $("search-form").dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}

async function showResults(works = [book()]) {
  fetchMock.mockResolvedValueOnce(ok({ works }));
  search("draghi");
  await vi.waitFor(() => expect(cards().length).toBe(works.length));
}

function pressKey(target, key) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

const modalIsOpen = () => !$("book-modal").classList.contains("hidden");

// ---------- Setup / teardown ----------
beforeEach(async () => {
  fetchMock = vi.fn().mockResolvedValue(ok({}));
  vi.stubGlobal("fetch", fetchMock);

  // Teniamo traccia dei listener su window per rimuoverli a fine test,
  // altrimenti si accumulerebbero ad ogni reimport del modulo.
  windowListeners = [];
  const originalAdd = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(
    (type, listener, options) => {
      windowListeners.push([type, listener, options]);
      originalAdd(type, listener, options);
    },
  );

  await loadApp();
});

afterEach(() => {
  windowListeners.forEach(([type, listener, options]) =>
    window.removeEventListener(type, listener, options),
  );
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------- Pulsanti-suggerimento ----------
describe("pulsanti-suggerimento", () => {
  it("crea 8 pulsanti con emoji ed etichetta", () => {
    const buttons = [...document.querySelectorAll(".suggestion-btn")];
    expect(buttons).toHaveLength(8);
    expect(buttons[0].textContent).toBe("🐉 Draghi");
    expect(buttons.every((b) => b.type === "button")).toBe(true);
  });

  it("al click scrive l'etichetta nell'input e cerca la categoria inglese", async () => {
    fetchMock.mockResolvedValueOnce(ok({ works: [book()] }));

    const dragons = [...document.querySelectorAll(".suggestion-btn")].find(
      (b) => b.textContent.includes("Draghi"),
    );
    dragons.click();

    expect($("category-input").value).toBe("Draghi");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openlibrary.org/subjects/dragons.json?limit=12",
    );
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect($("status-message").textContent).toContain("“Draghi”");
  });
});

// ---------- Ricerca e normalizzazione della categoria ----------
describe("ricerca", () => {
  it.each([
    ["animali", "animals"],
    ["Draghi", "dragons"],
    ["  FANTASCIENZA  ", "science_fiction"],
    ["gialli", "mystery_and_detective_stories"],
    ["fantasy", "fantasy"], // già inglese: resta invariata
    ["science fiction", "science_fiction"], // spazi -> underscore
    ["Mystery Stories", "mystery_stories"],
  ])("«%s» viene cercata come «%s»", (input, expected) => {
    search(input);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://openlibrary.org/subjects/${expected}.json?limit=12`,
    );
  });

  it("codifica i caratteri speciali nell'URL", () => {
    search("caffè");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openlibrary.org/subjects/caff%C3%A8.json?limit=12",
    );
  });

  it("non fa nessuna richiesta se il testo è vuoto o fatto di soli spazi", () => {
    search("   ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("annulla l'invio predefinito del form", () => {
    $("category-input").value = "animali";
    const event = new Event("submit", { bubbles: true, cancelable: true });
    $("search-form").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("mostra subito il messaggio di caricamento e svuota i risultati precedenti", async () => {
    await showResults([book(), book({ key: "/works/OL2W", title: "Altro" })]);
    expect(cards()).toHaveLength(2);

    fetchMock.mockReturnValueOnce(new Promise(() => {})); // richiesta mai conclusa
    search("animali");

    expect($("status-message").textContent).toContain("Sto cercando");
    expect(cards()).toHaveLength(0);
  });
});

// ---------- Elenco dei libri ----------
describe("elenco dei libri", () => {
  it("crea una scheda per ogni libro con titolo e autori", async () => {
    await showResults([
      book(),
      book({
        key: "/works/OL2W",
        title: "Pirati dello spazio",
        authors: [{ name: "Luca Bianchi" }, { name: "Maria Verdi" }],
      }),
    ]);

    expect(cards()).toHaveLength(2);
    expect(cards()[0].querySelector(".book-title").textContent).toContain(
      "Il drago gentile",
    );
    expect(cards()[1].querySelector(".book-authors").textContent).toContain(
      "Luca Bianchi, Maria Verdi",
    );
  });

  it("mostra «Autore sconosciuto» se mancano gli autori", async () => {
    await showResults([
      book({ authors: undefined }),
      book({ key: "/works/OL2W", authors: [] }),
    ]);
    cards().forEach((card) =>
      expect(card.querySelector(".book-authors").textContent).toContain(
        "Autore sconosciuto",
      ),
    );
  });

  it("scrive nel messaggio quanti libri ha trovato e su quale argomento", async () => {
    await showResults([book(), book({ key: "/works/OL2W" })]);
    const msg = $("status-message").textContent;
    expect(msg).toContain("Ho trovato 2 libri");
    expect(msg).toContain("“draghi”");
  });

  it("rende le schede raggiungibili da tastiera", async () => {
    await showResults();
    expect(cards()[0].tabIndex).toBe(0);
    expect(cards()[0].getAttribute("role")).toBe("button");
  });

  it("mostra un messaggio gentile se non ci sono libri", async () => {
    fetchMock.mockResolvedValueOnce(ok({ works: [] }));
    search("zzz");
    await vi.waitFor(() =>
      expect($("status-message").textContent).toContain("Non ho trovato"),
    );
    expect(cards()).toHaveLength(0);
  });

  it("gestisce una risposta senza il campo works", async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    search("zzz");
    await vi.waitFor(() =>
      expect($("status-message").textContent).toContain("Non ho trovato"),
    );
  });

  it("mostra un messaggio di errore se la risposta HTTP non è ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(httpError(404));
    search("animali");
    await vi.waitFor(() =>
      expect($("status-message").textContent).toContain("Oops"),
    );
    expect(cards()).toHaveLength(0);
  });

  it("mostra un messaggio di errore se la rete non funziona", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    search("animali");
    await vi.waitFor(() =>
      expect($("status-message").textContent).toContain("Oops"),
    );
  });

  it("non interpreta come HTML i titoli e gli autori (anti-XSS)", async () => {
    await showResults([
      book({
        title: "<img src=x onerror=alert(1)>",
        authors: [{ name: '<script>alert("x")</script>' }],
      }),
    ]);

    const card = cards()[0];
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector("script")).toBeNull();
    expect(card.querySelector(".book-title").textContent).toContain(
      "<img src=x onerror=alert(1)>",
    );
    expect(card.querySelector(".book-authors").textContent).toContain(
      '<script>alert("x")</script>',
    );
  });
});

// ---------- Finestra di dettaglio ----------
describe("dettaglio del libro", () => {
  it("apre la finestra subito con titolo, autori e messaggio di attesa", async () => {
    await showResults();
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    cards()[0].click();

    expect(modalIsOpen()).toBe(true);
    expect($("modal-title").textContent).toBe("Il drago gentile");
    expect($("modal-authors").textContent).toContain("Anna Rossi");
    expect($("modal-description").textContent).toContain("Sto leggendo");
    expect(document.activeElement).toBe($("close-modal"));
  });

  it("richiede il dettaglio all'URL giusto", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(ok({ description: "x" }));

    cards()[0].click();

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://openlibrary.org/works/OL1W.json",
    );
  });

  it("mostra la descrizione quando è una stringa", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(
      ok({ description: "Un drago molto buono." }),
    );

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("Un drago molto buono."),
    );
  });

  it("mostra la descrizione quando è un oggetto {value}", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(
      ok({ description: { type: "/type/text", value: "Trama in oggetto." } }),
    );

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("Trama in oggetto."),
    );
  });

  it("mostra un messaggio se non c'è nessuna descrizione", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(ok({}));

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toContain(
        "non c'è ancora una descrizione",
      ),
    );
  });

  it("mostra un messaggio d'errore se la risposta HTTP non è ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await showResults();
    fetchMock.mockResolvedValueOnce(httpError(500));

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toContain("Oops"),
    );
    expect(modalIsOpen()).toBe(true);
  });

  it("mostra un messaggio d'errore se la rete non funziona", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await showResults();
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toContain("Oops"),
    );
  });

  it("mostra la descrizione come testo semplice, non come HTML", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(
      ok({ description: "<img src=x onerror=alert(1)>" }),
    );

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe(
        "<img src=x onerror=alert(1)>",
      ),
    );
    expect($("modal-description").querySelector("img")).toBeNull();
  });
});

// ---------- Tastiera ----------
describe("uso da tastiera", () => {
  beforeEach(async () => {
    await showResults();
    fetchMock.mockResolvedValue(ok({ description: "ok" }));
  });

  it.each(["Enter", " "])("il tasto «%s» apre il dettaglio", (key) => {
    const event = pressKey(cards()[0], key);
    expect(modalIsOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(true); // evita lo scroll con la barra spaziatrice
  });

  it("gli altri tasti non aprono nulla", () => {
    pressKey(cards()[0], "a");
    pressKey(cards()[0], "Tab");
    expect(modalIsOpen()).toBe(false);
  });
});

// ---------- Chiusura della finestra ----------
describe("chiusura della finestra", () => {
  beforeEach(async () => {
    await showResults();
    fetchMock.mockResolvedValue(ok({ description: "ok" }));
    cards()[0].click();
    expect(modalIsOpen()).toBe(true);
  });

  it("si chiude con il pulsante ×", () => {
    $("close-modal").click();
    expect(modalIsOpen()).toBe(false);
  });

  it("si chiude cliccando sullo sfondo scuro", () => {
    $("book-modal").click();
    expect(modalIsOpen()).toBe(false);
  });

  it("non si chiude cliccando dentro il contenuto", () => {
    document.querySelector(".modal-content").click();
    $("modal-title").click();
    expect(modalIsOpen()).toBe(true);
  });

  it("si chiude con il tasto Esc", () => {
    pressKey(window, "Escape");
    expect(modalIsOpen()).toBe(false);
  });

  it("non si chiude con altri tasti", () => {
    pressKey(window, "Enter");
    expect(modalIsOpen()).toBe(true);
  });

  it("riporta il focus sulla scheda che era stata aperta", () => {
    $("close-modal").click();
    expect(document.activeElement).toBe(cards()[0]);
  });

  it("Esc a finestra già chiusa non sposta il focus", () => {
    $("close-modal").click();
    cards()[0].blur();

    pressKey(window, "Escape");

    expect(document.activeElement).not.toBe(cards()[0]);
  });
});

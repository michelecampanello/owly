// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBooks, fetchDescription } from "../src/js/api.js";
import { initApp } from "../src/js/app.js";
import { getElements } from "../src/js/dom.js";
import { $, FIXTURE, abortable, book, pressKey } from "./helpers.js";

vi.mock("../src/js/api.js", () => ({
  fetchBooks: vi.fn(),
  fetchDescription: vi.fn(),
  isCancel: (error) => error?.name === "CanceledError",
}));

let app;

beforeEach(() => {
  vi.resetAllMocks();
  fetchBooks.mockResolvedValue({});
  fetchDescription.mockResolvedValue({});

  document.body.innerHTML = FIXTURE;
  // L'indirizzo resta da un test all'altro: si riparte sempre da quello vuoto
  window.history.replaceState(null, "", "/");
  app = initApp(getElements());
});

// Riavvia l'app come se la pagina fosse stata aperta con questo indirizzo
function openAt(url) {
  app.destroy();
  document.body.innerHTML = FIXTURE;
  window.history.replaceState(null, "", url);
  app = initApp(getElements());
}

const currentUrl = () => window.location.pathname + window.location.search;

afterEach(() => {
  app.destroy();
  vi.restoreAllMocks();
});

const cards = () => [...document.querySelectorAll(".book-card")];
const status = () => $("status-message").textContent;
const modalIsOpen = () => !$("book-modal").classList.contains("hidden");
const silenceErrors = () =>
  vi.spyOn(console, "error").mockImplementation(() => {});

function search(text) {
  $("category-input").value = text;
  $("search-form").dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}

async function showResults(works = [book()], extra = {}) {
  fetchBooks.mockResolvedValueOnce({ works, ...extra });
  search("draghi");
  await vi.waitFor(() => expect(cards()).toHaveLength(works.length));
}

// ---------------------------------------------------------------
describe("pulsanti-suggerimento", () => {
  it("al click compilano l'input e cercano l'etichetta italiana", async () => {
    fetchBooks.mockResolvedValueOnce({ works: [book()] });

    [...document.querySelectorAll(".suggestion-btn")]
      .find((b) => b.textContent.includes("Draghi"))
      .click();

    expect($("category-input").value).toBe("Draghi");
    expect(fetchBooks).toHaveBeenCalledWith(
      "Draghi",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
  });
});

// ---------------------------------------------------------------
describe("ricerca", () => {
  it("invia al backend il testo com'è (tolti gli spazi ai bordi)", () => {
    search("  Draghi Volanti ");
    expect(fetchBooks.mock.calls[0][0]).toBe("Draghi Volanti");
  });

  it("non fa richieste se il testo è vuoto", () => {
    search("   ");
    expect(fetchBooks).not.toHaveBeenCalled();
  });

  it("annulla l'invio predefinito del form", () => {
    $("category-input").value = "animali";
    const event = new Event("submit", { bubbles: true, cancelable: true });
    $("search-form").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("mostra il caricamento e svuota i risultati precedenti", async () => {
    await showResults([book(), book({ key: "/works/OL2W" })]);

    fetchBooks.mockReturnValueOnce(new Promise(() => {}));
    search("animali");

    expect(status()).toContain("Sto cercando");
    expect(cards()).toHaveLength(0);
  });

  it("durante la ricerca mostra lo spinner nel messaggio e nel pulsante", () => {
    fetchBooks.mockReturnValueOnce(new Promise(() => {}));
    search("animali");

    expect($("status-message").classList.contains("is-loading")).toBe(true);
    expect($("search-btn").classList.contains("is-loading")).toBe(true);
    expect($("search-btn").getAttribute("aria-busy")).toBe("true");
  });

  it.each([
    ["risultati", () => fetchBooks.mockResolvedValueOnce({ works: [book()] })],
    ["nessun risultato", () => fetchBooks.mockResolvedValueOnce({ works: [] })],
    ["argomento bloccato", () => fetchBooks.mockResolvedValueOnce({ blocked: true, works: [] })],
    ["errore", () => { silenceErrors(); fetchBooks.mockRejectedValueOnce(new Error("x")); }],
  ])("toglie lo spinner a fine ricerca (%s)", async (_label, arrange) => {
    arrange();
    search("animali");

    await vi.waitFor(() =>
      expect($("status-message").classList.contains("is-loading")).toBe(false),
    );
    expect($("search-btn").classList.contains("is-loading")).toBe(false);
    expect($("search-btn").getAttribute("aria-busy")).toBe("false");
  });

  it("mostra le schede e quanti libri ha trovato (con l'iniziale maiuscola)", async () => {
    await showResults([book(), book({ key: "/works/OL2W", title: "Altro" })]);
    expect(status()).toContain("Ho trovato 2 libri su “Draghi”");
  });

  it("avvisa se i libri possono essere in un'altra lingua", async () => {
    await showResults([book()], { language: "any" });
    expect(status()).toContain("un'altra lingua");
  });

  it("non avvisa se i libri sono in italiano", async () => {
    await showResults([book()], { language: "it" });
    expect(status()).not.toContain("un'altra lingua");
  });

  it("mostra un messaggio gentile se l'argomento è bloccato", async () => {
    fetchBooks.mockResolvedValueOnce({ blocked: true, works: [] });
    search("qualcosa di brutto");
    await vi.waitFor(() => expect(status()).toContain("Proviamo con un altro argomento"));
    expect(cards()).toHaveLength(0);
  });

  it.each([[{ works: [] }], [{}], [{ works: null }]])(
    "mostra «nessun libro» per la risposta %j",
    async (payload) => {
      fetchBooks.mockResolvedValueOnce(payload);
      search("zzz");
      await vi.waitFor(() => expect(status()).toContain("Non ho trovato"));
    },
  );

  it("mostra un messaggio d'errore se la richiesta fallisce", async () => {
    const errorSpy = silenceErrors();
    fetchBooks.mockRejectedValueOnce(new Error("Request failed with status code 502"));

    search("animali");

    await vi.waitFor(() => expect(status()).toContain("Oops"));
    expect(cards()).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("ignora la risposta di una ricerca vecchia se ne parte una nuova", async () => {
    const errorSpy = silenceErrors();
    fetchBooks.mockImplementationOnce((_text, { signal }) => abortable(signal));
    search("vecchia");

    fetchBooks.mockResolvedValueOnce({ works: [book({ title: "Nuovo" })] });
    search("nuova");

    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(status()).toContain("“Nuova”");
    expect(errorSpy).not.toHaveBeenCalled(); // l'annullamento non è un errore
  });
});

// ---------------------------------------------------------------
describe("dettaglio del libro", () => {
  it("apre subito la finestra con titolo, autori e attesa", async () => {
    await showResults();
    fetchDescription.mockReturnValueOnce(new Promise(() => {}));

    cards()[0].click();

    expect(modalIsOpen()).toBe(true);
    expect($("modal-title").textContent).toBe("Il drago gentile");
    expect($("modal-authors").textContent).toContain("Anna Rossi");
    expect($("modal-description").textContent).toContain("Sto leggendo");
    expect($("modal-description").classList.contains("is-loading")).toBe(true);
    expect(document.activeElement).toBe($("close-modal"));
  });

  it("toglie lo spinner quando arriva la trama", async () => {
    await showResults();
    fetchDescription.mockResolvedValueOnce({ description: "Una bella storia." });

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("Una bella storia."),
    );
    expect($("modal-description").classList.contains("is-loading")).toBe(false);
  });

  it("chiede la descrizione al backend con la chiave del libro", async () => {
    await showResults();
    fetchDescription.mockResolvedValueOnce({ description: "x" });

    cards()[0].click();

    expect(fetchDescription).toHaveBeenCalledWith(
      "/works/OL1W",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("mostra la descrizione ricevuta", async () => {
    await showResults();
    fetchDescription.mockResolvedValueOnce({ description: "Un drago molto buono." });

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("Un drago molto buono."),
    );
  });

  it.each([[{ description: null }], [{}]])(
    "con risposta %j mostra il messaggio «nessuna descrizione»",
    async (payload) => {
      await showResults();
      fetchDescription.mockResolvedValueOnce(payload);

      cards()[0].click();

      await vi.waitFor(() =>
        expect($("modal-description").textContent).toContain(
          "non c'è ancora una descrizione",
        ),
      );
    },
  );

  it("mostra un messaggio d'errore se la richiesta fallisce", async () => {
    silenceErrors();
    await showResults();
    fetchDescription.mockRejectedValueOnce(new Error("Network Error"));

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toContain("Oops"),
    );
    expect(modalIsOpen()).toBe(true);
  });

  it("aprendo un altro libro annulla la richiesta del primo", async () => {
    const errorSpy = silenceErrors();
    await showResults([
      book(),
      book({ key: "/works/OL2W", title: "Secondo libro" }),
    ]);

    let firstSignal;
    fetchDescription.mockImplementationOnce((_key, { signal }) => {
      firstSignal = signal;
      return abortable(signal);
    });
    cards()[0].click();

    fetchDescription.mockResolvedValueOnce({ description: "Trama del secondo." });
    cards()[1].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("Trama del secondo."),
    );
    expect(firstSignal.aborted).toBe(true);
    expect($("modal-title").textContent).toBe("Secondo libro");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("chiudere la finestra annulla la richiesta in corso", async () => {
    const errorSpy = silenceErrors();
    await showResults();

    let signal;
    fetchDescription.mockImplementationOnce((_key, init) => {
      signal = init.signal;
      return abortable(init.signal);
    });
    cards()[0].click();
    expect(signal.aborted).toBe(false);

    $("close-modal").click();

    expect(signal.aborted).toBe(true);
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("Esc chiude la finestra e il focus torna sulla scheda", async () => {
    await showResults();
    fetchDescription.mockResolvedValueOnce({ description: "ok" });
    cards()[0].click();
    expect(modalIsOpen()).toBe(true);

    pressKey(window, "Escape");

    expect(modalIsOpen()).toBe(false);
    expect(document.activeElement).toBe(cards()[0]);
  });
});
// ---------------------------------------------------------------
describe("paginazione", () => {
  const pageButtons = () => [...$("pagination").querySelectorAll("button")];
  const button = (label) => pageButtons().find((b) => b.textContent === label);

  it("con una sola pagina non mostra i pulsanti", async () => {
    await showResults([book()], { page: 1, totalPages: 1 });
    expect(pageButtons()).toHaveLength(0);
    expect($("pagination").hidden).toBe(true);
  });

  it("mostra i pulsanti e la pagina corrente", async () => {
    await showResults([book()], { page: 1, totalPages: 3, total: 30 });

    expect($("pagination").hidden).toBe(false);
    expect(button("1").getAttribute("aria-current")).toBe("page");
    expect(button("◀ Indietro").disabled).toBe(true);
    expect(button("Avanti ▶").disabled).toBe(false);
    expect(status()).toContain("Ho trovato 30 libri");
    expect(status()).toContain("Pagina 1 di 3");
  });

  it("cambiando pagina ripete la stessa ricerca con la nuova pagina", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });

    fetchBooks.mockResolvedValueOnce({
      works: [book({ key: "/works/OL5W", title: "Seconda" })],
      page: 2,
      totalPages: 3,
    });
    button("Avanti ▶").click();

    expect(fetchBooks).toHaveBeenLastCalledWith(
      "draghi",
      expect.objectContaining({ page: 2 }),
    );
    await vi.waitFor(() =>
      expect(cards()[0].textContent).toContain("Seconda"),
    );
    expect(button("2").getAttribute("aria-current")).toBe("page");
  });

  it("una nuova ricerca riparte dalla prima pagina", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });
    button("3").click();
    search("animali");

    expect(fetchBooks).toHaveBeenLastCalledWith(
      "animali",
      expect.objectContaining({ page: 1 }),
    );
  });

  it("durante il caricamento lascia i pulsanti, in attesa sulla pagina scelta", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });
    fetchBooks.mockReturnValueOnce(new Promise(() => {}));
    button("2").click();

    expect(document.querySelectorAll(".skeleton-card").length).toBeGreaterThan(0);
    expect($("pagination").hidden).toBe(false);
    expect($("pagination").getAttribute("aria-busy")).toBe("true");
    expect(button("2").getAttribute("aria-current")).toBe("page");
    expect(pageButtons().every((b) => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("durante il caricamento i click sui pulsanti vengono ignorati", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });
    fetchBooks.mockReturnValueOnce(new Promise(() => {}));
    button("2").click();
    fetchBooks.mockClear();

    button("3").click();
    button("Avanti ▶").click();
    expect(fetchBooks).not.toHaveBeenCalled();
  });

  it("il focus resta sul pulsante usato, anche dopo il caricamento", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });
    fetchBooks.mockResolvedValueOnce({ works: [book()], page: 2, totalPages: 3 });

    button("Avanti ▶").focus();
    button("Avanti ▶").click();
    expect(document.activeElement).toBe(button("Avanti ▶")); // in attesa

    await vi.waitFor(() => expect(button("2").getAttribute("aria-current")).toBe("page"));
    expect(document.activeElement).toBe(button("Avanti ▶")); // pagina arrivata
  });

  it("una nuova ricerca toglie i pulsanti durante il caricamento", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });
    fetchBooks.mockReturnValueOnce(new Promise(() => {}));
    search("animali");

    expect(pageButtons()).toHaveLength(0);
    expect($("pagination").hidden).toBe(true);
  });

  it("se il cambio pagina fallisce toglie i pulsanti", async () => {
    silenceErrors();
    await showResults([book()], { page: 1, totalPages: 3 });
    fetchBooks.mockRejectedValueOnce(new Error("rete"));
    button("2").click();

    await vi.waitFor(() => expect(status()).toContain("Non riesco a cercare"));
    expect(pageButtons()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------
describe("libri scartati dal filtro per bambini", () => {
  it("se la ricerca ha solo libri non adatti lo dice", async () => {
    fetchBooks.mockResolvedValueOnce({ works: [], filtered: 5, totalPages: 1 });
    search("draghi");
    await vi.waitFor(() => expect(status()).toContain("non ho trovato libri adatti"));
  });

  it("senza libri scartati resta il messaggio di nessun risultato", async () => {
    fetchBooks.mockResolvedValueOnce({ works: [], filtered: 0 });
    search("draghi");
    await vi.waitFor(() => expect(status()).toContain("Non ho trovato nessun libro"));
  });

  it("se anche dopo i salti la pagina è vuota, mostra comunque i pulsanti", async () => {
    // Pagine 1-4 tutte vuote su 6: si salta 3 volte e ci si ferma alla 4
    fetchBooks.mockImplementation(async (_text, { page }) => ({
      works: [],
      filtered: 12,
      page,
      totalPages: 6,
    }));
    search("draghi");

    await vi.waitFor(() =>
      expect(status()).toContain("In questa pagina non ci sono libri adatti"),
    );
    expect(fetchBooks).toHaveBeenCalledTimes(4);
    expect(status()).toContain("Pagina 4 di 6");
    expect($("pagination").hidden).toBe(false);
    expect(
      $("pagination").querySelector('[aria-current="page"]').textContent,
    ).toBe("4");
  });
});

// ---------------------------------------------------------------
describe("titoli e trame originali", () => {
  const toggle = () => $("raw-toggle");
  const setRaw = (checked) => {
    toggle().checked = checked;
    toggle().dispatchEvent(new Event("change", { bubbles: true }));
  };

  it("di base avvisa che i testi sono rielaborati dall'AI", () => {
    expect($("ai-notice").textContent).toContain("rielaborati automaticamente");
    expect($("ai-notice").textContent).toContain("imprecisioni");
  });

  it("di base chiede i testi rielaborati", async () => {
    await showResults();
    expect(fetchBooks).toHaveBeenLastCalledWith(
      "draghi",
      expect.objectContaining({ raw: false }),
    );
  });

  it("attivando l'interruttore cambia l'avviso e ripete la ricerca sulla stessa pagina", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });

    // si va a pagina 2...
    fetchBooks.mockResolvedValueOnce({ works: [book()], page: 2, totalPages: 3 });
    [...$("pagination").querySelectorAll("button")]
      .find((btn) => btn.textContent === "2")
      .click();
    await vi.waitFor(() =>
      expect($("pagination").querySelector('[aria-current="page"]').textContent).toBe("2"),
    );
    fetchBooks.mockClear();

    // ...e lì si attiva l'interruttore
    fetchBooks.mockResolvedValueOnce({ works: [book()], page: 2, totalPages: 3 });
    setRaw(true);

    expect($("ai-notice").textContent).toContain("originali di Open Library");
    expect(fetchBooks).toHaveBeenCalledTimes(1);
    expect(fetchBooks).toHaveBeenLastCalledWith(
      "draghi",
      expect.objectContaining({ raw: true, page: 2 }),
    );
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
  });

  it("senza una ricerca fatta, l'interruttore cambia solo l'avviso", () => {
    setRaw(true);
    expect(fetchBooks).not.toHaveBeenCalled();
    expect($("ai-notice").textContent).toContain("originali di Open Library");
  });

  it("con l'interruttore attivo chiede la trama originale", async () => {
    setRaw(true);
    await showResults();
    fetchDescription.mockResolvedValueOnce({ description: "A friendly dragon." });

    cards()[0].click();

    expect(fetchDescription).toHaveBeenCalledWith(
      "/works/OL1W",
      expect.objectContaining({ raw: true }),
    );
    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("A friendly dragon."),
    );
  });
});

// ---------------------------------------------------------------
describe("salto delle pagine vuote", () => {
  // Pagine finte: quelle in "empty" hanno solo libri scartati dal filtro
  function pages({ totalPages, empty }) {
    fetchBooks.mockImplementation(async (_text, { page }) =>
      empty.includes(page)
        ? { works: [], filtered: 12, page, totalPages, total: 100 }
        : { works: [book({ title: `Libro ${page}` })], page, totalPages, total: 100 },
    );
  }
  const requestedPages = () => fetchBooks.mock.calls.map(([, opts]) => opts.page);
  const currentPage = () =>
    $("pagination").querySelector('[aria-current="page"]').textContent;

  it("una pagina vuota passa da sola alla successiva e lo dice", async () => {
    pages({ totalPages: 5, empty: [1] });
    search("draghi");

    await vi.waitFor(() => expect(cards()[0]?.textContent).toContain("Libro 2"));
    expect(requestedPages()).toEqual([1, 2]);
    expect(status()).toContain("Nella pagina 1 non c'erano libri adatti a te: ti mostro la 2.");
    expect(currentPage()).toBe("2");
  });

  it("elenca tutte le pagine saltate", async () => {
    pages({ totalPages: 5, empty: [1, 2, 3] });
    search("draghi");

    await vi.waitFor(() => expect(cards()[0]?.textContent).toContain("Libro 4"));
    expect(status()).toContain("Nelle pagine 1, 2 e 3 non c'erano libri adatti a te: ti mostro la 4.");
  });

  it("tornando indietro salta all'indietro", async () => {
    pages({ totalPages: 5, empty: [3] });
    openAt("/?q=draghi&page=4");
    await vi.waitFor(() => expect(cards()[0]?.textContent).toContain("Libro 4"));
    fetchBooks.mockClear();

    [...$("pagination").querySelectorAll("button")]
      .find((b) => b.textContent.includes("Indietro"))
      .click();

    await vi.waitFor(() => expect(cards()[0]?.textContent).toContain("Libro 2"));
    expect(requestedPages()).toEqual([3, 2]);
  });

  it("si ferma all'ultima pagina", async () => {
    pages({ totalPages: 3, empty: [2, 3] });
    openAt("/?q=draghi&page=2");

    await vi.waitFor(() =>
      expect(status()).toContain("In questa pagina non ci sono libri adatti"),
    );
    expect(requestedPages()).toEqual([2, 3]);
  });

  it("con una sola pagina vuota non salta e dice che non ci sono libri adatti", async () => {
    pages({ totalPages: 1, empty: [1] });
    search("draghi");

    await vi.waitFor(() => expect(status()).toContain("non ho trovato libri adatti"));
    expect(requestedPages()).toEqual([1]);
  });

  it("l'indirizzo indica la pagina davvero mostrata", async () => {
    pages({ totalPages: 5, empty: [1] });
    search("draghi");

    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(currentUrl()).toBe("/?q=draghi&page=2");
  });

  it("una nuova ricerca durante i salti li interrompe", async () => {
    let release;
    fetchBooks
      .mockResolvedValueOnce({ works: [], filtered: 12, page: 1, totalPages: 5 })
      .mockImplementationOnce((_t, { signal }) => {
        release = () => signal.aborted;
        return abortable(signal);
      })
      .mockResolvedValueOnce({ works: [book({ title: "Animale" })], page: 1, totalPages: 1 });

    search("draghi");
    await vi.waitFor(() => expect(fetchBooks).toHaveBeenCalledTimes(2));
    search("animali");

    await vi.waitFor(() => expect(cards()[0]?.textContent).toContain("Animale"));
    expect(release()).toBe(true);
    expect(fetchBooks).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------
describe("ricerca nell'indirizzo", () => {
  it("una ricerca scrive testo e pagina nell'indirizzo", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });
    expect(currentUrl()).toBe("/?q=draghi");

    fetchBooks.mockResolvedValueOnce({ works: [book()], page: 2, totalPages: 3 });
    [...$("pagination").querySelectorAll("button")].find((b) => b.textContent === "2").click();
    expect(currentUrl()).toBe("/?q=draghi&page=2");
  });

  it("ogni ricerca e ogni cambio pagina aggiunge una voce alla cronologia", async () => {
    const start = window.history.length;
    await showResults([book()], { page: 1, totalPages: 3 });

    fetchBooks.mockResolvedValueOnce({ works: [book()], page: 2, totalPages: 3 });
    [...$("pagination").querySelectorAll("button")].find((b) => b.textContent === "2").click();

    expect(window.history.length).toBe(start + 2);
  });

  it("ripetere la stessa ricerca non aggiunge voci", async () => {
    await showResults();
    const length = window.history.length;
    await showResults();
    expect(window.history.length).toBe(length);
  });

  it("aprendo un indirizzo con una ricerca la esegue subito", async () => {
    fetchBooks.mockResolvedValue({ works: [book()], page: 3, totalPages: 5 });
    openAt("/?q=dinosauri&page=3");

    expect($("category-input").value).toBe("dinosauri");
    expect(fetchBooks).toHaveBeenCalledWith(
      "dinosauri",
      expect.objectContaining({ page: 3, raw: false }),
    );
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
  });

  it("raw=1 nell'indirizzo attiva l'interruttore", () => {
    openAt("/?q=draghi&raw=1");
    expect($("raw-toggle").checked).toBe(true);
    expect($("ai-notice").textContent).toContain("originali di Open Library");
    expect(fetchBooks).toHaveBeenCalledWith("draghi", expect.objectContaining({ raw: true }));
  });

  it("l'interruttore aggiorna l'indirizzo senza aggiungere voci", async () => {
    await showResults();
    const length = window.history.length;

    $("raw-toggle").checked = true;
    $("raw-toggle").dispatchEvent(new Event("change"));

    expect(currentUrl()).toBe("/?q=draghi&raw=1");
    expect(window.history.length).toBe(length);
  });

  it("senza ricerca nell'indirizzo non cerca nulla", () => {
    openAt("/?page=3");
    expect(fetchBooks).not.toHaveBeenCalled();
  });

  it("il tasto indietro del browser riapre la ricerca precedente", async () => {
    await showResults([book()], { page: 1, totalPages: 3 });
    fetchBooks.mockResolvedValueOnce({ works: [book()], page: 2, totalPages: 3 });
    [...$("pagination").querySelectorAll("button")].find((b) => b.textContent === "2").click();
    await vi.waitFor(() => expect(currentUrl()).toBe("/?q=draghi&page=2"));
    fetchBooks.mockClear();

    // Simula "indietro": l'indirizzo torna quello di prima e arriva popstate
    fetchBooks.mockResolvedValueOnce({ works: [book()], page: 1, totalPages: 3 });
    window.history.replaceState(null, "", "/?q=draghi");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(fetchBooks).toHaveBeenCalledWith("draghi", expect.objectContaining({ page: 1 }));
    expect(currentUrl()).toBe("/?q=draghi"); // nessuna nuova voce scritta
    await vi.waitFor(() =>
      expect(
        $("pagination").querySelector('[aria-current="page"]').textContent,
      ).toBe("1"),
    );
  });

  it("tornando a un indirizzo senza ricerca svuota la pagina", async () => {
    await showResults();
    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(cards()).toHaveLength(0);
    expect($("category-input").value).toBe("");
    expect(status()).toBe("");
  });

  it("il tasto indietro chiude la finestra del libro", async () => {
    await showResults();
    cards()[0].click();
    expect(modalIsOpen()).toBe(true);

    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(modalIsOpen()).toBe(false);
  });
});

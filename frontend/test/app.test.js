// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "../src/js/app.js";
import { getElements } from "../src/js/dom.js";
import {
  $,
  FIXTURE,
  abortable,
  book,
  httpError,
  ok,
  pressKey,
} from "./helpers.js";

let fetchMock;
let app;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(ok({}));
  vi.stubGlobal("fetch", fetchMock);

  document.body.innerHTML = FIXTURE;
  app = initApp(getElements());
});

afterEach(() => {
  app.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const cards = () => [...document.querySelectorAll(".book-card")];
const status = () => $("status-message").textContent;
const modalIsOpen = () => !$("book-modal").classList.contains("hidden");
const calledUrl = (n = 0) => fetchMock.mock.calls[n][0];
const silenceErrors = () =>
  vi.spyOn(console, "error").mockImplementation(() => {});

function search(text) {
  $("category-input").value = text;
  $("search-form").dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}

async function showResults(works = [book()], extra = {}) {
  fetchMock.mockResolvedValueOnce(ok({ works, ...extra }));
  search("draghi");
  await vi.waitFor(() => expect(cards()).toHaveLength(works.length));
}

// ---------------------------------------------------------------
describe("pulsanti-suggerimento", () => {
  it("al click compilano l'input e cercano l'etichetta italiana", async () => {
    fetchMock.mockResolvedValueOnce(ok({ works: [book()] }));

    [...document.querySelectorAll(".suggestion-btn")]
      .find((b) => b.textContent.includes("Draghi"))
      .click();

    expect($("category-input").value).toBe("Draghi");
    expect(calledUrl()).toBe("/api/books?category=Draghi");
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
  });
});

// ---------------------------------------------------------------
describe("ricerca", () => {
  it("invia al backend il testo com'è (tolti gli spazi ai bordi)", () => {
    search("  Draghi Volanti ");
    expect(calledUrl()).toBe("/api/books?category=Draghi%20Volanti");
  });

  it("non fa richieste se il testo è vuoto", () => {
    search("   ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("annulla l'invio predefinito del form", () => {
    $("category-input").value = "animali";
    const event = new Event("submit", { bubbles: true, cancelable: true });
    $("search-form").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("mostra il caricamento e svuota i risultati precedenti", async () => {
    await showResults([book(), book({ key: "/works/OL2W" })]);

    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    search("animali");

    expect(status()).toContain("Sto cercando");
    expect(cards()).toHaveLength(0);
  });

  it("mostra le schede e quanti libri ha trovato", async () => {
    await showResults([book(), book({ key: "/works/OL2W", title: "Altro" })]);
    expect(status()).toContain("Ho trovato 2 libri su “draghi”");
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
    fetchMock.mockResolvedValueOnce(ok({ blocked: true, works: [] }));
    search("qualcosa di brutto");
    await vi.waitFor(() => expect(status()).toContain("Proviamo con un altro argomento"));
    expect(cards()).toHaveLength(0);
  });

  it.each([[{ works: [] }], [{}]])(
    "mostra «nessun libro» per la risposta %j",
    async (payload) => {
      fetchMock.mockResolvedValueOnce(ok(payload));
      search("zzz");
      await vi.waitFor(() => expect(status()).toContain("Non ho trovato"));
    },
  );

  it("mostra un messaggio d'errore se la risposta HTTP non è ok", async () => {
    silenceErrors();
    fetchMock.mockResolvedValueOnce(httpError(502));
    search("animali");
    await vi.waitFor(() => expect(status()).toContain("Oops"));
    expect(cards()).toHaveLength(0);
  });

  it("mostra un messaggio d'errore se la rete non funziona", async () => {
    silenceErrors();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    search("animali");
    await vi.waitFor(() => expect(status()).toContain("Oops"));
  });

  it("ignora la risposta di una ricerca vecchia se ne parte una nuova", async () => {
    const errorSpy = silenceErrors();
    fetchMock.mockImplementationOnce((_url, { signal }) => abortable(signal));
    search("vecchia");

    fetchMock.mockResolvedValueOnce(ok({ works: [book({ title: "Nuovo" })] }));
    search("nuova");

    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(status()).toContain("“nuova”");
    expect(errorSpy).not.toHaveBeenCalled(); // l'annullamento non è un errore
  });
});

// ---------------------------------------------------------------
describe("dettaglio del libro", () => {
  it("apre subito la finestra con titolo, autori e attesa", async () => {
    await showResults();
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    cards()[0].click();

    expect(modalIsOpen()).toBe(true);
    expect($("modal-title").textContent).toBe("Il drago gentile");
    expect($("modal-authors").textContent).toContain("Anna Rossi");
    expect($("modal-description").textContent).toContain("Sto leggendo");
    expect(document.activeElement).toBe($("close-modal"));
  });

  it("chiede la descrizione al backend con la chiave del libro", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(ok({ description: "x" }));

    cards()[0].click();

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/description?key=%2Fworks%2FOL1W",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("mostra la descrizione ricevuta", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(ok({ description: "Un drago molto buono." }));

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("Un drago molto buono."),
    );
  });

  it.each([[{ description: null }], [{}]])(
    "con risposta %j mostra il messaggio «nessuna descrizione»",
    async (payload) => {
      await showResults();
      fetchMock.mockResolvedValueOnce(ok(payload));

      cards()[0].click();

      await vi.waitFor(() =>
        expect($("modal-description").textContent).toContain(
          "non c'è ancora una descrizione",
        ),
      );
    },
  );

  it("mostra un messaggio d'errore se la risposta HTTP non è ok", async () => {
    silenceErrors();
    await showResults();
    fetchMock.mockResolvedValueOnce(httpError(500));

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toContain("Oops"),
    );
    expect(modalIsOpen()).toBe(true);
  });

  it("mostra un messaggio d'errore se la rete non funziona", async () => {
    silenceErrors();
    await showResults();
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    cards()[0].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toContain("Oops"),
    );
  });

  it("aprendo un altro libro annulla la richiesta del primo", async () => {
    const errorSpy = silenceErrors();
    await showResults([
      book(),
      book({ key: "/works/OL2W", title: "Secondo libro" }),
    ]);

    let firstSignal;
    fetchMock.mockImplementationOnce((_url, { signal }) => {
      firstSignal = signal;
      return abortable(signal);
    });
    cards()[0].click();

    fetchMock.mockResolvedValueOnce(ok({ description: "Trama del secondo." }));
    cards()[1].click();

    await vi.waitFor(() =>
      expect($("modal-description").textContent).toBe("Trama del secondo."),
    );
    expect(firstSignal.aborted).toBe(true);
    expect($("modal-title").textContent).toBe("Secondo libro");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("chiudere la finestra annulla la richiesta in corso", async () => {
    silenceErrors();
    await showResults();

    let signal;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init.signal;
      return abortable(init.signal);
    });
    cards()[0].click();
    expect(signal.aborted).toBe(false);

    $("close-modal").click();

    expect(signal.aborted).toBe(true);
  });

  it("Esc chiude la finestra e il focus torna sulla scheda", async () => {
    await showResults();
    fetchMock.mockResolvedValueOnce(ok({ description: "ok" }));
    cards()[0].click();
    expect(modalIsOpen()).toBe(true);

    pressKey(window, "Escape");

    expect(modalIsOpen()).toBe(false);
    expect(document.activeElement).toBe(cards()[0]);
  });
});

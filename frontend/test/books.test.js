// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatAuthors, renderBooks } from "../src/js/books.js";
import { book, pressKey } from "./helpers.js";

let container;

beforeEach(() => {
  document.body.innerHTML = `<section id="results"></section>`;
  container = document.getElementById("results");
});

const cards = () => [...container.querySelectorAll(".book-card")];

describe("formatAuthors", () => {
  it("unisce più autori con la virgola", () => {
    expect(
      formatAuthors({ authors: [{ name: "Luca Bianchi" }, { name: "Maria Verdi" }] }),
    ).toBe("Luca Bianchi, Maria Verdi");
  });

  it("salta gli autori senza nome", () => {
    expect(
      formatAuthors({ authors: [{ name: "" }, { name: "Anna" }, {}, { name: null }] }),
    ).toBe("Anna");
  });

  it.each([[undefined], [null], [[]], [[{}]], ["testo"]])(
    "senza autori utilizzabili (%j) restituisce «Autore sconosciuto»",
    (authors) => {
      expect(formatAuthors({ authors })).toBe("Autore sconosciuto");
    },
  );
});

describe("renderBooks", () => {
  it("crea una scheda per libro con titolo e autori", () => {
    renderBooks(container, [book(), book({ key: "/works/OL2W", title: "Altro" })], vi.fn());

    expect(cards()).toHaveLength(2);
    expect(cards()[0].querySelector(".book-title").textContent).toBe(
      "📖 Il drago gentile",
    );
    expect(cards()[0].querySelector(".book-authors").textContent).toBe(
      "✍️ Anna Rossi",
    );
  });

  it("sostituisce le schede precedenti invece di aggiungerle", () => {
    renderBooks(container, [book(), book()], vi.fn());
    renderBooks(container, [book()], vi.fn());
    expect(cards()).toHaveLength(1);
  });

  it("mostra «Senza titolo» se manca il titolo", () => {
    renderBooks(container, [book({ title: undefined })], vi.fn());
    expect(cards()[0].querySelector(".book-title").textContent).toContain(
      "Senza titolo",
    );
  });

  it("non accorcia i titoli normali", () => {
    renderBooks(container, [book()], vi.fn());
    const title = cards()[0].querySelector(".book-title");
    expect(title.textContent).not.toContain("...");
    expect(title.title).toBe("Il drago gentile");
  });

  it("accorcia i titoli lunghissimi e tiene il titolo intero nel tooltip", () => {
    const longTitle = "parola ".repeat(40).trim(); // 279 caratteri
    renderBooks(container, [book({ title: longTitle })], vi.fn());

    const title = cards()[0].querySelector(".book-title");
    expect(title.textContent.endsWith("...")).toBe(true);
    expect(title.textContent.length).toBeLessThanOrEqual(3 + 90); // "📖 " + 90
    expect(title.title).toBe(longTitle);
  });

  it("rende le schede raggiungibili da tastiera", () => {
    renderBooks(container, [book()], vi.fn());
    expect(cards()[0].tabIndex).toBe(0);
    expect(cards()[0].getAttribute("role")).toBe("button");
  });

  it("non interpreta come HTML titoli e autori (anti-XSS)", () => {
    renderBooks(
      container,
      [
        book({
          title: "<img src=x onerror=alert(1)>",
          authors: [{ name: '<script>alert("x")</script>' }],
        }),
      ],
      vi.fn(),
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(cards()[0].querySelector(".book-title").textContent).toContain(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("al click chiama onOpen con il libro e la scheda", () => {
    const onOpen = vi.fn();
    const works = [book()];
    renderBooks(container, works, onOpen);

    cards()[0].click();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(works[0], cards()[0]);
  });

  it.each(["Enter", " "])("il tasto «%s» chiama onOpen", (key) => {
    const onOpen = vi.fn();
    renderBooks(container, [book()], onOpen);

    const event = pressKey(cards()[0], key);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true); // niente scroll con la barra spaziatrice
  });

  it("gli altri tasti non chiamano onOpen", () => {
    const onOpen = vi.fn();
    renderBooks(container, [book()], onOpen);

    pressKey(cards()[0], "a");
    pressKey(cards()[0], "Tab");

    expect(onOpen).not.toHaveBeenCalled();
  });
});
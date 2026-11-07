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
      formatAuthors({
        authors: [{ name: "Luca Bianchi" }, { name: "Maria Verdi" }],
      }),
    ).toBe("Luca Bianchi, Maria Verdi");
  });

  it("salta gli autori senza nome", () => {
    expect(
      formatAuthors({
        authors: [{ name: "" }, { name: "Anna" }, {}, { name: null }],
      }),
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
    renderBooks(
      container,
      [book(), book({ key: "/works/OL2W", title: "Altro" })],
      vi.fn(),
    );

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

  it("mostra il titolo originale quando è diverso da quello italiano", () => {
    renderBooks(
      container,
      [book({ title: "Il drago", originalTitle: "The Dragon" })],
      vi.fn(),
    );

    expect(cards()[0].querySelector(".book-title").textContent).toBe(
      "📖 Il drago",
    );
    expect(cards()[0].querySelector(".book-original-title").textContent).toBe(
      "🌍 Titolo originale: The Dragon",
    );
  });

  it.each([
    ["manca", undefined],
    ["è uguale al titolo", "Il drago gentile"],
  ])("non mostra il titolo originale se %s", (_label, originalTitle) => {
    renderBooks(container, [book({ originalTitle })], vi.fn());
    expect(cards()[0].querySelector(".book-original-title")).toBeNull();
  });

  it("mostra il titolo originale tra titolo e autori, come testo semplice", () => {
    renderBooks(
      container,
      [
        book({
          title: "Il drago",
          originalTitle: "<img src=x onerror=alert(1)>",
        }),
      ],
      vi.fn(),
    );

    const order = [...cards()[0].querySelector(".book-info").children].map(
      (el) => el.className,
    );
    expect(order).toEqual([
      "book-title",
      "book-original-title",
      "book-authors",
    ]);
    expect(cards()[0].querySelector("img")).toBeNull();
  });

  describe("copertina", () => {
    const covers = () => [...cards()[0].querySelectorAll(".book-cover")];

    it("mostra l'immagine di Open Library, decorativa e a caricamento ritardato", () => {
      renderBooks(container, [book({ coverId: 12345 })], vi.fn());

      const img = cards()[0].querySelector("img.book-cover");
      expect(img.src).toBe(
        "https://covers.openlibrary.org/b/id/12345-M.jpg?default=false",
      );
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
    });

    it.each([
      ["manca", undefined],
      ["è null", null],
      ["è zero", 0],
      ["è una stringa", "123"],
    ])("senza coverId valido (%s) mostra il segnaposto", (_label, coverId) => {
      renderBooks(container, [book({ coverId })], vi.fn());

      expect(cards()[0].querySelector("img")).toBeNull();
      expect(
        cards()[0].querySelector(".book-cover-placeholder"),
      ).not.toBeNull();
    });

    it("il segnaposto è nascosto ai lettori di schermo", () => {
      renderBooks(container, [book()], vi.fn());
      expect(
        cards()[0]
          .querySelector(".book-cover-placeholder")
          .getAttribute("aria-hidden"),
      ).toBe("true");
    });

    it("se l'immagine non si carica la sostituisce con il segnaposto", () => {
      renderBooks(container, [book({ coverId: 12345 })], vi.fn());

      cards()[0]
        .querySelector("img.book-cover")
        .dispatchEvent(new Event("error"));

      expect(cards()[0].querySelector("img")).toBeNull();
      expect(covers()).toHaveLength(1);
      expect(covers()[0].classList.contains("book-cover-placeholder")).toBe(
        true,
      );
    });

    it("la copertina viene prima delle informazioni nella scheda", () => {
      renderBooks(container, [book({ coverId: 1 })], vi.fn());
      expect([...cards()[0].children].map((el) => el.className)).toEqual([
        "book-cover",
        "book-info",
      ]);
    });
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

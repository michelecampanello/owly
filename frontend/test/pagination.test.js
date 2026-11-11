// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageNumbers, renderPagination } from "../src/js/pagination.js";

describe("pageNumbers", () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 2, 3]],
    [5, 10, [1, null, 4, 5, 6, null, 10]],
    [1, 10, [1, 2, null, 10]],
    [10, 10, [1, null, 9, 10]],
    [4, 10, [1, 2, 3, 4, 5, null, 10]], // un solo numero nascosto: si mostra
  ])("pagina %i di %i -> %j", (page, total, expected) => {
    expect(pageNumbers(page, total)).toEqual(expected);
  });
});

describe("renderPagination", () => {
  let container;
  beforeEach(() => {
    document.body.innerHTML = '<nav id="p"></nav>';
    container = document.getElementById("p");
  });
  const labels = () => [...container.children].map((el) => el.textContent);

  it("svuota e nasconde il contenitore se c'è una sola pagina", () => {
    renderPagination(container, { page: 1, totalPages: 5 }, vi.fn());
    renderPagination(container, { page: 1, totalPages: 1 }, vi.fn());
    expect(container.children).toHaveLength(0);
    expect(container.hidden).toBe(true);
  });

  it("disegna indietro, numeri, puntini e avanti", () => {
    renderPagination(container, { page: 5, totalPages: 10 }, vi.fn());
    expect(labels()).toEqual([
      "◀ Indietro", "1", "…", "4", "5", "6", "…", "10", "Avanti ▶",
    ]);
  });

  it("chiama onGo con il numero della pagina", () => {
    const onGo = vi.fn();
    renderPagination(container, { page: 2, totalPages: 4 }, onGo);

    container.querySelector('[data-page="4"]').click();
    container.querySelector(".page-step:last-child").click();
    expect(onGo.mock.calls).toEqual([[4], [3]]);
  });

  it("non chiama onGo per la pagina corrente o i pulsanti disattivati", () => {
    const onGo = vi.fn();
    renderPagination(container, { page: 1, totalPages: 2 }, onGo);

    container.querySelector('[aria-current="page"]').click();
    container.querySelector(".page-step").click(); // "Indietro" alla prima pagina
    expect(onGo).not.toHaveBeenCalled();
  });

  it("le frecce sono separate dalla parola, che si può nascondere sugli schermi piccoli", () => {
    renderPagination(container, { page: 2, totalPages: 3 }, vi.fn());
    const [prev] = container.querySelectorAll(".page-step");
    expect(prev.querySelector('[aria-hidden="true"]').textContent).toBe("◀");
    expect(prev.querySelector(".page-step-label").textContent.trim()).toBe("Indietro");
  });

  it("compact mostra solo la pagina attuale tra la prima e l'ultima", () => {
    renderPagination(container, { page: 5, totalPages: 10, compact: true }, vi.fn());
    expect(labels()).toEqual(["◀ Indietro", "1", "…", "5", "…", "10", "Avanti ▶"]);
  });

  describe("loading", () => {
    it("segna il contenitore come occupato e i pulsanti come non disponibili", () => {
      renderPagination(container, { page: 2, totalPages: 3, loading: true }, vi.fn());
      expect(container.getAttribute("aria-busy")).toBe("true");
      const buttons = [...container.querySelectorAll("button")];
      expect(buttons.every((b) => b.getAttribute("aria-disabled") === "true")).toBe(true);
    });

    it("ignora i click", () => {
      const onGo = vi.fn();
      renderPagination(container, { page: 2, totalPages: 3, loading: true }, onGo);
      container.querySelector('[data-page="3"]').click();
      expect(onGo).not.toHaveBeenCalled();
    });

    it("finito il caricamento i pulsanti tornano attivi", () => {
      const onGo = vi.fn();
      renderPagination(container, { page: 2, totalPages: 3, loading: true }, onGo);
      renderPagination(container, { page: 2, totalPages: 3 }, onGo);

      expect(container.hasAttribute("aria-busy")).toBe(false);
      expect(container.querySelector("[aria-disabled]")).toBeNull();
      container.querySelector('[data-page="3"]').click();
      expect(onGo).toHaveBeenCalledWith(3);
    });
  });

  describe("focus", () => {
    const focusedLabel = () => document.activeElement.textContent;

    it("ridisegnando, il focus torna sul pulsante equivalente", () => {
      renderPagination(container, { page: 2, totalPages: 5 }, vi.fn());
      container.querySelector('[data-action="next"]').focus();

      renderPagination(container, { page: 3, totalPages: 5 }, vi.fn());
      expect(focusedLabel()).toBe("Avanti ▶");
    });

    it("se il pulsante diventa disattivato, il focus va sulla pagina corrente", () => {
      renderPagination(container, { page: 2, totalPages: 3 }, vi.fn());
      container.querySelector('[data-action="next"]').focus();

      renderPagination(container, { page: 3, totalPages: 3 }, vi.fn());
      expect(focusedLabel()).toBe("3");
    });

    it("se il numero non c'è più, il focus va sulla pagina corrente", () => {
      renderPagination(container, { page: 1, totalPages: 10 }, vi.fn());
      container.querySelector('[data-page="2"]').focus();

      renderPagination(container, { page: 10, totalPages: 10 }, vi.fn());
      expect(focusedLabel()).toBe("10");
    });

    it("non ruba il focus se era altrove", () => {
      document.body.insertAdjacentHTML("beforeend", "<input id='altro' />");
      document.getElementById("altro").focus();

      renderPagination(container, { page: 2, totalPages: 3 }, vi.fn());
      expect(document.activeElement.id).toBe("altro");
    });
  });

  it("un nuovo disegno non accumula listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    renderPagination(container, { page: 1, totalPages: 3 }, first);
    renderPagination(container, { page: 1, totalPages: 3 }, second);

    container.querySelector('[data-page="2"]').click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

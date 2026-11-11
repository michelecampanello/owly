// @vitest-environment jsdom
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBooks, fetchDescription, isCancel } from "../src/js/api.js";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({ get: getMock })),
    isCancel: vi.fn(),
  },
}));

// axios.create viene chiamato una sola volta, quando si importa api.js.
// Salviamo subito la configurazione: Vitest può azzerare la cronologia dei mock prima dei test.
const clientConfig = axios.create.mock.calls[0]?.[0];

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue({ data: {} });
});

describe("configurazione del client", () => {
  it("usa /api come base e un timeout", () => {
    expect(clientConfig).toEqual(
      expect.objectContaining({ baseURL: "/api", timeout: expect.any(Number) }),
    );
  });

  it("espone axios.isCancel", () => {
    expect(isCancel).toBe(axios.isCancel);
  });
});

describe("fetchBooks", () => {
  it("chiama /books con la categoria come parametro", async () => {
    await fetchBooks("draghi");
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0][0]).toBe("/books");
    expect(getMock.mock.calls[0][1].params).toEqual({ category: "draghi", page: 1 });
  });

  it("passa la pagina richiesta", async () => {
    await fetchBooks("draghi", { page: 3 });
    expect(getMock.mock.calls[0][1].params).toEqual({ category: "draghi", page: 3 });
  });

  it("con raw chiede i dati originali, senza raw non manda il parametro", async () => {
    await fetchBooks("draghi", { raw: true });
    expect(getMock.mock.calls[0][1].params).toEqual({
      category: "draghi",
      page: 1,
      raw: 1,
    });

    await fetchBooks("draghi", { raw: false });
    expect(getMock.mock.calls[1][1].params).not.toHaveProperty("raw");
  });

  it("passa il testo così com'è: la codifica la fa axios", async () => {
    await fetchBooks("science fiction & caffè");
    expect(getMock.mock.calls[0][1].params.category).toBe("science fiction & caffè");
  });

  it("restituisce il contenuto della risposta", async () => {
    const payload = { works: [{ key: "/works/OL1W", title: "Titolo" }] };
    getMock.mockResolvedValueOnce({ data: payload });
    await expect(fetchBooks("draghi")).resolves.toEqual(payload);
  });

  it("passa il segnale di annullamento ad axios", async () => {
    const controller = new AbortController();
    await fetchBooks("draghi", { signal: controller.signal });
    expect(getMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("fa propagare gli errori di axios (HTTP, rete, timeout)", async () => {
    getMock.mockRejectedValueOnce(new Error("Request failed with status code 502"));
    await expect(fetchBooks("draghi")).rejects.toThrow("status code 502");
  });

  it.each([
    ["una pagina HTML (proxy mancante)", "<!doctype html><html></html>"],
    ["una risposta vuota", ""],
    ["null", null],
  ])("lancia un errore chiaro se la risposta è %s", async (_label, data) => {
    getMock.mockResolvedValueOnce({ data });
    await expect(fetchBooks("draghi")).rejects.toThrow("controlla il proxy /api");
  });
});

describe("fetchDescription", () => {
  it("chiama /description con la chiave come parametro", async () => {
    await fetchDescription("/works/OL1W");
    expect(getMock.mock.calls[0][0]).toBe("/description");
    expect(getMock.mock.calls[0][1].params).toEqual({ key: "/works/OL1W" });
  });

  it("con raw chiede la trama originale", async () => {
    await fetchDescription("/works/OL1W", { raw: true });
    expect(getMock.mock.calls[0][1].params).toEqual({ key: "/works/OL1W", raw: 1 });
  });

  it("restituisce il contenuto della risposta", async () => {
    getMock.mockResolvedValueOnce({ data: { description: "Una trama." } });
    await expect(fetchDescription("/works/OL1W")).resolves.toEqual({
      description: "Una trama.",
    });
  });

  it("passa il segnale di annullamento ad axios", async () => {
    const controller = new AbortController();
    await fetchDescription("/works/OL1W", { signal: controller.signal });
    expect(getMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("fa propagare gli errori di axios", async () => {
    getMock.mockRejectedValueOnce(new Error("Network Error"));
    await expect(fetchDescription("/works/OL1W")).rejects.toThrow("Network Error");
  });

  it("lancia un errore chiaro se la risposta non è JSON", async () => {
    getMock.mockResolvedValueOnce({ data: "<!doctype html>" });
    await expect(fetchDescription("/works/OL1W")).rejects.toThrow(
      "controlla il proxy /api",
    );
  });
});
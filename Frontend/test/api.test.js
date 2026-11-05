import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBooks, fetchDescription } from "../src/js/api.js";
import { httpError, ok } from "./helpers.js";

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(ok({}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const calledUrl = () => fetchMock.mock.calls[0][0];

describe("fetchBooks", () => {
  it("chiama /api/books con la categoria", async () => {
    await fetchBooks("draghi");
    expect(calledUrl()).toBe("/api/books?category=draghi");
  });

  it.each([
    ["science fiction", "science%20fiction"],
    ["caffè", "caff%C3%A8"],
    ["a&b=c", "a%26b%3Dc"],
  ])("codifica «%s» nell'URL", async (input, encoded) => {
    await fetchBooks(input);
    expect(calledUrl()).toBe(`/api/books?category=${encoded}`);
  });

  it("restituisce il JSON della risposta", async () => {
    const payload = { works: [{ key: "/works/OL1W", title: "Titolo" }] };
    fetchMock.mockResolvedValueOnce(ok(payload));
    await expect(fetchBooks("draghi")).resolves.toEqual(payload);
  });

  it("passa il segnale di annullamento a fetch", async () => {
    const controller = new AbortController();
    await fetchBooks("draghi", { signal: controller.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("lancia un errore se la risposta HTTP non è ok", async () => {
    fetchMock.mockResolvedValueOnce(httpError(502));
    await expect(fetchBooks("draghi")).rejects.toThrow("Errore HTTP: 502");
  });

  it("fa propagare gli errori di rete", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchBooks("draghi")).rejects.toThrow("offline");
  });
});

describe("fetchDescription", () => {
  it("chiama /api/description con la chiave codificata", async () => {
    await fetchDescription("/works/OL1W");
    expect(calledUrl()).toBe("/api/description?key=%2Fworks%2FOL1W");
  });

  it("restituisce il JSON della risposta", async () => {
    fetchMock.mockResolvedValueOnce(ok({ description: "Una trama." }));
    await expect(fetchDescription("/works/OL1W")).resolves.toEqual({
      description: "Una trama.",
    });
  });

  it("passa il segnale di annullamento a fetch", async () => {
    const controller = new AbortController();
    await fetchDescription("/works/OL1W", { signal: controller.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("lancia un errore se la risposta HTTP non è ok", async () => {
    fetchMock.mockResolvedValueOnce(httpError(400));
    await expect(fetchDescription("/works/OL1W")).rejects.toThrow(
      "Errore HTTP: 400",
    );
  });
});

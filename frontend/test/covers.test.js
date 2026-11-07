import { describe, expect, it } from "vitest";
import { coverUrl } from "../src/js/covers.js";

describe("coverUrl", () => {
  it("costruisce l'URL di Open Library con dimensione media di default", () => {
    expect(coverUrl(240727)).toBe(
      "https://covers.openlibrary.org/b/id/240727-M.jpg?default=false",
    );
  });

  it.each(["S", "M", "L"])("accetta la dimensione %s", (size) => {
    expect(coverUrl(1, size)).toBe(
      `https://covers.openlibrary.org/b/id/1-${size}.jpg?default=false`,
    );
  });

  it("chiede il 404 per le copertine mancanti (default=false)", () => {
    expect(coverUrl(1)).toContain("default=false");
  });

  it.each([
    [0],
    [-5],
    [1.5],
    ["123"],
    ["1/../../x"],
    [null],
    [undefined],
    [NaN],
    [Infinity],
    [{ id: 1 }],
  ])("restituisce null per l'identificativo non valido %j", (id) => {
    expect(coverUrl(id)).toBeNull();
  });

  it.each([["XL"], ["m"], [""], [null]])(
    "restituisce null per la dimensione non valida %j",
    (size) => {
      expect(coverUrl(1, size)).toBeNull();
    },
  );
});
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getElements } from "../src/js/dom.js";
import { FIXTURE } from "./helpers.js";

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
});

describe("getElements", () => {
  it("restituisce tutti gli elementi dell'app", () => {
    const els = getElements();
    expect(Object.keys(els).sort()).toEqual(
      [
        "categoryInput",
        "closeModalBtn",
        "modal",
        "modalAuthors",
        "modalDescription",
        "modalTitle",
        "resultsContainer",
        "searchForm",
        "statusMessage",
        "suggestionsContainer",
      ].sort(),
    );
    expect(els.searchForm.id).toBe("search-form");
    expect(els.closeModalBtn.id).toBe("close-modal");
  });

  it("dice quale id manca nell'HTML", () => {
    document.getElementById("search-form").remove();
    expect(() => getElements()).toThrow("#search-form");
  });
});

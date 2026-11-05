// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUGGESTIONS, renderSuggestions } from "../src/js/suggestions.js";

let container;

beforeEach(() => {
  document.body.innerHTML = `<div id="suggestions"></div>`;
  container = document.getElementById("suggestions");
});

const buttons = () => [...container.querySelectorAll(".suggestion-btn")];

describe("renderSuggestions", () => {
  it("crea un pulsante per ogni suggerimento, con emoji ed etichetta", () => {
    renderSuggestions(container, vi.fn());
    expect(buttons()).toHaveLength(SUGGESTIONS.length);
    expect(buttons()[0].textContent).toBe("🐉 Draghi");
  });

  it("usa pulsanti di tipo button (non inviano il form)", () => {
    renderSuggestions(container, vi.fn());
    expect(buttons().every((b) => b.type === "button")).toBe(true);
  });

  it("al click chiama onPick con la sola etichetta italiana", () => {
    const onPick = vi.fn();
    renderSuggestions(container, onPick);

    buttons()[2].click();

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("Animali");
  });

  it("richiamata più volte non duplica i pulsanti", () => {
    renderSuggestions(container, vi.fn());
    renderSuggestions(container, vi.fn());
    expect(buttons()).toHaveLength(SUGGESTIONS.length);
  });
});

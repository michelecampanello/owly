// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModal } from "../src/js/modal.js";
import { $, FIXTURE, pressKey } from "./helpers.js";

let modal;
let onClose;
let opener;

beforeEach(() => {
  document.body.innerHTML = FIXTURE + `<button id="opener">apri</button>`;
  opener = $("opener");
  onClose = vi.fn();
  modal = createModal({
    root: $("book-modal"),
    titleEl: $("modal-title"),
    authorsEl: $("modal-authors"),
    descriptionEl: $("modal-description"),
    closeButton: $("close-modal"),
    onClose,
  });
});

afterEach(() => {
  modal.destroy(); // toglie il listener su window
});

const openIt = () =>
  modal.open({ title: "Il drago gentile", authors: "Anna Rossi", opener });

describe("creazione", () => {
  it("parte chiusa", () => {
    expect(modal.isOpen()).toBe(false);
  });

  it("segna il contenuto come finestra di dialogo per i lettori di schermo", () => {
    const content = document.querySelector(".modal-content");
    expect(content.getAttribute("role")).toBe("dialog");
    expect(content.getAttribute("aria-modal")).toBe("true");
    expect(content.getAttribute("aria-labelledby")).toBe("modal-title");
  });
});

describe("apertura", () => {
  it("mostra la finestra con titolo e autori", () => {
    openIt();
    expect(modal.isOpen()).toBe(true);
    expect($("modal-title").textContent).toBe("Il drago gentile");
    expect($("modal-authors").textContent).toBe("✍️ Anna Rossi");
  });

  it("sposta il focus sul pulsante di chiusura", () => {
    openIt();
    expect(document.activeElement).toBe($("close-modal"));
  });

  it("setDescription scrive il testo come testo semplice", () => {
    openIt();
    modal.setDescription("<img src=x onerror=alert(1)>");
    expect($("modal-description").textContent).toBe("<img src=x onerror=alert(1)>");
    expect($("modal-description").querySelector("img")).toBeNull();
  });
});

describe("chiusura", () => {
  beforeEach(openIt);

  it("si chiude con il pulsante ×", () => {
    $("close-modal").click();
    expect(modal.isOpen()).toBe(false);
  });

  it("si chiude cliccando sullo sfondo", () => {
    $("book-modal").click();
    expect(modal.isOpen()).toBe(false);
  });

  it("non si chiude cliccando dentro il contenuto", () => {
    document.querySelector(".modal-content").click();
    $("modal-title").click();
    expect(modal.isOpen()).toBe(true);
  });

  it("si chiude con Esc ma non con altri tasti", () => {
    pressKey(window, "Enter");
    expect(modal.isOpen()).toBe(true);

    pressKey(window, "Escape");
    expect(modal.isOpen()).toBe(false);
  });

  it("restituisce il focus all'elemento che l'aveva aperta", () => {
    modal.close();
    expect(document.activeElement).toBe(opener);
  });

  it("chiama onClose una sola volta", () => {
    modal.close();
    modal.close(); // già chiusa: non deve fare nulla
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc a finestra già chiusa non sposta il focus", () => {
    modal.close();
    opener.blur();

    pressKey(window, "Escape");

    expect(document.activeElement).not.toBe(opener);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("destroy", () => {
  it("rimuove tutti i listener", () => {
    openIt();
    modal.destroy();

    $("close-modal").click();
    $("book-modal").click();
    pressKey(window, "Escape");

    expect(modal.isOpen()).toBe(true);
  });
});

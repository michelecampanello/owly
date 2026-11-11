import { describe, expect, it } from "vitest";
import { MAX_PAGES, readUrl, urlFor } from "../src/js/url.js";

describe("readUrl", () => {
  it("legge testo, pagina e modalità", () => {
    expect(readUrl("?q=draghi&page=3&raw=1")).toEqual({ text: "draghi", page: 3, raw: true });
  });

  it("senza parametri usa i valori predefiniti", () => {
    expect(readUrl("")).toEqual({ text: "", page: 1, raw: false });
  });

  it("decodifica spazi e caratteri speciali", () => {
    expect(readUrl("?q=science+fiction+%26+caff%C3%A8").text).toBe("science fiction & caffè");
  });

  it("toglie gli spazi ai bordi e taglia i testi lunghi", () => {
    expect(readUrl("?q=%20%20draghi%20").text).toBe("draghi");
    expect(readUrl(`?q=${"x".repeat(100)}`).text).toHaveLength(60);
  });

  it.each(["0", "-1", "2.5", "abc", String(MAX_PAGES + 1)])(
    "una pagina non valida (%s) diventa 1",
    (page) => {
      expect(readUrl(`?q=x&page=${page}`).page).toBe(1);
    },
  );

  it("raw vale solo con 1", () => {
    expect(readUrl("?q=x&raw=true").raw).toBe(false);
    expect(readUrl("?q=x&raw=0").raw).toBe(false);
  });
});

describe("urlFor", () => {
  it("scrive solo il testo per la prima pagina in modalità normale", () => {
    expect(urlFor("/", { text: "draghi", page: 1, raw: false })).toBe("/?q=draghi");
  });

  it("aggiunge pagina e modalità quando servono", () => {
    expect(urlFor("/", { text: "draghi", page: 2, raw: true })).toBe("/?q=draghi&page=2&raw=1");
  });

  it("codifica il testo e conserva il percorso", () => {
    expect(urlFor("/owly/", { text: "draghi & fate" })).toBe("/owly/?q=draghi+%26+fate");
  });

  it("readUrl rilegge quello che scrive urlFor", () => {
    const state = { text: "pirati e tesori", page: 4, raw: true };
    expect(readUrl(urlFor("/", state).slice(1))).toEqual(state);
  });
});

import { isEmpty, upperFirst } from "lodash-es";
import { fetchBooks, fetchDescription, isCancel } from "./api.js";
import { MESSAGES } from "./messages.js";
import { renderSuggestions } from "./suggestions.js";
import { renderBooks, renderSkeletons, formatAuthors } from "./books.js";
import { renderPagination } from "./pagination.js";
import { createModal } from "./modal.js";
import { readUrl, urlFor } from "./url.js";

// Pagine vuote (tutti i libri scartati dal filtro) saltate di fila, al massimo.
// Ogni salto è una richiesta in più (e una revisione dell'AI).
const MAX_SKIPS = 3;

export function initApp(els) {
  let searchController = null;
  let detailController = null;
  let lastQuery = null; // ultima ricerca { text, page }, per cambiare pagina con lo stesso testo

  // Interruttore "titoli e trame originali": letto a ogni richiesta
  const isRaw = () => els.rawToggle.checked;
  const initial = readUrl(window.location.search);
  els.rawToggle.checked = initial.raw;
  const updateNotice = () => {
    els.aiNotice.textContent = isRaw() ? MESSAGES.rawNotice : MESSAGES.aiNotice;
  };
  updateNotice();

  const modal = createModal({
    root: els.modal,
    titleEl: els.modalTitle,
    authorsEl: els.modalAuthors,
    descriptionEl: els.modalDescription,
    closeButton: els.closeModalBtn,
    onClose: () => detailController?.abort(),
  });

  // loading: true mostra lo spinner nel messaggio e nel pulsante "Cerca"
  const setStatus = (text, { loading = false } = {}) => {
    els.statusMessage.textContent = text;
    els.statusMessage.classList.toggle("is-loading", loading);
    els.searchButton.classList.toggle("is-loading", loading);
    els.searchButton.setAttribute("aria-busy", String(loading));
  };

  // ----- Paginazione -----
  // Sugli schermi stretti si mostrano meno numeri, così i pulsanti stanno su una riga
  // (stessa soglia di .pagination nel CSS)
  const narrowScreen = window.matchMedia?.("(max-width: 760px)");
  let pager = { page: 1, totalPages: 0, loading: false }; // ultimo stato disegnato

  const drawPagination = (state) => {
    pager = state;
    renderPagination(
      els.pagination,
      { ...state, compact: Boolean(narrowScreen?.matches) },
      goToPage,
    );
  };
  const clearPagination = () => drawPagination({ page: 1, totalPages: 0, loading: false });

  // Ruotando il telefono (o allargando la finestra) i numeri si ridisegnano
  const onScreenChange = () => drawPagination(pager);
  narrowScreen?.addEventListener?.("change", onScreenChange);

  // ----- Ricerca -----
  async function search(
    text,
    { page = 1, keepPager = false, direction = 1, history: historyMode = "push" } = {},
  ) {
    searchController?.abort();
    searchController = new AbortController();
    const { signal } = searchController;
    lastQuery = { text, page };
    const raw = isRaw();
    writeUrl(historyMode, { text, page, raw });

    renderSkeletons(els.resultsContainer);
    els.resultsContainer.setAttribute("aria-busy", "true");
    // Cambiando pagina i pulsanti restano (in attesa, sulla pagina scelta): niente salti
    // e il focus non si perde. Una ricerca nuova invece li toglie.
    if (keepPager && pager.totalPages > 1) {
      drawPagination({ page, totalPages: pager.totalPages, loading: true });
    } else {
      clearPagination();
    }
    setStatus(MESSAGES.searching, { loading: true });

    try {
      let current = page;
      let data = await fetchBooks(text, { page: current, raw, signal });

      // Pagina vuota perché il filtro ha scartato tutto: si prova la pagina dopo
      // (o quella prima, se si stava tornando indietro), al massimo MAX_SKIPS volte
      const skipped = [];
      while (!data.blocked && isEmpty(data.works) && skipped.length < MAX_SKIPS) {
        const totalPages = data.totalPages ?? 1;
        const next = current + direction;
        if (next < 1 || next > totalPages) break;

        skipped.push(current);
        current = next;
        drawPagination({ page: current, totalPages, loading: true });
        setStatus(MESSAGES.searchingPage(current), { loading: true });
        data = await fetchBooks(text, { page: current, raw, signal });
      }

      // L'indirizzo indica la pagina davvero mostrata
      if (current !== page) {
        lastQuery.page = current;
        writeUrl("replace", { text, page: current, raw });
      }

      if (data.blocked) {
        els.resultsContainer.replaceChildren();
        clearPagination();
        setStatus(MESSAGES.blocked);
        return;
      }
      showBooks({ page: current, ...data }, text, skipped);
    } catch (error) {
      if (isCancel(error)) return;
      console.error("Errore durante il recupero dei libri:", error);
      els.resultsContainer.replaceChildren();
      clearPagination();
      setStatus(MESSAGES.searchError);
    } finally {
      if (!signal.aborted) els.resultsContainer.removeAttribute("aria-busy");
    }
  }

  function goToPage(page) {
    if (!lastQuery) return;
    search(lastQuery.text, {
      page,
      keepPager: true,
      direction: page < lastQuery.page ? -1 : 1,
    });
    // Riporta in vista l'inizio dei risultati (il messaggio di stato è appena sopra)
    els.statusMessage.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function showBooks(
    { works, language, page = 1, totalPages = 1, total, filtered = 0 },
    topic,
    skipped = [],
  ) {
    if (isEmpty(works)) {
      els.resultsContainer.replaceChildren();
      if (totalPages > 1) {
        // Anche dopo i salti la pagina è vuota, ma ci sono altre pagine da provare a mano
        setStatus(MESSAGES.noKidBooksOnPage(page, totalPages));
        drawPagination({ page, totalPages, loading: false });
      } else {
        clearPagination();
        setStatus(filtered > 0 || skipped.length > 0 ? MESSAGES.noKidBooks : MESSAGES.noResults);
      }
      return;
    }

    const count = total ?? works.length;
    const skippedInfo = skipped.length > 0 ? `${MESSAGES.skippedPages(skipped, page)} ` : "";
    const pageInfo = totalPages > 1 ? ` ${MESSAGES.pageOf(page, totalPages)}` : "";
    const mixed = language === "any" ? ` ${MESSAGES.mixedLanguage}` : "";
    setStatus(skippedInfo + MESSAGES.found(count, upperFirst(topic)) + pageInfo + mixed);
    renderBooks(els.resultsContainer, works, openBook);
    drawPagination({ page, totalPages, loading: false });
  }

  // Torna allo stato iniziale (indirizzo senza ricerca, per esempio col tasto "indietro")
  function resetSearch() {
    searchController?.abort();
    lastQuery = null;
    els.categoryInput.value = "";
    els.resultsContainer.replaceChildren();
    els.resultsContainer.removeAttribute("aria-busy");
    clearPagination();
    setStatus("");
  }

  // ----- Dettaglio -----
  async function openBook(book, card) {
    detailController?.abort();
    detailController = new AbortController();
    const { signal } = detailController;

    modal.open({
      title: book.title ?? MESSAGES.untitledBook,
      authors: formatAuthors(book),
      opener: card,
    });
    modal.setDescription(MESSAGES.loadingDescription, { loading: true });

    try {
      const data = await fetchDescription(book.key, { raw: isRaw(), signal });
      modal.setDescription(data.description ?? MESSAGES.noDescription);
    } catch (error) {
      if (isCancel(error)) return;
      console.error("Errore durante il recupero del dettaglio:", error);
      modal.setDescription(MESSAGES.descriptionError);
    }
  }

  // ----- Indirizzo della pagina -----
  // La ricerca è nell'indirizzo (?q=draghi&page=2&raw=1): il tasto "indietro" del browser
  // funziona e un link condiviso riapre gli stessi risultati.
  // mode: "push" aggiunge una voce alla cronologia, "replace" aggiorna quella attuale, "none" niente.
  function writeUrl(mode, state) {
    if (mode === "none") return;
    const url = urlFor(window.location.pathname, state);
    const same = url === window.location.pathname + window.location.search;
    // La stessa ricerca ripetuta non crea una voce doppia
    const method = mode === "push" && !same ? "pushState" : "replaceState";
    window.history[method](null, "", url);
  }

  // Applica lo stato dell'indirizzo: all'avvio e con i tasti avanti/indietro del browser
  function applyUrl(history) {
    const { text, page, raw } = readUrl(window.location.search);
    els.rawToggle.checked = raw;
    updateNotice();
    modal.close();
    if (!text) return resetSearch();
    els.categoryInput.value = text;
    search(text, { page, history });
  }
  const onPopState = () => applyUrl("none");
  window.addEventListener("popstate", onPopState);

  // ----- Collegamenti agli eventi -----
  els.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.categoryInput.value.trim();
    if (text) search(text);
  });

  // Cambiando modalità si ripete la ricerca in corso (stessa pagina) con i nuovi testi.
  // È lo stesso risultato visto in un altro modo: aggiorna l'indirizzo senza una nuova voce.
  const onRawChange = () => {
    updateNotice();
    if (lastQuery) {
      search(lastQuery.text, { page: lastQuery.page, keepPager: true, history: "replace" });
    }
  };
  els.rawToggle.addEventListener("change", onRawChange);

  renderSuggestions(els.suggestionsContainer, (label) => {
    els.categoryInput.value = label;
    search(label);
  });

  // Un indirizzo con una ricerca (link condiviso, pagina ricaricata) la riapre subito
  if (initial.text) applyUrl("replace");

  return {
    destroy() {
      searchController?.abort();
      detailController?.abort();
      els.rawToggle.removeEventListener("change", onRawChange);
      narrowScreen?.removeEventListener?.("change", onScreenChange);
      window.removeEventListener("popstate", onPopState);
      modal.destroy();
    },
  };
}

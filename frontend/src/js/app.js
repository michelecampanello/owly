import { isEmpty, upperFirst } from "lodash-es";
import { fetchBooks, fetchDescription, isCancel } from "./api.js";
import { MESSAGES } from "./messages.js";
import { renderSuggestions } from "./suggestions.js";
import { renderBooks, renderSkeletons, formatAuthors } from "./books.js";
import { renderPagination } from "./pagination.js";
import { createModal } from "./modal.js";

export function initApp(els) {
  let searchController = null;
  let detailController = null;
  let lastQuery = null; // ultima ricerca, per cambiare pagina con lo stesso testo

  const modal = createModal({
    root: els.modal,
    titleEl: els.modalTitle,
    authorsEl: els.modalAuthors,
    descriptionEl: els.modalDescription,
    closeButton: els.closeModalBtn,
    onClose: () => detailController?.abort(),
  });

  const setStatus = (text) => {
    els.statusMessage.textContent = text;
  };

  const clearPagination = () =>
    renderPagination(els.pagination, { page: 1, totalPages: 0 });

  // ----- Ricerca -----
  async function search(text, displayName = text, page = 1) {
    searchController?.abort();
    searchController = new AbortController();
    const { signal } = searchController;
    lastQuery = { text, displayName };

    renderSkeletons(els.resultsContainer);
    els.resultsContainer.setAttribute("aria-busy", "true");
    clearPagination();
    setStatus(MESSAGES.searching);

    try {
      const data = await fetchBooks(text, { page, signal });

      if (data.blocked) {
        els.resultsContainer.replaceChildren();
        setStatus(MESSAGES.blocked);
        return;
      }
      showBooks(data, displayName);
    } catch (error) {
      if (isCancel(error)) return;
      console.error("Errore durante il recupero dei libri:", error);
      els.resultsContainer.replaceChildren();
      setStatus(MESSAGES.searchError);
    } finally {
      if (!signal.aborted) els.resultsContainer.removeAttribute("aria-busy");
    }
  }

  function goToPage(page) {
    if (!lastQuery) return;
    search(lastQuery.text, lastQuery.displayName, page);
    // Riporta in vista l'inizio dei risultati (il messaggio di stato è appena sopra)
    els.statusMessage.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function showBooks({ works, language, page = 1, totalPages = 1, total }, displayName) {
    if (isEmpty(works)) {
      els.resultsContainer.replaceChildren();
      setStatus(MESSAGES.noResults);
      return;
    }

    const count = total ?? works.length;
    const pageInfo = totalPages > 1 ? ` ${MESSAGES.pageOf(page, totalPages)}` : "";
    const mixed = language === "any" ? ` ${MESSAGES.mixedLanguage}` : "";
    setStatus(MESSAGES.found(count, upperFirst(displayName)) + pageInfo + mixed);
    renderBooks(els.resultsContainer, works, openBook);
    renderPagination(els.pagination, { page, totalPages }, goToPage);
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
    modal.setDescription(MESSAGES.loadingDescription);

    try {
      const data = await fetchDescription(book.key, { signal });
      modal.setDescription(data.description ?? MESSAGES.noDescription);
    } catch (error) {
      if (isCancel(error)) return;
      console.error("Errore durante il recupero del dettaglio:", error);
      modal.setDescription(MESSAGES.descriptionError);
    }
  }

  // ----- Collegamenti agli eventi -----
  els.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.categoryInput.value.trim();
    if (text) search(text);
  });

  renderSuggestions(els.suggestionsContainer, (label) => {
    els.categoryInput.value = label;
    search(label);
  });

  return {
    destroy() {
      searchController?.abort();
      detailController?.abort();
      modal.destroy();
    },
  };
}

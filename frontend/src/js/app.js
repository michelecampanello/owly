import { isEmpty, upperFirst } from "lodash-es";
import { fetchBooks, fetchDescription, isCancel } from "./api.js";
import { MESSAGES } from "./messages.js";
import { renderSuggestions } from "./suggestions.js";
import { renderBooks, formatAuthors } from "./books.js";
import { createModal } from "./modal.js";

export function initApp(els) {
  let searchController = null;
  let detailController = null;

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

  // ----- Ricerca -----
  async function search(text, displayName = text) {
    searchController?.abort();
    searchController = new AbortController();
    const { signal } = searchController;

    els.resultsContainer.replaceChildren();
    setStatus(MESSAGES.searching);

    try {
      const data = await fetchBooks(text, { signal });

      if (data.blocked) {
        setStatus(MESSAGES.blocked);
        return;
      }
      showBooks(data, displayName);
    } catch (error) {
      if (isCancel(error)) return;
      console.error("Errore durante il recupero dei libri:", error);
      setStatus(MESSAGES.searchError);
    }
  }

  function showBooks({ works, language }, displayName) {
    if (isEmpty(works)) {
      setStatus(MESSAGES.noResults);
      return;
    }

    const mixed = language === "any" ? ` ${MESSAGES.mixedLanguage}` : "";
    setStatus(MESSAGES.found(works.length, upperFirst(displayName)) + mixed);
    renderBooks(els.resultsContainer, works, openBook);
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

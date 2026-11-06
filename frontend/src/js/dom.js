// Recupera tutti gli elementi dell'HTML in un posto solo.
// Se manca un id, l'errore dice subito quale.
export function getElements(root = document) {
  const byId = (id) => {
    const el = root.getElementById(id);
    if (!el) throw new Error(`Elemento #${id} non trovato nell'HTML`);
    return el;
  };

  return {
    searchForm: byId("search-form"),
    categoryInput: byId("category-input"),
    resultsContainer: byId("results-container"),
    statusMessage: byId("status-message"),
    suggestionsContainer: byId("suggestions"),
    modal: byId("book-modal"),
    modalTitle: byId("modal-title"),
    modalAuthors: byId("modal-authors"),
    modalDescription: byId("modal-description"),
    closeModalBtn: byId("close-modal"),
  };
}

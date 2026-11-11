// Utility condivise dai test (questo file non contiene test).

// Stesso HTML (stessi id) dell'index.html
export const FIXTURE = `
  <form id="search-form">
    <input id="category-input" type="text" required />
    <button type="submit" id="search-btn">Cerca</button>
  </form>
  <div id="suggestions"></div>
  <input type="checkbox" id="raw-toggle" />
  <p id="ai-notice"></p>
  <div id="status-message"></div>
  <section id="results-container"></section>
  <nav id="pagination" hidden></nav>
  <div id="book-modal" class="modal hidden">
    <div class="modal-content">
      <button type="button" id="close-modal">&times;</button>
      <h2 id="modal-title"></h2>
      <p id="modal-authors"></p>
      <div id="modal-description"></div>
    </div>
  </div>
`;

export const $ = (id) => document.getElementById(id);

// Errore come quello che axios lancia quando una richiesta viene annullata
export const canceledError = () =>
  Object.assign(new Error("canceled"), {
    name: "CanceledError",
    code: "ERR_CANCELED",
  });

// Una richiesta che resta in attesa e fallisce come "annullata" quando parte l'abort
export function abortable(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(canceledError()));
  });
}

export const book = (overrides = {}) => ({
  key: "/works/OL1W",
  title: "Il drago gentile",
  authors: [{ name: "Anna Rossi" }],
  ...overrides,
});

export function pressKey(target, key) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

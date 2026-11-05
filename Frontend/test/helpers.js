// Utility condivise dai test (questo file non contiene test).

// Stesso HTML (stessi id) dell'index.html
export const FIXTURE = `
  <form id="search-form">
    <input id="category-input" type="text" required />
    <button type="submit" id="search-btn">Cerca</button>
  </form>
  <div id="suggestions"></div>
  <div id="status-message"></div>
  <section id="results-container"></section>
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

// Risposte finte di fetch
export const ok = (data) => ({ ok: true, status: 200, json: async () => data });
export const httpError = (status = 500) => ({
  ok: false,
  status,
  json: async () => ({}),
});

// Una richiesta che resta in attesa e fallisce con AbortError quando viene annullata
export function abortable(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () =>
      reject(new DOMException("Aborted", "AbortError")),
    );
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

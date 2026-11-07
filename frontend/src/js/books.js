import { compact, isEmpty, map, truncate } from "lodash-es";
import { coverUrl } from "./covers.js";
import { MESSAGES } from "./messages.js";

const MAX_TITLE_LENGTH = 90;

const shorten = (text) =>
  truncate(text, { length: MAX_TITLE_LENGTH, separator: " " });

export function formatAuthors(book) {
  // map() accetta anche undefined; compact() toglie i nomi vuoti
  const names = compact(map(book.authors, "name"));
  return isEmpty(names) ? MESSAGES.unknownAuthor : names.join(", ");
}

// Riquadro mostrato quando non c'è la copertina (o non si carica)
function createCoverPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "book-cover book-cover-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = "📕";
  return placeholder;
}

function createCover(book) {
  const url = coverUrl(book.coverId);
  if (!url) return createCoverPlaceholder();

  const img = document.createElement("img");
  img.className = "book-cover";
  img.src = url;
  img.alt = ""; // decorativa: il titolo è già scritto accanto
  img.setAttribute("loading", "lazy"); // si scarica solo ciò che si vede
  img.addEventListener(
    "error",
    () => img.replaceWith(createCoverPlaceholder()),
    {
      once: true,
    },
  );
  return img;
}

function createBookCard(book, onOpen) {
  const card = document.createElement("article");
  card.className = "book-card";
  // Rende la scheda utilizzabile anche con la tastiera
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const info = document.createElement("div");
  info.className = "book-info";

  // textContent al posto di innerHTML: il testo non viene mai letto come HTML
  const fullTitle = book.title ?? MESSAGES.untitledBook;
  const title = document.createElement("h2");
  title.className = "book-title";
  // I titoli lunghissimi vengono accorciati nella lista (nella finestra sono interi)
  title.textContent = `📖 ${shorten(fullTitle)}`;
  title.title = fullTitle;
  info.append(title);

  // Il titolo è tradotto in italiano dal backend: se è diverso, si vede anche l'originale
  if (book.originalTitle && book.originalTitle !== fullTitle) {
    const original = document.createElement("p");
    original.className = "book-original-title";
    original.textContent = MESSAGES.originalTitle(shorten(book.originalTitle));
    info.append(original);
  }

  const authors = document.createElement("p");
  authors.className = "book-authors";
  authors.textContent = `✍️ ${formatAuthors(book)}`;
  info.append(authors);

  card.append(createCover(book), info);

  const open = () => onOpen(book, card);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });

  return card;
}

// Schede "fantasma" mostrate mentre arrivano i risultati
export function renderSkeletons(container, count = 6) {
  const skeletons = Array.from({ length: count }, () => {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML =
      '<div class="book-cover skeleton-block"></div>' +
      '<div class="book-info"><div class="skeleton-line"></div>' +
      '<div class="skeleton-line short"></div><div class="skeleton-pill"></div></div>';
    return card;
  });
  container.replaceChildren(...skeletons);
}

export function renderBooks(container, works, onOpen) {
  container.replaceChildren(
    ...works.map((book) => createBookCard(book, onOpen)),
  );
}

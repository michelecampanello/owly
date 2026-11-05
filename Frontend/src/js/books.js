import { MESSAGES } from "./messages.js";

export function formatAuthors(book) {
  return book.authors?.length
    ? book.authors.map((a) => a.name).join(", ")
    : MESSAGES.unknownAuthor;
}

function createBookCard(book, onOpen) {
  const card = document.createElement("article");
  card.className = "book-card";
  // Rende la scheda utilizzabile anche con la tastiera
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  // textContent al posto di innerHTML: il testo non viene mai letto come HTML
  const title = document.createElement("h2");
  title.className = "book-title";
  title.textContent = `📖 ${book.title ?? MESSAGES.untitledBook}`;

  const authors = document.createElement("p");
  authors.className = "book-authors";
  authors.textContent = `✍️ ${formatAuthors(book)}`;

  card.append(title, authors);

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

export function renderBooks(container, works, onOpen) {
  container.replaceChildren(...works.map((book) => createBookCard(book, onOpen)));
}

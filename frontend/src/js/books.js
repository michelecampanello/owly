import { compact, isEmpty, map, truncate } from "lodash-es";
import { MESSAGES } from "./messages.js";

const MAX_TITLE_LENGTH = 90;

export function formatAuthors(book) {
  const names = compact(map(book.authors, "name"));
  return isEmpty(names) ? MESSAGES.unknownAuthor : names.join(", ");
}

function createBookCard(book, onOpen) {
  const card = document.createElement("article");
  card.className = "book-card";
  // Rende la scheda utilizzabile anche con la tastiera
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const fullTitle = book.title ?? MESSAGES.untitledBook;
  const title = document.createElement("h2");
  title.className = "book-title";
  title.textContent = `📖 ${truncate(fullTitle, { length: MAX_TITLE_LENGTH, separator: " " })}`;
  title.title = fullTitle;

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
  container.replaceChildren(
    ...works.map((book) => createBookCard(book, onOpen)),
  );
}

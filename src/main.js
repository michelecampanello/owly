import "./style.css";

const searchForm = document.getElementById("search-form");
const categoryInput = document.getElementById("category-input");
const resultsContainer = document.getElementById("results-container");
const statusMessage = document.getElementById("status-message");
const suggestionsContainer = document.getElementById("suggestions");

const modal = document.getElementById("book-modal");
const modalTitle = document.getElementById("modal-title");
const modalAuthors = document.getElementById("modal-authors");
const modalDescription = document.getElementById("modal-description");
const closeModalBtn = document.getElementById("close-modal");

let lastFocusedCard = null;

// Parole italiane -> categorie di Open Library (in inglese)
const CATEGORY_MAP = {
  animali: "animals",
  draghi: "dragons",
  dinosauri: "dinosaurs",
  spazio: "space",
  storia: "history",
  avventura: "adventure",
  magia: "magic",
  pirati: "pirates",
  fiabe: "fairy_tales",
  favole: "fairy_tales",
  scienza: "science",
  amicizia: "friendship",
  cucina: "cooking",
  musica: "music",
  mare: "ocean",
  natura: "nature",
  fantascienza: "science_fiction",
  gialli: "mystery_and_detective_stories",
  paura: "horror",
  cavalli: "horses",
  gatti: "cats",
  cani: "dogs",
  robot: "robots",
  sport: "sports",
  calcio: "soccer",
  arte: "art",
};

// Pulsanti-suggerimento: etichetta mostrata e categoria cercata
const SUGGESTIONS = [
  { emoji: "🐉", label: "Draghi", category: "dragons" },
  { emoji: "🚀", label: "Spazio", category: "space" },
  { emoji: "🐾", label: "Animali", category: "animals" },
  { emoji: "🦖", label: "Dinosauri", category: "dinosaurs" },
  { emoji: "🧙", label: "Magia", category: "magic" },
  { emoji: "🏴‍☠️", label: "Pirati", category: "pirates" },
  { emoji: "🧚", label: "Fiabe", category: "fairy_tales" },
  { emoji: "🤖", label: "Robot", category: "robots" },
];

// Crea i pulsanti-suggerimento
SUGGESTIONS.forEach(({ emoji, label, category }) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "suggestion-btn";
  btn.textContent = `${emoji} ${label}`;
  btn.addEventListener("click", () => {
    categoryInput.value = label;
    fetchBooksByCategory(category, label);
  });
  suggestionsContainer.appendChild(btn);
});

// Trasforma quello che scrive il bambino in una categoria valida
function normalizeCategory(rawText) {
  const text = rawText.trim().toLowerCase().replace(/\s+/g, "_");
  const plain = text.replace(/_/g, " ");
  return CATEGORY_MAP[plain] || CATEGORY_MAP[text] || text;
}

// Event Listener Ricerca
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const rawText = categoryInput.value.trim();
  if (!rawText) return;
  fetchBooksByCategory(normalizeCategory(rawText), rawText);
});

// Chiamata 1: Cerca libri per Categoria
async function fetchBooksByCategory(category, displayName = category) {
  resultsContainer.innerHTML = "";
  statusMessage.textContent = "🔎 Sto cercando i libri...";

  try {
    const response = await fetch(
      `https://openlibrary.org/subjects/${encodeURIComponent(category)}.json?limit=12`,
    );

    if (!response.ok) {
      throw new Error(`Errore HTTP: ${response.status}`);
    }

    const data = await response.json();
    displayBooks(data.works, displayName);
  } catch (error) {
    console.error("Errore durante il recupero dei libri:", error);
    statusMessage.textContent =
      "😕 Oops! Non riesco a cercare i libri. Controlla la connessione o prova un'altra parola!";
  }
}

// Rendering lista libri
function displayBooks(works, displayName) {
  if (!works || works.length === 0) {
    statusMessage.textContent =
      "🤔 Non ho trovato nessun libro. Prova con un'altra parola, per esempio “animali”!";
    return;
  }

  statusMessage.textContent = `🎉 Ho trovato ${works.length} libri su “${displayName}”! Tocca un libro per saperne di più.`;

  works.forEach((book) => {
    const authorsList =
      book.authors && book.authors.length > 0
        ? book.authors.map((a) => a.name).join(", ")
        : "Autore sconosciuto";

    const card = document.createElement("article");
    card.className = "book-card";
    // Rende la scheda utilizzabile anche con la tastiera
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.innerHTML = `
      <h2 class="book-title">📖 ${escapeHTML(book.title)}</h2>
      <p class="book-authors">✍️ ${escapeHTML(authorsList)}</p>
    `;

    const open = () => {
      lastFocusedCard = card;
      openBookDetails(book.key, book.title, authorsList);
    };

    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    resultsContainer.appendChild(card);
  });
}

// Chiamata 2: Dettaglio del singolo libro
async function openBookDetails(workKey, title, authors) {
  modalTitle.textContent = title;
  modalAuthors.textContent = `✍️ ${authors}`;
  modalDescription.textContent = "⏳ Sto leggendo la trama...";
  modal.classList.remove("hidden");
  modal.querySelector(".modal-content").scrollTop = 0;
  closeModalBtn.focus();

  try {
    // workKey solitamente ha il formato "/works/OL8193508W"
    const response = await fetch(`https://openlibrary.org${workKey}.json`);

    if (!response.ok) {
      throw new Error(`Errore HTTP: ${response.status}`);
    }

    const data = await response.json();

    // Gestione formato flessibile della descrizione di Open Library
    let descriptionText =
      "🤷 Per questo libro non c'è ancora una descrizione. Chiedi aiuto a un adulto o in biblioteca!";

    if (data.description) {
      if (typeof data.description === "string") {
        descriptionText = data.description;
      } else if (
        typeof data.description === "object" &&
        data.description.value
      ) {
        descriptionText = data.description.value;
      }
    }

    modalDescription.textContent = descriptionText;
  } catch (error) {
    console.error("Errore durante il recupero del dettaglio:", error);
    modalDescription.textContent =
      "😕 Oops! Non riesco a caricare la trama. Riprova tra un attimo!";
  }
}

// Chiusura Modal
closeModalBtn.addEventListener("click", closeModal);
window.addEventListener("click", (e) => {
  if (e.target === modal) {
    closeModal();
  }
});
// Si chiude anche con il tasto Esc
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) {
    closeModal();
  }
});

function closeModal() {
  modal.classList.add("hidden");
  // Riporta il focus sulla scheda che era stata aperta
  if (lastFocusedCard) lastFocusedCard.focus();
}

// Utility Sanitizzazione
function escapeHTML(str) {
  return String(str).replace(
    /[&<>'"]/g,
    (tag) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        tag
      ] || tag,
  );
}

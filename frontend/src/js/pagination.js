import { MESSAGES } from "./messages.js";

// Numeri da mostrare: la prima, l'ultima e quelle vicine alla pagina attuale.
// I "buchi" diventano null (puntini). Esempio (5 di 10): [1, null, 4, 5, 6, null, 10]
export function pageNumbers(page, totalPages, around = 1) {
  const pages = [];
  for (let n = 1; n <= totalPages; n++) {
    const visible = n === 1 || n === totalPages || Math.abs(n - page) <= around;
    if (visible) pages.push(n);
    else if (pages.at(-1) !== null) pages.push(null);
  }
  // Un solo numero nascosto non vale i puntini: meglio mostrarlo
  return pages.map((n, i) =>
    n === null && pages[i + 1] - pages[i - 1] === 2 ? pages[i - 1] + 1 : n,
  );
}

function pageButton({ label, page, className, ariaLabel, disabled, current }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.dataset.page = String(page);
  if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
  if (current) btn.setAttribute("aria-current", "page");
  btn.disabled = Boolean(disabled);
  return btn;
}

// Disegna i pulsanti di paginazione; con una sola pagina il contenitore resta vuoto.
export function renderPagination(container, { page, totalPages }, onGo) {
  container.onclick = null;
  if (!Number.isInteger(totalPages) || totalPages <= 1) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }

  const numbers = pageNumbers(page, totalPages).map((n) => {
    if (n === null) {
      const dots = document.createElement("span");
      dots.className = "page-dots";
      dots.setAttribute("aria-hidden", "true");
      dots.textContent = "…";
      return dots;
    }
    return pageButton({
      label: String(n),
      page: n,
      className: "page-btn page-number",
      ariaLabel: MESSAGES.goToPage(n),
      current: n === page,
    });
  });

  container.replaceChildren(
    pageButton({
      label: MESSAGES.previousPage,
      page: page - 1,
      className: "page-btn page-step",
      disabled: page <= 1,
    }),
    ...numbers,
    pageButton({
      label: MESSAGES.nextPage,
      page: page + 1,
      className: "page-btn page-step",
      disabled: page >= totalPages,
    }),
  );
  container.setAttribute("aria-label", MESSAGES.pagination);
  container.hidden = false;

  // Un solo listener per tutti i pulsanti (sostituito a ogni nuovo disegno)
  container.onclick = (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn || btn.disabled || btn.getAttribute("aria-current")) return;
    onGo(Number(btn.dataset.page));
  };
}

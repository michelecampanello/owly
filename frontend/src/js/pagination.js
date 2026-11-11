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

// Identifica un pulsante tra un disegno e l'altro: "prev", "next" o "page:3"
const buttonId = (btn) =>
  btn.dataset.action === "page" ? `page:${btn.dataset.page}` : btn.dataset.action;

function pageButton({ label, page, action, className, ariaLabel, disabled, current }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.append(label);
  btn.dataset.page = String(page);
  btn.dataset.action = action;
  if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
  if (current) btn.setAttribute("aria-current", "page");
  btn.disabled = Boolean(disabled);
  return btn;
}

// "◀ Indietro" / "Avanti ▶": la freccia si vede sempre, la parola sparisce sugli schermi piccoli
// (resta per i lettori di schermo)
function stepLabel(text, arrow, arrowFirst) {
  const arrowEl = document.createElement("span");
  arrowEl.setAttribute("aria-hidden", "true");
  arrowEl.textContent = arrow;

  const textEl = document.createElement("span");
  textEl.className = "page-step-label";
  textEl.textContent = arrowFirst ? ` ${text}` : `${text} `;

  const fragment = document.createDocumentFragment();
  fragment.append(...(arrowFirst ? [arrowEl, textEl] : [textEl, arrowEl]));
  return fragment;
}

// Disegna i pulsanti di paginazione; con una sola pagina il contenitore resta vuoto.
// loading: la pagina richiesta è in arrivo. I pulsanti restano al loro posto (niente salti)
//   ma non rispondono ai click; sono aria-disabled e non disabled, così il focus non si perde.
// compact: meno numeri intorno alla pagina attuale, per gli schermi stretti.
export function renderPagination(
  container,
  { page, totalPages, loading = false, compact = false },
  onGo,
) {
  container.onclick = null;
  if (!Number.isInteger(totalPages) || totalPages <= 1) {
    container.replaceChildren();
    container.hidden = true;
    container.removeAttribute("aria-busy");
    return;
  }

  // Se il focus era su un pulsante, dopo il nuovo disegno torna sul pulsante equivalente
  const focused = container.contains(document.activeElement)
    ? buttonId(document.activeElement)
    : null;

  const numbers = pageNumbers(page, totalPages, compact ? 0 : 1).map((n) => {
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
      action: "page",
      className: "page-btn page-number",
      ariaLabel: MESSAGES.goToPage(n),
      current: n === page,
    });
  });

  const buttons = [
    pageButton({
      label: stepLabel(MESSAGES.previousPage, "◀", true),
      page: page - 1,
      action: "prev",
      className: "page-btn page-step",
      disabled: page <= 1,
    }),
    ...numbers,
    pageButton({
      label: stepLabel(MESSAGES.nextPage, "▶", false),
      page: page + 1,
      action: "next",
      className: "page-btn page-step",
      disabled: page >= totalPages,
    }),
  ];
  container.replaceChildren(...buttons);
  container.setAttribute("aria-label", MESSAGES.pagination);
  container.hidden = false;

  if (loading) {
    container.setAttribute("aria-busy", "true");
    container.querySelectorAll("button").forEach((btn) => {
      btn.setAttribute("aria-disabled", "true");
    });
  } else {
    container.removeAttribute("aria-busy");
  }

  if (focused) {
    const all = [...container.querySelectorAll("button")];
    const same = all.find((btn) => buttonId(btn) === focused && !btn.disabled);
    // Il pulsante non c'è più (numero nascosto) o è disattivato (ultima pagina): pagina corrente
    (same ?? container.querySelector('[aria-current="page"]'))?.focus();
  }

  // Un solo listener per tutti i pulsanti (sostituito a ogni nuovo disegno)
  container.onclick = (e) => {
    if (loading) return;
    const btn = e.target.closest("button[data-page]");
    if (!btn || btn.disabled || btn.getAttribute("aria-current")) return;
    onGo(Number(btn.dataset.page));
  };
}

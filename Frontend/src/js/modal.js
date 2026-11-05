// Finestra di dettaglio. Non conosce né l'API né i libri: sa solo aprirsi e chiudersi.
export function createModal({
  root,
  titleEl,
  authorsEl,
  descriptionEl,
  closeButton,
  onClose,
}) {
  const content = root.querySelector(".modal-content");
  let opener = null; // elemento a cui restituire il focus alla chiusura

  // Accessibilità: i lettori di schermo la riconoscono come finestra di dialogo
  content.setAttribute("role", "dialog");
  content.setAttribute("aria-modal", "true");
  content.setAttribute("aria-labelledby", titleEl.id);

  const isOpen = () => !root.classList.contains("hidden");

  function open({ title, authors, opener: openerEl = null }) {
    titleEl.textContent = title;
    authorsEl.textContent = `✍️ ${authors}`;
    opener = openerEl;
    root.classList.remove("hidden");
    content.scrollTop = 0;
    closeButton.focus();
  }

  function setDescription(text) {
    descriptionEl.textContent = text;
  }

  function close() {
    if (!isOpen()) return;
    root.classList.add("hidden");
    onClose?.();
    opener?.focus();
  }

  const onBackdropClick = (e) => {
    if (e.target === root) close();
  };
  const onKeydown = (e) => {
    if (e.key === "Escape") close();
  };

  closeButton.addEventListener("click", close);
  root.addEventListener("click", onBackdropClick);
  window.addEventListener("keydown", onKeydown);

  // Rimuove i listener su window (utile nei test o se l'app viene smontata)
  function destroy() {
    closeButton.removeEventListener("click", close);
    root.removeEventListener("click", onBackdropClick);
    window.removeEventListener("keydown", onKeydown);
  }

  return { open, close, isOpen, setDescription, destroy };
}

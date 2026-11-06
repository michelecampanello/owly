// L'AI del backend traduce le parole italiane, quindi qui basta l'etichetta.
export const SUGGESTIONS = [
  { emoji: "🐉", label: "Draghi" },
  { emoji: "🚀", label: "Spazio" },
  { emoji: "🐾", label: "Animali" },
  { emoji: "🦖", label: "Dinosauri" },
  { emoji: "🧙", label: "Magia" },
  { emoji: "🏴‍☠️", label: "Pirati" },
  { emoji: "🧚", label: "Fiabe" },
  { emoji: "🤖", label: "Robot" },
];

export function renderSuggestions(container, onPick) {
  const buttons = SUGGESTIONS.map(({ emoji, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion-btn";
    btn.textContent = `${emoji} ${label}`;
    btn.addEventListener("click", () => onPick(label));
    return btn;
  });

  container.replaceChildren(...buttons);
}

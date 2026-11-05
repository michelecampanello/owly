// Tutti i testi dell'app in un unico file: facili da trovare e da cambiare.
export const MESSAGES = {
  searching: "🔎 Sto cercando i libri...",
  searchError:
    "😕 Oops! Non riesco a cercare i libri. Controlla la connessione o prova un'altra parola!",
  noResults:
    "🤔 Non ho trovato nessun libro. Prova con un'altra parola, per esempio “animali”!",
  blocked: "🙈 Proviamo con un altro argomento!",
  found: (count, topic) =>
    `🎉 Ho trovato ${count} libri su “${topic}”! Tocca un libro per saperne di più.`,
  mixedLanguage: "⚠️ Alcuni libri potrebbero essere in un'altra lingua.",

  unknownAuthor: "Autore sconosciuto",
  untitledBook: "Senza titolo",

  loadingDescription: "⏳ Sto leggendo la trama...",
  noDescription:
    "🤷 Per questo libro non c'è ancora una descrizione. Chiedi aiuto a un adulto o in biblioteca!",
  descriptionError: "😕 Oops! Non riesco a caricare la trama. Riprova tra un attimo!",
};

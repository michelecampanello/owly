// Tutti i testi dell'app in un unico file: facili da trovare e da cambiare.
export const MESSAGES = {
  // Durante i caricamenti accanto al testo c'è uno spinner animato (niente emoji)
  searching: "Sto cercando i libri...",
  searchError:
    "😕 Oops! Non riesco a cercare i libri. Controlla la connessione o prova un'altra parola!",
  noResults:
    "🤔 Non ho trovato nessun libro. Prova con un'altra parola, per esempio “animali”!",
  blocked: "🙈 Proviamo con un altro argomento!",
  // Owly ha scartato tutti i libri della ricerca perché non adatti ai bambini
  noKidBooks:
    "🙈 Su questo argomento non ho trovato libri adatti a te. Prova con un'altra parola!",
  // ...oppure solo quelli di questa pagina, ma ce ne sono altre
  noKidBooksOnPage: (page, totalPages) =>
    `🙈 In questa pagina non ci sono libri adatti a te. 📄 Pagina ${page} di ${totalPages}: prova un'altra pagina!`,
  found: (count, topic) =>
    `🎉 Ho trovato ${count} libri su “${topic}”! Tocca un libro per saperne di più.`,
  pageOf: (page, totalPages) => `📄 Pagina ${page} di ${totalPages}`,
  // Owly salta da sola le pagine rimaste vuote dopo il filtro
  searchingPage: (page) => `Cerco libri adatti a te nella pagina ${page}...`,
  skippedPages: (skipped, page) =>
    skipped.length === 1
      ? `🦉 Nella pagina ${skipped[0]} non c'erano libri adatti a te: ti mostro la ${page}.`
      : `🦉 Nelle pagine ${skipped.slice(0, -1).join(", ")} e ${skipped.at(-1)} non c'erano libri adatti a te: ti mostro la ${page}.`,
  pagination: "Pagine dei risultati",
  // Le frecce ◀ ▶ le aggiunge pagination.js
  previousPage: "Indietro",
  nextPage: "Avanti",
  goToPage: (page) => `Vai alla pagina ${page}`,
  mixedLanguage: "⚠️ Alcuni libri potrebbero essere in un'altra lingua.",

  unknownAuthor: "Autore sconosciuto",
  untitledBook: "Senza titolo",
  originalTitle: (title) => `🌍 Titolo originale: ${title}`,
  loadingDescription: "Sto leggendo la trama...",
  noDescription:
    "🤷 Per questo libro non c'è ancora una descrizione. Chiedi aiuto a un adulto o in biblioteca!",
  descriptionError:
    "😕 Oops! Non riesco a caricare la trama. Riprova tra un attimo!",

  // Riga sotto la ricerca: dice da dove vengono titoli e trame
  aiNotice:
    "✨ Titoli e trame sono rielaborati automaticamente dall'intelligenza artificiale e possono contenere imprecisioni.",
  rawNotice:
    "📄 Stai vedendo titoli e trame originali di Open Library, senza rielaborazione (spesso in inglese).",
};

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
  pagination: "Pagine dei risultati",
  previousPage: "◀ Indietro",
  nextPage: "Avanti ▶",
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
};

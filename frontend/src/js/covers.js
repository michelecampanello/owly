// Copertine dei libri: servizio gratuito di Open Library.
// Formato: https://covers.openlibrary.org/b/id/<numero>-<S|M|L>.jpg
// Dimensioni: S ≈ 45 px di altezza, M ≈ 150 px, L ≈ 400 px.
const COVERS_URL = "https://covers.openlibrary.org/b/id";
const SIZES = ["S", "M", "L"];

export function coverUrl(coverId, size = "M") {
  // L'identificativo finisce dentro un URL: accettiamo solo numeri interi positivi
  if (!Number.isInteger(coverId) || coverId <= 0 || !SIZES.includes(size)) {
    return null;
  }
  // default=false: se la copertina non esiste il server risponde 404
  // (altrimenti restituirebbe un'immagine vuota) e possiamo mostrare un segnaposto.
  return `${COVERS_URL}/${coverId}-${size}.jpg?default=false`;
}

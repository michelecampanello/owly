// Comunicazione con il backend Node (che a sua volta usa Open Library e l'AI).

async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Errore HTTP: ${response.status}`);
  }
  return response.json();
}

// -> { works: [{ key, title, authors: [{ name }] }], language?, blocked? }
export function fetchBooks(category, { signal } = {}) {
  return getJson(`/api/books?category=${encodeURIComponent(category)}`, signal);
}

// -> { description: string | null }
export function fetchDescription(workKey, { signal } = {}) {
  return getJson(`/api/description?key=${encodeURIComponent(workKey)}`, signal);
}

// ── Flux search: Stremio Cinemeta (same source Helix uses) ──────────────
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

// Search one catalog on Cinemata — mirrors Helix's MetadataService.search:
// GET /catalog/{type}/top/search={query}.json
async function searchCatalog(type, query) {
  const url =
    CINEMETA_BASE +
    '/catalog/' + encodeURIComponent(type) +
    '/top/search=' + encodeURIComponent(query) + '.json';

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];

  const body = await res.json();
  const metas = Array.isArray(body.metas) ? body.metas : [];

  return metas
    .map((m) => ({
      id: String(m.id ?? ''),
      name: String(m.name ?? 'Unknown'),
      poster: m.poster ? String(m.poster) : null,
      year:
        m.releaseInfo != null ? String(m.releaseInfo)
        : m.year != null ? String(m.year)
        : null,
      type: String(m.type ?? type),
      imdbRating:
        m.imdbRating != null ? String(m.imdbRating)
        : m.rating != null ? String(m.rating)
        : null
    }))
    .filter((m) => m.id && m.name && m.name !== 'Unknown');
}

// Search movies + series in parallel (Helix pattern), interleave the
// results so neither type drowns out the other.
async function searchAll(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  const [movies, series] = await Promise.all([
    searchCatalog('movie', q).catch(() => []),
    searchCatalog('series', q).catch(() => [])
  ]);

  const mixed = [];
  const max = Math.max(movies.length, series.length);
  for (let i = 0; i < max; i++) {
    if (movies[i]) mixed.push(movies[i]);
    if (series[i]) mixed.push(series[i]);
  }
  return mixed;
}

module.exports = { searchCatalog, searchAll };

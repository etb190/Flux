/* ── Data layer ───────────────────────────────────────────────────────────
 * In Electron, network calls run in the main process via fluxAPI (no CORS,
 * stream scraping lives there too). Outside Electron (plain `vite dev` in a
 * browser), fall back to direct fetch — Cinemeta is CORS-enabled.
 */

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

function fluxApi() {
  return typeof window !== 'undefined' ? window.fluxAPI : null;
}

function num(val) {
  if (val == null) return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
}

async function searchCatalogDirect(type, query) {
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

async function getMetaDirect(type, id) {
  const url =
    CINEMETA_BASE +
    '/meta/' + encodeURIComponent(type) +
    '/' + encodeURIComponent(id) + '.json';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const body = await res.json();
  const m = body && body.meta;
  if (!m) return null;
  const listOf = (v) =>
    Array.isArray(v) ? v.map(String).filter(Boolean).join(', ')
      : (v != null && String(v).trim() ? String(v) : null);

  // YouTube trailer id — same extraction as the main-process fetchMeta
  const ytId = (v) => {
    const s = String(v || '').trim();
    if (!s) return null;
    const m = s.match(/^(?:yt:)?([A-Za-z0-9_-]{6,})$/);
    return m ? m[1] : null;
  };
  const trailer =
    ytId(m.trailer) ||
    (Array.isArray(m.trailers) ? ytId(m.trailers[0] && m.trailers[0].source) : null) ||
    (Array.isArray(m.trailerStreams) ? ytId(m.trailerStreams[0] && m.trailerStreams[0].ytId) : null);

  return {
    id: String(m.id ?? id),
    type: String(m.type ?? type),
    name: String(m.name ?? 'Unknown'),
    poster: m.poster ? String(m.poster) : null,
    // metahub serves small/medium/large — the details page paints the
    // background edge-to-edge, so take the large rendition.
    background: m.background
      ? String(m.background).replace('/background/medium/', '/background/large/')
      : null,
    logo: m.logo ? String(m.logo) : null,
    description: m.description ? String(m.description) : null,
    year: m.releaseInfo != null ? String(m.releaseInfo) : null,
    imdbRating: m.imdbRating != null ? String(m.imdbRating) : null,
    genres: Array.isArray(m.genres) ? m.genres.map(String) : [],
    runtime: m.runtime != null ? String(m.runtime) : null,
    cast: Array.isArray(m.cast) ? m.cast.map(String).filter(Boolean) : [],
    director: listOf(m.director),
    writer: listOf(m.writer),
    country: listOf(m.country),
    trailer,
    videos: (Array.isArray(m.videos) ? m.videos : [])
      .map((v) => ({
        id: String(v.id ?? ''),
        title: String(v.title ?? v.name ?? 'Episode'),
        season: num(v.season),
        episode: num(v.episode ?? v.number),
        released: v.released ? String(v.released) : null,
        thumbnail: v.thumbnail ? String(v.thumbnail) : null,
        overview: String(v.overview ?? v.description ?? '')
      }))
      .filter((v) => v.id)
  };
}

export async function doSearch(query) {
  const api = fluxApi();
  if (api && typeof api.search === 'function') {
    return api.search(query);
  }
  // Browser fallback: search movie + series in parallel, interleave
  const [movies, series] = await Promise.all([
    searchCatalogDirect('movie', query).catch(() => []),
    searchCatalogDirect('series', query).catch(() => [])
  ]);
  const mixed = [];
  const max = Math.max(movies.length, series.length);
  for (let i = 0; i < max; i++) {
    if (movies[i]) mixed.push(movies[i]);
    if (series[i]) mixed.push(series[i]);
  }
  return mixed;
}

export async function getMeta(type, id) {
  const api = fluxApi();
  if (api && typeof api.getMeta === 'function') {
    return api.getMeta(type, id);
  }
  return getMetaDirect(type, id);
}

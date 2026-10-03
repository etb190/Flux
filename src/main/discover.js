// ── Flux: Discover page (main process) ───────────────────────────────────
// Genre-driven browse for the Discover tab. Three sorts, one genre facet:
//
//   Popular   → Cinemeta "top" catalog  /catalog/{type}/top/genre={g}&skip={n}.json
//   Top Rated → TMDB Discover           /discover/{movie|tv}?sort_by=vote_average.desc&vote_count.gte=300
//   New       → TMDB Discover           /discover/{movie|tv}?sort_by={date}.desc&{date}.lte=today&vote_count.gte=20
//
// Cinemeta carries native imdb ids (details/streams flow needs nothing
// extra). TMDB results carry TMDB ids, so they go through the SAME
// external_ids → imdb_id enrichment the trending row uses (tmdbhome.js).
//
// WHY Top Rated is TMDB: Cinemeta's "imdbRating" catalog was probed and is
// unusable for a Top Rated wall — its whole pool is ~200 movies / ~400
// series, pages come back UNSORTED, ~16% of metas have no rating at all and
// scores run down to the 5s. TMDB's vote_average.desc + a 300-vote floor is
// sorted high→low by construction, every item is rated, and it paginates
// hundreds of pages deep.
//
// TMDB discover quirk: /discover results do NOT carry media_type (trending
// does), so enrichment must have it attached — without it the external_ids
// URL is /3/undefined/{id}/... and every item 404s off the grid.
//
// Cinemeta's "year" catalog was probed and can NOT combine a year with a
// genre (genre=Action alone returns 0 metas), which is why New is
// TMDB-backed.
//
// Genre chips are read from the Cinemeta manifest (the addon advertises its
// genre options per catalog — no hardcoding when online); a static list
// ships as offline fallback. TMDB genre ids resolve via a static alias map
// (TMDB names differ from Cinemeta's; see TMDB_GENRE_IDS).
//
// Pages cache in MEMORY (6h TTL) so tab switches and infinite scroll feel
// instant; the genres list caches on disk (24h) like the addon catalogs.
//
// Pure Node module (no electron import): fetch is injectable for tests.

const fs = require('fs');
const path = require('path');
const { CINEMETA_BASE, mapCatalogMeta } = require('./catalogs.js');
const tmdbhome = require('./tmdbhome.js');

const GENRES_TTL_MS = 24 * 60 * 60 * 1000;   // 24h — genre lists move slowly
const PAGE_TTL_MS = 6 * 60 * 60 * 1000;      // 6h — same freshness as home rows
const CINEMETA_PAGE_SIZE = 50;               // metas per Cinemeta catalog page
const CINEMETA_MAX_SKIP = 2000;              // sanity bound on infinite scroll
const TMDB_MAX_PAGES = 500;                  // TMDB hard cap on discover pages
const MEM_CACHE_MAX = 240;                   // entries before oldest-eviction
const RATING_MIN_VOTES = 300;                // Top Rated floor — keeps the wall genuinely "top"

// Overridable fetch (tests inject a stub). TMDB enrichment goes through
// tmdbhome.js's own fetcher — tests must inject there too.
let fetchImpl = (url, opts) => fetch(url, opts);

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Flux/1.0' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Offline fallback genre lists (Cinemeta manifest, probed 2026-10) ─────
const DEFAULT_GENRES = {
  movie: ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
    'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
    'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'],
  series: ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
    'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
    'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
    'Reality-TV', 'Talk-Show', 'Game-Show']
};

// Cinemeta genre name → TMDB with_genres id. TMDB's naming differs (Sci-Fi
// vs Science Fiction / Sci-Fi & Fantasy) and a few genres have no real TMDB
// counterpart (Sport, Game-Show…) — those map to null and the UI shows a
// friendly note instead of a mislabeled list.
const TMDB_GENRE_IDS = {
  movie: {
    'Action': 28, 'Adventure': 12, 'Animation': 16, 'Biography': 18,
    'Comedy': 35, 'Crime': 80, 'Documentary': 99, 'Drama': 18,
    'Family': 10751, 'Fantasy': 14, 'History': 36, 'Horror': 27,
    'Mystery': 9648, 'Romance': 10749, 'Sci-Fi': 878, 'Sport': null,
    'Thriller': 53, 'War': 10752, 'Western': 37
  },
  series: {
    'Action': 10759, 'Adventure': 10759, 'Animation': 16, 'Biography': 18,
    'Comedy': 35, 'Crime': 80, 'Documentary': 99, 'Drama': 18,
    'Family': 10751, 'Fantasy': 10765, 'History': 18, 'Horror': 9648,
    'Mystery': 9648, 'Romance': 10749, 'Sci-Fi': 10765, 'Sport': null,
    'Thriller': 53, 'War': 10768, 'Western': 37, 'Reality-TV': 10764,
    'Talk-Show': 10767, 'Game-Show': 10767
  }
};

// ── Memory page cache (Map keeps insertion order → evict oldest first) ───
const memCache = new Map();   // key → { t, data }

function memGet(key) {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.t < PAGE_TTL_MS) return hit.data;
  if (hit) memCache.delete(key);
  return null;
}

function memSet(key, data) {
  if (memCache.size >= MEM_CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(key, { t: Date.now(), data });
}

// ── Genres (Cinemeta manifest, disk-cached 24h) ──────────────────────────
function genresCacheFile(dir) { return path.join(dir, 'discover-genres.json'); }

function extractGenres(manifest, type) {
  const cat = (manifest && Array.isArray(manifest.catalogs) ? manifest.catalogs : [])
    .find((c) => c && c.type === type && c.id === 'top');
  const extras = cat && Array.isArray(cat.extra) ? cat.extra : [];
  const genreExtra = extras.find((e) => e && e.name === 'genre');
  const options = genreExtra && Array.isArray(genreExtra.options) ? genreExtra.options : [];
  return options.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim());
}

async function fetchGenres(opts) {
  const dir = opts && opts.cacheDir;
  if (dir) {
    try {
      const all = JSON.parse(fs.readFileSync(genresCacheFile(dir), 'utf8'));
      if (all && all.t && Date.now() - all.t < GENRES_TTL_MS &&
          Array.isArray(all.movie) && Array.isArray(all.series) &&
          all.movie.length && all.series.length) {
        return { movie: all.movie, series: all.series, source: 'cache' };
      }
    } catch (_) { /* missing/corrupt → fetch */ }
  }
  try {
    const manifest = await getJson(CINEMETA_BASE + '/manifest.json');
    const movie = extractGenres(manifest, 'movie');
    const series = extractGenres(manifest, 'series');
    if (!movie.length || !series.length) throw new Error('manifest has no genre options');
    if (dir) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(genresCacheFile(dir),
          JSON.stringify({ t: Date.now(), movie, series }), 'utf8');
      } catch (_) { /* cache is best-effort */ }
    }
    return { movie, series, source: 'manifest' };
  } catch (_) {
    return {
      movie: DEFAULT_GENRES.movie.slice(),
      series: DEFAULT_GENRES.series.slice(),
      source: 'fallback'
    };
  }
}

// ── One page of results ──────────────────────────────────────────────────
// params: { type: 'movie'|'series', sort: 'popular'|'rating'|'new',
//           genre: ''|name, skip: 0-based (Cinemeta), page: 1-based (TMDB) }
// Returns { items, hasMore, note? } — or throws (IPC layer converts).
async function fetchPage(params, opts) {
  const p = params || {};
  const type = p.type === 'series' ? 'series' : 'movie';
  const sort = p.sort === 'rating' || p.sort === 'new' ? p.sort : 'popular';
  const genre = String(p.genre || '').trim();
  const skip = Math.min(CINEMETA_MAX_SKIP, Math.max(0, Math.floor(Number(p.skip) || 0)));
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const key = (opts && opts.key) || undefined;
  const memKey = [sort, type, genre, sort === 'popular' ? skip : page].join('|');

  const hit = memGet(memKey);
  if (hit) return hit;

  let result;
  if (sort === 'popular') {
    result = await fetchCinemetaPage(type, genre, skip);
  } else {
    result = await fetchTmdbPage(type, sort, genre, page, key);
  }
  memSet(memKey, result);
  return result;
}

// Popular — Cinemeta "top" addon catalog (extras: genre + skip).
async function fetchCinemetaPage(type, genre, skip) {
  const extras = [];
  if (genre) extras.push('genre=' + encodeURIComponent(genre));
  extras.push('skip=' + skip);
  const url = CINEMETA_BASE + '/catalog/' + type + '/top/' +
    extras.join('&') + '.json';
  const body = await getJson(url);
  const metas = Array.isArray(body && body.metas) ? body.metas : [];
  const items = metas
    .map((m) => mapCatalogMeta(m, type))
    .filter(Boolean);
  return {
    items,
    hasMore: metas.length >= CINEMETA_PAGE_SIZE && skip + CINEMETA_PAGE_SIZE <= CINEMETA_MAX_SKIP
  };
}

// Top Rated / New — TMDB discover, enriched to imdb ids with the trending
// row's pipeline (tmdbhome.enrichWithImdbIds).
//   rating → all-time best: vote_average.desc with a 300-vote floor
//   new    → newest RELEASED first (date.lte = today; without the ceiling
//            the top of the wall is unreleased announcements)
async function fetchTmdbPage(type, sort, genre, page, key) {
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const genreId = genre ? (TMDB_GENRE_IDS[type] || {})[genre] : undefined;
  if (genre && genreId === null) {
    return {
      items: [],
      hasMore: false,
      note: genre + ' isn\u2019t available for this sort \u2014 try Popular instead.'
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const dateField = tmdbType === 'tv' ? 'first_air_date' : 'primary_release_date';
  const q = { include_adult: 'false', page: String(page) };
  if (sort === 'rating') {
    q.sort_by = 'vote_average.desc';
    q['vote_count.gte'] = String(RATING_MIN_VOTES);
  } else {
    q.sort_by = dateField + '.desc';
    q[dateField + '.lte'] = today;
    q['vote_count.gte'] = '20';
  }
  if (genre && genreId != null) q.with_genres = String(genreId);
  const body = await getJson(tmdbhome.tmdbUrl('/discover/' + tmdbType, q, key));
  const raw = (body && Array.isArray(body.results) ? body.results : [])
    .slice(0, 20)
    // discover results carry NO media_type — enrichment builds
    // /{media_type}/{id}/external_ids and 404s without it (trending
    // results already have it, which is why only this path was broken).
    .map((r) => ({ media_type: tmdbType, ...r }));
  const items = await tmdbhome.enrichWithImdbIds(raw, key);
  const totalPages = Math.min(Number(body && body.total_pages) || 0, TMDB_MAX_PAGES);
  return { items, hasMore: page < totalPages && items.length > 0 };
}

// Test hooks
function _setFetcher(fn) { fetchImpl = fn; }
function _resetMemCache() { memCache.clear(); }

module.exports = {
  DEFAULT_GENRES, TMDB_GENRE_IDS,
  GENRES_TTL_MS, PAGE_TTL_MS, CINEMETA_PAGE_SIZE,
  fetchGenres, fetchPage, _setFetcher, _resetMemCache
};

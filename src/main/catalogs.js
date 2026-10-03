// ── Flux home: Stremio addon catalogs (port of Helix AddonManager) ───────
// Helix (lib/services/addon/addon_manager.dart + metadata_service.dart)
// fills its home page by taking every active catalog addon, reading its
// manifest catalogs and fetching /catalog/{type}/{catalogId}.json for each
// one that can auto-load on home (no required extras). Flux ships with the
// same addon Helix installs out of the box: Cinemeta.
//
// This module replaces the Streaming Availability API (quota-limited paid
// key) as the home data source: no API key, no country setting, no quota.
//
// Pure Node module (no electron import; fetch is injectable for tests).
// A 12h disk cache keeps repeat launches instant and the addon servers calm.

const fs = require('fs');
const path = require('path');

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;   // 12 hours (catalogs update daily)
const FETCH_TIMEOUT_MS = 20000;
const MAX_ITEMS_PER_ROW = 60;

// ── URL helpers (Helix MetadataService.buildCatalogUrl) ───────────────────
function normalizeBase(baseUrl) {
  const base = String(baseUrl || '').trim();
  if (!base || !base.startsWith('http')) return CINEMETA_BASE;
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function catalogUrl(baseUrl, type, catalogId) {
  return (
    normalizeBase(baseUrl) +
    '/catalog/' + encodeURIComponent(type) +
    '/' + encodeURIComponent(catalogId) + '.json'
  );
}

// Helix AddonCatalog.canAutoLoadOnHome: a catalog auto-loads only when NONE
// of its extras is required (Cinemeta's home catalogs all qualify).
function catalogAutoLoadable(catalog) {
  if (!catalog || !catalog.id || !catalog.type) return false;
  const extras = Array.isArray(catalog.extras) ? catalog.extras : [];
  return extras.every((e) => !e || !e.isRequired);
}

// ── Meta → Flux card mapping (same shape search.js produces) ──────────────
function mapCatalogMeta(m, fallbackType) {
  if (!m || m.id == null) return null;
  const id = String(m.id);
  if (!id) return null;

  const ratingRaw = m.imdbRating != null ? String(m.imdbRating) : '';
  const genres = Array.isArray(m.genres)
    ? m.genres.map(String)
    : (typeof m.genre === 'string' && m.genre ? [m.genre] : []);

  return {
    id,
    type: m.type === 'series' || m.type === 'movie' ? m.type : (fallbackType || 'movie'),
    name: String(m.name || m.title || 'Unknown'),
    poster: m.poster ? String(m.poster) : null,
    backdrop: m.background ? String(m.background) : null,
    year: m.releaseInfo != null ? String(m.releaseInfo)
      : m.year != null ? String(m.year)
      : null,
    imdbRating: ratingRaw && ratingRaw !== 'null' ? ratingRaw : null,
    overview: m.description ? String(m.description) : '',
    genres
  };
}

// ── Row titles ────────────────────────────────────────────────────────────
// Cinemeta names several catalogs the same across types ("Popular" exists as
// movie + series). When a name is shared, suffix the type so rows read
// "Popular Movies" / "Popular Series"; unique names ("Last videos") stay as-is.
function buildRowTitler(catalogs) {
  const typesByName = new Map();
  for (const c of catalogs) {
    if (!typesByName.has(c.name)) typesByName.set(c.name, new Set());
    typesByName.get(c.name).add(c.type);
  }
  return (catalog) => {
    const shared = typesByName.get(catalog.name);
    if (shared && shared.size > 1) {
      return catalog.name + (catalog.type === 'series' ? ' Series' : ' Movies');
    }
    return catalog.name;
  };
}

// ── Disk cache (same pattern the old saa.js used) ─────────────────────────
function cacheFile(cacheDir) {
  return path.join(cacheDir, 'catalogs-cache.json');
}

function loadCache(cacheDir) {
  if (!cacheDir) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile(cacheDir), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    for (const key of Object.keys(parsed)) {
      const entry = parsed[key];
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.items)) {
        delete parsed[key];
      } else if (typeof entry.expires !== 'number' || entry.expires < now) {
        entry.stale = true;                    // keep for stale-serving, prune later
      }
    }
    return parsed;
  } catch (_) {
    return {};
  }
}

function writeCache(cacheDir, cache) {
  if (!cacheDir) return;
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const now = Date.now();
    const fresh = {};
    for (const [key, entry] of Object.entries(cache)) {
      if (entry && Array.isArray(entry.items) && typeof entry.expires === 'number' &&
          entry.expires >= now) {
        fresh[key] = entry;
      }
    }
    fs.writeFileSync(cacheFile(cacheDir), JSON.stringify(fresh), 'utf8');
  } catch (_) { /* non-fatal: cache is an optimization */ }
}

// ── Fetching ──────────────────────────────────────────────────────────────
async function fetchJson(url, fetchImpl, timeoutMs) {
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      redirect: 'follow'                     // Cinemeta 307s to cinemeta-catalogs.strem.io
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getManifest(baseUrl, fetchImpl) {
  const body = await fetchJson(normalizeBase(baseUrl) + '/manifest.json', fetchImpl);
  if (!body || !Array.isArray(body.catalogs)) {
    throw new Error('Addon manifest has no catalogs.');
  }
  return body;
}

// Fetch one catalog → { url, title, type, items }. Serves the disk cache when
// fresh, falls back to a stale entry if the network fails, and never throws.
async function fetchCatalogRow(baseUrl, catalog, title, cache, cacheDir, fetchImpl) {
  const url = catalogUrl(baseUrl, catalog.type, catalog.id);
  const entry = cache[url];

  if (entry && Array.isArray(entry.items) && entry.stale !== true) {
    return { url, title, type: catalog.type, items: entry.items };
  }

  try {
    const body = await fetchJson(url, fetchImpl);
    const metas = Array.isArray(body && body.metas) ? body.metas : [];
    const items = [];
    const seen = new Set();
    for (const m of metas) {
      const item = mapCatalogMeta(m, catalog.type);
      if (!item || !item.name || !item.poster) continue;
      const dedupeKey = item.type + ':' + item.id;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push(item);
      if (items.length >= MAX_ITEMS_PER_ROW) break;
    }
    if (!items.length) throw new Error('catalog returned no usable metas');
    cache[url] = { items, expires: Date.now() + CACHE_TTL_MS };
    writeCache(cacheDir, cache);
    return { url, title, type: catalog.type, items };
  } catch (e) {
    // Stale-serving: better an outdated row than a missing one.
    if (entry && Array.isArray(entry.items) && entry.items.length) {
      return { url, title, type: catalog.type, items: entry.items };
    }
    return null;                             // Helix: catch (_) => return null
  }
}

// Pick the hero: first title (row order) that has backdrop art AND a story
// overview AND a poster — same "best-looking first item" idea as Helix's
// spotlight picker.
function pickHero(rows) {
  for (const row of rows) {
    for (const item of row.items) {
      if (item.backdrop && item.overview && item.poster) return item;
    }
  }
  for (const row of rows) {
    const withBackdrop = row.items.find((i) => i.backdrop);
    if (withBackdrop) return withBackdrop;
  }
  return (rows[0] && rows[0].items[0]) || null;
}

// ── Public API ────────────────────────────────────────────────────────────
// Returns { hero, rows: [{title, type, items}] } or { error }.
// All catalogs are fetched concurrently (Helix: Future.wait per addon) and
// rows are returned in manifest order so the page stays stable.
async function getHomeData(opts = {}) {
  const baseUrl = normalizeBase(opts.baseUrl);
  const cacheDir = opts.cacheDir;
  const fetchImpl = opts.fetchImpl || fetch;

  try {
    const manifest = await getManifest(baseUrl, fetchImpl);
    const catalogs = manifest.catalogs.filter(catalogAutoLoadable);
    if (!catalogs.length) {
      return { error: 'The addon manifest has no auto-loadable catalogs.' };
    }

    const cache = loadCache(cacheDir);
    const titler = buildRowTitler(catalogs);

    const settled = await Promise.all(catalogs.map((catalog) =>
      fetchCatalogRow(baseUrl, catalog, titler(catalog), cache, cacheDir, fetchImpl)
    ));

    // Global dedupe by type+id: the same title should not appear on the home
    // page twice (Popular/New/Featured and Last/Calendar videos overlap).
    const seen = new Set();
    const rows = [];
    for (const row of settled) {
      if (!row || !row.items.length) continue;
      const items = row.items.filter((item) => {
        const key = item.type + ':' + item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (items.length) {
        const key = 'cat-' + row.type + '-' + String(row.title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        rows.push({ key, title: row.title, type: row.type, items });
      }
    }

    writeCache(cacheDir, cache);

    if (!rows.length) {
      return { error: 'Couldn\u2019t reach the addon catalogs. Check your connection and try again.' };
    }

    return { hero: pickHero(rows), rows };
  } catch (e) {
    return { error: (e && e.message) || 'Home data failed to load.' };
  }
}

module.exports = {
  CINEMETA_BASE, CACHE_TTL_MS, MAX_ITEMS_PER_ROW,
  normalizeBase, catalogUrl, catalogAutoLoadable, mapCatalogMeta,
  buildRowTitler, loadCache, writeCache, getManifest, fetchCatalogRow,
  pickHero, getHomeData
};

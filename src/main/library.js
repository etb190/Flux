// ── Flux library: watch history + watched list (main process) ────────────
// Two collections persisted to userData/flux-library.json:
//
//   history  — "Continue watching". Written automatically every time a
//              source starts playing (openPlayer) and patched with live
//              playback progress every few seconds (historyProgress).
//              One entry per title (imdbId + type); re-watching updates
//              the season/episode and moves it to the front. Caps at
//              HISTORY_CAP entries.
//              Entry: { imdbId, type, title, poster, season, episode,
//                       positionSec, durationSec,            resume point
//                       still, backdrop, episodeTitle,       card artwork
//                       sourceUrl, sourceProvider,           same-source
//                       sourceTitle, sourceFormat,           resume
//                       sourceHeaders, updatedAt }
//
//   watched  — the manual "Watched" list the user curates in the sidebar
//              (search → add). Drives the TMDB suggestion rows on the
//              home page. Entry: { imdbId, type, title, poster, genres,
//                       addedAt }
//
//   want     — the "Want to watch" list (same entry shape, no genres).
//              Mutually exclusive with watched: adding a title to one
//              removes it from the other (a title can't be both).
//
// Pure Node module (no electron import): main.js passes the file path, so
// it stays unit-testable from plain Node.

const fs = require('fs');
const path = require('path');

const HISTORY_CAP = 50;

// ── Validation / normalization ────────────────────────────────────────────

function normalizeType(t) {
  return t === 'series' ? 'series' : 'movie';
}

function normalizeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const imdbId = String(raw.imdbId || '').trim();
  if (!/^tt\d{5,}$/.test(imdbId)) return null;   // Cinemeta ids are tt-ids
  const entry = {
    imdbId,
    type: normalizeType(raw.type),
    title: String(raw.title || '').slice(0, 300) || 'Unknown',
    poster: raw.poster ? String(raw.poster).slice(0, 600) : null
  };
  return entry;
}

// Non-negative seconds (position/duration)
function normalizeSec(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function normalizeStr(v, cap) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, cap) : null;
}

// Referer/UA headers the player needs for this source (string -> string)
function normalizeHeaders(h) {
  if (!h || typeof h !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(h).slice(0, 10)) {
    const key = String(k).slice(0, 60);
    const val = String(v == null ? '' : v).slice(0, 500);
    if (key && val) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

// Extra playback/art fields shared by addHistory + updateHistoryProgress.
// Everything here is optional — old entries simply lack them.
function playbackFields(raw) {
  const fields = {
    positionSec: normalizeSec(raw.positionSec),
    durationSec: normalizeSec(raw.durationSec),
    still: normalizeStr(raw.still, 600),          // episode still / movie backdrop
    backdrop: normalizeStr(raw.backdrop, 600),    // show/movie backdrop art
    episodeTitle: normalizeStr(raw.episodeTitle, 300),
    sourceUrl: normalizeStr(raw.sourceUrl, 2000),
    sourceProvider: normalizeStr(raw.sourceProvider, 120),
    sourceTitle: normalizeStr(raw.sourceTitle, 200),
    sourceFormat: normalizeStr(raw.sourceFormat, 20),
    sourceHeaders: normalizeHeaders(raw.sourceHeaders)
  };
  // Drop nulls so we never clobber existing values with empty ones
  for (const k of Object.keys(fields)) {
    if (fields[k] === null) delete fields[k];
  }
  return fields;
}

// ── Disk layer ────────────────────────────────────────────────────────────

function loadLibrary(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const history = Array.isArray(parsed.history) ? parsed.history : [];
    const watched = Array.isArray(parsed.watched) ? parsed.watched : [];
    const want = Array.isArray(parsed.want) ? parsed.want : [];
    return { history, watched, want };
  } catch (_) {
    return { history: [], watched: [], want: [] };
  }
}

function saveLibrary(file, lib) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(lib, null, 2) + '\n', 'utf8');
  } catch (e) {
    throw new Error('Could not save library: ' + (e && e.message));
  }
}

// ── Watch history ("Continue watching") ───────────────────────────────────

function listHistory(file) {
  return loadLibrary(file).history;
}

// Upsert: one entry per imdbId (+type); a replay updates S/E + timestamp
// and moves the entry to the front (most recent first).
function addHistory(file, raw) {
  const entry = normalizeEntry(raw);
  if (!entry) throw new Error('Invalid history entry.');

  const lib = loadLibrary(file);
  const isSeries = entry.type === 'series';

  const rec = {
    ...entry,
    season: isSeries ? normalizeInt(raw.season) || 1 : null,
    episode: isSeries ? normalizeInt(raw.episode) || 1 : null,
    ...playbackFields(raw),
    updatedAt: Date.now()
  };

  lib.history = lib.history.filter(
    (h) => !(h.imdbId === rec.imdbId && h.type === rec.type)
  );
  lib.history.unshift(rec);
  if (lib.history.length > HISTORY_CAP) {
    lib.history.length = HISTORY_CAP;
  }
  saveLibrary(file, lib);
  return listHistory(file);
}

// Patch one entry IN PLACE (no reorder): playback position ticks and
// artwork enrichment both land here. Only whitelisted fields move.
function updateHistoryProgress(file, imdbId, rawPatch) {
  const id = String(imdbId || '').trim();
  const lib = loadLibrary(file);
  const entry = lib.history.find((h) => h.imdbId === id);
  if (!entry) return { patched: false, history: lib.history };

  const patch = playbackFields(rawPatch || {});
  Object.assign(entry, patch);
  saveLibrary(file, lib);
  return { patched: true, history: lib.history };
}

function removeHistory(file, imdbId) {
  const id = String(imdbId || '').trim();
  const lib = loadLibrary(file);
  const before = lib.history.length;
  lib.history = lib.history.filter((h) => h.imdbId !== id);
  const removed = lib.history.length !== before;
  if (removed) saveLibrary(file, lib);
  return { removed, history: lib.history };
}

// ── Watched list (drives the home suggestions) ────────────────────────────

function listWatched(file) {
  return loadLibrary(file).watched;
}

function addWatched(file, raw) {
  const entry = normalizeEntry(raw);
  if (!entry) throw new Error('Invalid watched entry.');

  const lib = loadLibrary(file);
  if (lib.watched.some(
    (w) => w.imdbId === entry.imdbId && w.type === entry.type
  )) {
    return listWatched(file);           // already added — no duplicate
  }

  lib.watched.unshift({
    ...entry,
    genres: Array.isArray(raw.genres)
      ? raw.genres.map((g) => String(g).slice(0, 60)).filter(Boolean).slice(0, 6)
      : [],
    addedAt: Date.now()
  });
  // Watched and Want-to-watch are mutually exclusive
  lib.want = lib.want.filter((w) => w.imdbId !== entry.imdbId);
  saveLibrary(file, lib);
  return listWatched(file);
}

function removeWatched(file, imdbId) {
  const id = String(imdbId || '').trim();
  const lib = loadLibrary(file);
  const before = lib.watched.length;
  lib.watched = lib.watched.filter((w) => w.imdbId !== id);
  const removed = lib.watched.length !== before;
  if (removed) saveLibrary(file, lib);
  return { removed, watched: lib.watched };
}

// ── Want-to-watch list (mutually exclusive with watched) ──────────────

function listWant(file) {
  return loadLibrary(file).want;
}

function addWant(file, raw) {
  const entry = normalizeEntry(raw);
  if (!entry) throw new Error('Invalid want entry.');

  const lib = loadLibrary(file);
  if (lib.want.some(
    (w) => w.imdbId === entry.imdbId && w.type === entry.type
  )) {
    return listWant(file);              // already added — no duplicate
  }

  lib.want.unshift({ ...entry, addedAt: Date.now() });
  // Watched and Want-to-watch are mutually exclusive
  lib.watched = lib.watched.filter((w) => w.imdbId !== entry.imdbId);
  saveLibrary(file, lib);
  return listWant(file);
}

function removeWant(file, imdbId) {
  const id = String(imdbId || '').trim();
  const lib = loadLibrary(file);
  const before = lib.want.length;
  lib.want = lib.want.filter((w) => w.imdbId !== id);
  const removed = lib.want.length !== before;
  if (removed) saveLibrary(file, lib);
  return { removed, want: lib.want };
}

module.exports = {
  HISTORY_CAP,
  loadLibrary, saveLibrary,
  listHistory, addHistory, removeHistory, updateHistoryProgress,
  listWatched, addWatched, removeWatched,
  listWant, addWant, removeWant
};

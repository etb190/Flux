// ── Flux: home-page orchestrator (main process) ──────────────────────────
// Combines the two data sources of the home page:
//
//   Cinemeta addon catalogs  →  Popular / New / Featured movies+series and
//                               Last videos (Helix AddonManager port — the
//                               same rows Helix builds its home from; free,
//                               keyless, no quota)
//   TMDB                     →  "Trending This Week" row (key built in)
//
// Every source fails independently: the page renders whichever rows loaded,
// shows a small notice for sources that failed, and only errors out when
// nothing at all could be loaded. (The Streaming Availability API was
// removed in v0.20.0 — its free tier ran out of quota.)

const catalogs = require('./catalogs.js');
const tmdb = require('./tmdbhome.js');

function pickHero(rows) {
  // Prefer an item that has a backdrop so a hero banner would look right.
  for (const row of rows) {
    const hit = row.items.find((x) => x.backdrop);
    if (hit) return hit;
  }
  for (const row of rows) {
    if (row.items.length) return row.items[0];
  }
  return null;
}

// Returns one of:
//   { error: 'message' }                 — nothing at all loaded
//   { hero, rows, notice? }              — success (notice = partial failure)
async function getHomeData(opts) {
  const tmdbKey = opts && opts.tmdbKey;
  const cacheDir = opts && opts.cacheDir;

  const [catRes, tmdbRes] = await Promise.allSettled([
    catalogs.getHomeData({ cacheDir }),
    tmdb.getTrending({ cacheDir, key: tmdbKey })
  ]);

  const catData = catRes.status === 'fulfilled'
    ? catRes.value
    : { error: String((catRes.reason && catRes.reason.message) || catRes.reason) };
  const tmdbData = tmdbRes.status === 'fulfilled'
    ? tmdbRes.value
    : { items: [], error: String((tmdbRes.reason && tmdbRes.reason.message) || tmdbRes.reason) };

  const rows = [];
  const notices = [];

  // TMDB trending first — it's the "what's hot right now" opener.
  if (tmdbData.items && tmdbData.items.length) {
    rows.push({ key: 'trending', title: 'Trending This Week', items: tmdbData.items });
  } else if (tmdbData.error) {
    notices.push('Trending row unavailable: ' + tmdbData.error);
  }

  // Cinemeta catalog rows (Helix order: Popular → New → Featured → Last).
  if (catData.rows) {
    for (const row of catData.rows) {
      if (row.items && row.items.length) rows.push(row);
    }
    if (catData.notice) notices.push(catData.notice);
  } else if (catData.error) {
    notices.push('Catalog rows unavailable: ' + catData.error);
  }

  if (!rows.length) {
    const firstErr = catData.error || tmdbData.error;
    return { error: firstErr || 'No data available right now.' };
  }

  // Hero: first catalog pick (has backdrop + overview), else best trending.
  const hero = catData.hero || pickHero(rows.filter((r) => r.key !== 'trending')) ||
    pickHero(rows);

  const payload = { hero, rows };
  if (notices.length) payload.notice = notices.join(' ');
  return payload;
}

module.exports = { getHomeData, pickHero };

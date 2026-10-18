#!/usr/bin/env node
/* ── Flux v0.37.0 tests ────────────────────────────────────────────────────
 * 1. Source re-pick resumes where you left off: leaving a video paused for
 *    a while expires the host session, the fail card asks for a new source,
 *    and picking one used to restart at 0:00. The player now feeds its
 *    position up to App (onProgress), and openPlayer carries it into the
 *    next pick for the same title/episode.
 * 2. One-shot silent same-source reload: before fail-carding a fatal error,
 *    the player rebuilds itself once at the last good position (restores
 *    the paused state; guarded so it can never loop).
 */
const fs = require('fs');
const path = require('path');

const { resolveCarrySec } = require('../src/renderer/src/lib/progress.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) { console.error('  FAIL: ' + label); process.exit(1); }
  passed++;
  console.log('  ok ' + passed + ' - ' + label);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('A. resolveCarrySec — the carry decision');
const movie = { id: 'tt0468567', type: 'movie', name: 'The Dark Knight' };
const show = { id: 'tt0411008', type: 'series', name: 'Lost' };
const ep2 = { season: 1, episode: 2, title: 'Pilot' };

ok(resolveCarrySec(null, movie, null) === 0, 'no snapshot → 0 (fresh)');
ok(resolveCarrySec({ imdbId: 'tt0468567', positionSec: 741 }, null, null) === 0, 'no meta → 0');
ok(resolveCarrySec({ imdbId: null, positionSec: 741 }, movie, null) === 0, 'snapshot without an id → 0');
ok(resolveCarrySec({ imdbId: 'tt0468567', positionSec: 741 }, movie, null) === 741,
  'same movie carries the position');
ok(resolveCarrySec({ imdbId: 'tt0468567', positionSec: 741.9 }, movie, null) === 741,
  'fractional positions are floored');
ok(resolveCarrySec({ imdbId: 'tt0468567', positionSec: 5 }, movie, null) === 0,
  '≤5s counts as "just started" → 0');
ok(resolveCarrySec({ imdbId: 'tt0468567', positionSec: 0 }, movie, null) === 0,
  'watched-to-the-end snapshots (pos 0) → fresh start');
ok(resolveCarrySec({ imdbId: 'tt9999999', positionSec: 741 }, movie, null) === 0,
  'different title → 0');

ok(resolveCarrySec({ imdbId: 'tt0411008', season: 1, episode: 2, positionSec: 612 }, show, ep2) === 612,
  'same series episode carries');
ok(resolveCarrySec({ imdbId: 'tt0411008', season: 1, episode: 3, positionSec: 612 }, show, ep2) === 0,
  'different episode → 0 (never leak across episodes)');
ok(resolveCarrySec({ imdbId: 'tt0411008', season: 2, episode: 2, positionSec: 612 }, show, ep2) === 0,
  'different season → 0');
ok(resolveCarrySec({ imdbId: 'tt0411008', season: 1, episode: 1, positionSec: 612 }, show, {}) === 612,
  'episode object without S/E defaults to S1E1 matching');

console.log('B. App wiring — snapshot flows to openPlayer');
const app = read('src/renderer/src/App.jsx');
ok(/import \{ resolveCarrySec \} from '\.\/lib\/progress\.js';/.test(app), 'App imports resolveCarrySec');
ok(/playerProgressRef = useRef\(null\)/.test(app), 'playerProgressRef exists');
ok(/const handlePlayerProgress = useCallback\(\(p\) => \{\s*\n\s*playerProgressRef\.current = p;/.test(app),
  'onProgress handler stores the snapshot');
ok(/onProgress=\{handlePlayerProgress\}/.test(app), 'PlayerView receives onProgress');
ok(/const carrySec = resolveCarrySec\(playerProgressRef\.current, meta, episode\);/.test(app),
  'openPlayer computes the carry from the snapshot');
ok(/setResumeSec\(carrySec\);/.test(app), 'openPlayer seeds the player resume target');
ok(/positionSec: carrySec,/.test(app), 'history entry keeps the carried position');

console.log('C. App wiring — the carry only survives the source-switch flow');
ok(/playerProgressRef deliberately KEPT/.test(app), 'changeSourceFromPlayer keeps the snapshot');
ok(/const closePlayer = useCallback\(\(\) => \{[\s\S]*?playerProgressRef\.current = null;/.test(app),
  'closePlayer clears the snapshot');
ok(/const pickEpisodeFromPlayer = useCallback\(\(ep\) => \{[\s\S]*?playerProgressRef\.current = null;/.test(app),
  'episode switch clears the snapshot');
ok(/const openDetails = useCallback\(async \(item, from\) => \{\s*\n\s*const seq[\s\S]*?playerProgressRef\.current = null;/.test(app),
  'opening a new title clears the snapshot');
ok(/playerProgressRef\.current = null;\s*\n\s*playOriginRef\.current = 'details';\s*\n\s*setResumeSec\(0\);\s*\n\s*let url = null;/.test(app),
  'trailer sessions clear the snapshot');

console.log('D. PlayerView — position feed');
const pv = read('src/renderer/src/components/PlayerView.jsx');
ok(/function PlayerView\(\{[^}]*onProgress[,}]/.test(pv), 'PlayerView takes onProgress');
ok(/onProgressRef = useRef\(onProgress\)/.test(pv), 'onProgress kept in a ref (no stale closures)');
ok(/if \(onProgressRef\.current\) \{\s*\n\s*onProgressRef\.current\(\{\s*\n\s*imdbId: \(meta && meta\.id\) \|\| null,\s*\n\s*season: episode \? \(episode\.season \?\? 1\) : null,\s*\n\s*episode: episode \? \(episode\.episode \?\? 1\) : null,/.test(pv),
  'saveProgress reports imdbId + season/episode + position');
ok(/\}, \[meta, episode\]\);/.test(pv), 'saveProgress tracks episode changes');

console.log('E. PlayerView — one-shot silent reload before the fail card');
ok(/const tryStaleReload = useCallback\(\(\) => \{[\s\S]*?if \(isEmbed \|\| isTrailer\) return false;/.test(pv),
  'reload never touches embeds/trailers');
ok(/if \(staleReloadUsedRef\.current\) return false;/.test(pv), 'guarded to ONE attempt per source');
ok(/if \(!playedOnceRef\.current\) return false;/.test(pv), 'never-played sources go straight to the fail card');
ok(/staleReloadUsedRef\.current = true;\s*\n\s*wasPausedOnReloadRef\.current = Boolean\(v\.paused\);/.test(pv),
  'reload remembers the paused state');
ok(/resumeSecRef\.current = Math\.floor\(v\.currentTime\);/.test(pv), 'reload reuses the resume seek at the last position');
ok(/setReloadNonce\(\(n\) => n \+ 1\);/.test(pv), 'reload re-runs the open effect via a nonce');

const hlsIdx = pv.indexOf("if (tryStaleReload()) return;");
const hostFailIdx = pv.indexOf("showPlayerFail('The stream host refused the request");
const mediaFailIdx = pv.indexOf("showPlayerFail('Playback failed");
ok(hlsIdx > -1 && hlsIdx < hostFailIdx, 'hls fatal error → reload attempted BEFORE the fail card');
ok(pv.indexOf('if (tryStaleReload()) return;             // one silent rebuild first') > -1 &&
   pv.indexOf('if (tryStaleReload()) return;             // one silent rebuild first') < mediaFailIdx,
  'video:error → reload attempted BEFORE the fail card');

ok(/if \(prevSourceRef\.current !== source\) \{\s*\n\s*prevSourceRef\.current = source;\s*\n\s*staleReloadUsedRef\.current = false;\s*\n\s*\}/.test(pv),
  'reload budget re-arms ONLY on a genuinely new source (no reload loops)');
ok(/\}, \[source, reloadNonce, tryStaleReload\]\);/.test(pv), 'open effect depends on the reload nonce');
ok(/if \(!wasPausedOnReloadRef\.current\) video\.play\(\)\.catch\(\(\) => \{\}\);/.test(pv),
  'a paused recovery reload does NOT autoplay');
ok(/if \(wasPausedOnReloadRef\.current\) \{\s*\n\s*wasPausedOnReloadRef\.current = false;\s*\n\s*try \{ v\.pause\(\); \} catch \(_err\) \{\}/.test(pv),
  'after the reload seek the video returns to paused');
ok(/art\.on\('video:seeked'[\s\S]*?clearTimeout\(failTimerRef\.current\);[\s\S]*?setBuffering\(false\);[\s\S]*?updatePresenceRef\.current\(\);[\s\S]*?\}\);/.test(pv),
  'completed seek disarms the 25s dead-host timer + clears the buffering veil (paused reload never emits video:playing)');

console.log('\nALL ' + passed + ' ASSERTIONS PASSED');

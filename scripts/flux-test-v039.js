#!/usr/bin/env node
/* ── Flux v0.39.0 tests ────────────────────────────────────────────────────
 * "Resuming from home screen never ever works" — the death chain:
 *   1. Continue-watching opens the SAVED source URL, but host sessions
 *      expire → after an app restart it is always dead.
 *   2. The 25s fail card fired ("timed out very quickly... source is
 *      corrupted" per the user) → connecting streams are NEVER failed on
 *      a timer now; a resumed saved source gets a generous 90s deadline
 *      that falls back AUTOMATICALLY to a fresh sources scan.
 *   3. Re-picking a fresh source restarted at 0:00 — the carry snapshot
 *      only fills from the player's 8s tick (currentTime ≥ 3), which
 *      never happens on a dead stream. resumeHistory now SEEDS the carry
 *      from the history entry.
 *   4. Worse: openPlayer's history write stamped positionSec 0 over the
 *      saved entry, DESTROYING the stored resume point ("never ever
 *      works"). The seeded carry makes the write carry-correct.
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

const app = read('src/renderer/src/App.jsx');
const pv = read('src/renderer/src/components/PlayerView.jsx');

console.log('A. resolveCarrySec — the seeded snapshot carries (carry engine reused)');
const movie = { id: 'tt0468567', type: 'movie', name: 'The Dark Knight' };
const seededMovie = { imdbId: 'tt0468567', season: null, episode: null, positionSec: 741, durationSec: 9000, at: 1 };
ok(resolveCarrySec(seededMovie, movie, null) === 741, 'seeded movie snapshot carries');
ok(resolveCarrySec(seededMovie, movie, { title: 'x', season: 1, episode: 1 }) === 741,
  'movie carry ignores the S1E1 episode placeholder built by openScanForEntry');
const show = { id: 'tt0411008', type: 'series', name: 'Lost' };
const seededEp = { imdbId: 'tt0411008', season: 1, episode: 2, positionSec: 612, durationSec: 2520, at: 1 };
ok(resolveCarrySec(seededEp, show, { season: 1, episode: 2, title: 'Pilot' }) === 612,
  'seeded series snapshot carries for the same episode');
ok(resolveCarrySec(seededEp, show, { season: 1, episode: 3, title: 'other' }) === 0,
  'seeded series snapshot never leaks across episodes');
ok(resolveCarrySec({ imdbId: 'tt0468567', season: null, episode: null, positionSec: 0 }, movie, null) === 0,
  'watched-to-end snapshot (pos 0) still restarts fresh');

console.log('B. resumeHistory seeds the carry from the history entry');
ok(/playerProgressRef\.current = \{\s*\n\s*imdbId: entry\.imdbId,/.test(app),
  'snapshot seeded from the entry (imdbId)');
ok(/season: entry\.type === 'series' \? \(entry\.season \?\? 1\) : null,/.test(app),
  'series season seeded (null for movies — matches the onProgress shape)');
ok(/positionSec: entry\.positionSec \|\| 0,/.test(app), 'saved position seeded');
ok(/durationSec: entry\.durationSec \|\| null,/.test(app), 'duration seeded (progress bar %)');
ok(/Seed the carry snapshot/.test(app) && /snapshot never fires on a stream that\s*\n\s*\/\/ never played/.test(app),
  'design comment on file (why seeding is required)');
ok(/durationSec: entry\.durationSec \|\| null,\s*\n\s*sourceUrl: entry\.sourceUrl/.test(app),
  'resume history bump passes durationSec through (no accidental drop)');

console.log('C. openPlayer no longer destroys the stored position');
ok(/positionSec: carrySec,\s*\n\s*durationSec: \(playerProgressRef\.current &&\s*\n\s*playerProgressRef\.current\.durationSec\) \|\| null,/.test(app),
  'historyAdd writes the CARRIED position + duration (not 0 over the saved spot)');

console.log('D. dead-source fallback — resumed player falls back to a fresh scan');
ok(/const openScanForEntry = useCallback\(\(entry\) => \{/.test(app), 'openScanForEntry exists');
ok(/if \(!entry \|\| !entry\.imdbId\) return false;/.test(app), 'guards entries without an id');
ok(/type: entry\.type \|\| 'movie',\s*\n\s*id: entry\.imdbId,/.test(app),
  'pseudo-meta built from the entry (meta may not have landed yet)');
ok(/subs\.resetForEpisode\(\);\s*\n\s*streams\.reset\(\);\s*\n\s*startScanFor\(m, ep\);\s*\n\s*setView\('sources'\);/.test(app),
  'fallback resets subs + scan, starts a fresh scan, lands on the sources view');
ok(/setActiveSource\(null\);/.test(app.split('openScanForEntry = useCallback')[1].split('}, [streams, subs, startScanFor]);')[0]),
  'fallback closes the dead player');
ok(/detailsReturnRef\.current = 'home';/.test(app.split('openScanForEntry = useCallback')[1].split('}, [streams, subs, startScanFor]);')[0]),
  'backing out of the fallback scan lands home (not a sparse details page)');
ok(/const handleSourceDead = useCallback\(\(\) => \{[\s\S]*?resumeEntryRef\.current;/.test(app),
  'handleSourceDead reads the resume entry');
ok(/if \(meta\) \{[\s\S]*?openSources\(meta\.type === 'series'[\s\S]*?return true;\s*\n\s*\}\s*\n\s*return openScanForEntry\(entry\);/.test(app),
  'real meta (background load landed) reuses the standard change-source flow; else entry-built scan');
ok(/return true;/.test(app.split('handleSourceDead = useCallback')[1].split('}, [meta, openSources, openScanForEntry]);')[0]),
  'returns true when handled (player must not fail-card)');

console.log('E. PlayerView — onSourceDead wiring + no more connect timeouts');
ok(/onSourceDead, staleTimeoutMs/.test(pv), 'PlayerView takes onSourceDead + staleTimeoutMs');
ok(!/25000/.test(pv), 'the 25s dead-host timer is GONE (never fail a connecting stream on a timer)');
ok(!/'Timed out while contacting the stream host\.';/.test(pv.split('staleTimeoutMs > 0')[0]),
  'no timeout fail card exists before the (resume-only) deadline block');
ok(/if \(staleTimeoutMs > 0\) \{[\s\S]*?if \(playedOnceRef\.current\) return;\s*\/\/ it came alive[\s\S]*?if \(onSourceDead && onSourceDead\(\)\) return;\s*\/\/ resume → fresh scan[\s\S]*?showPlayerFail\('Timed out while contacting the stream host\.'\);\s*\n\s*\}, staleTimeoutMs\);/.test(pv),
  'deadline block: resume-only, disarmed by first playback, falls back to the scan');
ok(/onSourceDead={handleSourceDead}/.test(app), 'App wires onSourceDead');
ok(/staleTimeoutMs=\{resumeEntryRef\.current \? RESUME_FALLBACK_MS : null\}/.test(app),
  'only resume sessions get a deadline (fresh picks wait forever)');
ok(/const RESUME_FALLBACK_MS = 90000;/.test(app), 'resume fallback deadline is a generous 90s');

console.log('F. All stream-death paths route through the fallback before fail-carding');
const paths = [
  ['hls fatal', /if \(tryStaleReload\(\)\) return;\s*\n\s*if \(onSourceDead && onSourceDead\(\)\) return;\s*\n\s*showPlayerFail\('The stream host refused the request/],
  ['video:error', /if \(tryStaleReload\(\)\) return;\s*\/\/ one silent rebuild first\s*\n\s*if \(onSourceDead && onSourceDead\(\)\) return;[^\n]*\n\s*showPlayerFail\('Playback failed/],
  ['stall watchdog', /if \(tryStaleReload\(\)\) return;\s*\n\s*if \(onSourceDead && onSourceDead\(\)\) return;[^\n]*\n\s*showPlayerFail\('The stream stopped responding mid-playback/]
];
for (const [name, re] of paths) ok(re.test(pv), name + ': rebuild → fallback → fail card');
ok(/showPlayerFail\('DASH streams aren/.test(pv), 'config errors (DASH) still fail-card instantly (no scan flash)');

console.log('G. changeSourceFromPlayer — no more silent no-op before meta lands');
ok(/const entry = resumeEntryRef\.current;\s*\/\/ captured before clearing/.test(app),
  'resume entry captured before it is cleared');
ok(/openScanForEntry\(entry\);\s*\n\s*\}, \[meta, episode, openSources, openScanForEntry\]\);/.test(app),
  'meta-less Change source falls back to the entry-built scan');

console.log('\n' + passed + '/' + passed + ' assertions passed');

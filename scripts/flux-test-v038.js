#!/usr/bin/env node
/* ── Flux v0.38.0 tests ────────────────────────────────────────────────────
 * Playback stall fix: watching along, video suddenly stops, the spinner
 * spins forever and no amount of waiting moves it on. Two holes plugged:
 *   1. Silent stalls (host hangs the connection / caps the byte range) fire
 *      NO fatal error — a watchdog now detects "playing but frozen" and
 *      does the same one-shot silent rebuild at the current position
 *      before fail-carding.
 *   2. The video:error guard (readyState >= 2) swallowed the
 *      connection-death error fired in the buffering-starved state
 *      (HAVE_CURRENT_DATA = 2) — the bar is now HAVE_FUTURE_DATA (3).
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
function ok(cond, label) {
  if (!cond) { console.error('  FAIL: ' + label); process.exit(1); }
  passed++;
  console.log('  ok ' + passed + ' - ' + label);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const pv = read('src/renderer/src/components/PlayerView.jsx');

console.log('A. Watchdog constants');
ok(/const STALL_WATCHDOG_MS = 15000;/.test(pv), 'STALL_WATCHDOG_MS = 15s (frozen stream = dead)');
ok(/const STALL_SWEEP_MS = 4000;/.test(pv), 'sweep runs every 4s (fires well inside the window)');
ok(/stallTimerRef = useRef\(null\)/.test(pv), 'watchdog timer lives in a ref (clearable on teardown)');

console.log('B. Watchdog wiring inside the open effect');
ok(/let stallPos = -1;\s*\n\s*let stallPosAt = Date\.now\(\);/.test(pv),
  'anchor: last position + when it was seen');
ok(/art\.on\('video:timeupdate', \(\) => \{[\s\S]*?Math\.abs\(t - stallPos\) > 0\.4[\s\S]*?stallPosAt = Date\.now\(\);/.test(pv),
  'every advancing timeupdate (>0.4s) refreshes the anchor');
ok(/stallPosAt = Date\.now\(\);\s*\/\/ fresh watchdog anchor on resume/.test(pv),
  'video:playing re-anchors (unpause never looks like an instant stall)');
ok(/stallTimerRef\.current = setInterval\(\(\) => \{[\s\S]*?\}, STALL_SWEEP_MS\);/.test(pv),
  'stall sweep interval installed');

console.log('C. Watchdog trip conditions');
const sweep = /stallTimerRef\.current = setInterval\(\(\) => \{([\s\S]*?)\}, STALL_SWEEP_MS\);/.exec(pv)[1];
ok(/if \(!v\) return;/.test(sweep), 'no video → skip');
ok(/if \(isEmbed \|\| isTrailer\) return;/.test(sweep), 'embeds/trailers are webview-opaque → skip');
ok(/if \(!playedOnceRef\.current \|\| failMsgRef\.current\) return;/.test(sweep),
  'only streams that PROVED alive are supervised; fail card wins');
ok(/if \(v\.paused \|\| v\.ended\) \{ stallPosAt = Date\.now\(\); return; \}/.test(sweep),
  'paused/ended keeps the anchor fresh (never trips on an intentional pause)');
ok(/if \(Date\.now\(\) - stallPosAt < STALL_WATCHDOG_MS\) return;/.test(sweep),
  'trip only after 15s of zero progress while "playing"');
ok(/if \(tryStaleReload\(\)\) return;/.test(sweep),
  'confirmed stall → one-shot silent rebuild at the current position first');
ok(/showPlayerFail\('The stream stopped responding mid-playback/.test(sweep),
  'rebuild budget spent → honest fail card (pick another source)');

console.log('D. video:error guard — starved state no longer swallows the error');
ok(/v\.readyState >= 3\) return;/.test(pv),
  'transient hiccup bar is HAVE_FUTURE_DATA (3): data still flowing ahead');
ok(!/v\.readyState >= 2\) return;/.test(pv),
  'old HAVE_CURRENT_DATA (2) bar is gone (it ate the connection-death error)');
ok(/HAVE_CURRENT_DATA \(2\) is the buffering-starved state/.test(pv), 'regression note on file');

console.log('E. Teardown');
ok(/clearInterval\(stallTimerRef\.current\);/.test(pv), 'watchdog interval cleared on close/reload');
ok(/clearTimeout\(failTimerRef\.current\);\s*\n\s*failTimerRef\.current = null;\s*\n\s*clearInterval\(stallTimerRef\.current\);/.test(pv),
  'teardown order: fail timer + stall timer before hls/art destroy');

console.log('F. Rebuild-on-stall is position-preserving (v0.37 machinery reused)');
ok(/resumeSecRef\.current = Math\.floor\(v\.currentTime\);/.test(pv),
  'tryStaleReload carries the exact stall position into the reload');
ok(/wasPausedOnReloadRef\.current = Boolean\(v\.paused\);/.test(pv),
  'reload restores the paused state');
ok(/staleReloadUsedRef\.current = true;/.test(pv),
  'one attempt per source instance (can never loop)');

console.log('G. Housekeeping');
ok(!/STALL_WATCHDOG_MS = \d{6}/.test(pv), 'watchdog window is seconds, not an accidental 100s+');
ok(pv.includes('mid-play stall watchdog'), 'design comment on file');

console.log('\n' + passed + '/' + passed + ' assertions passed');

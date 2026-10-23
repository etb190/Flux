#!/usr/bin/env node
/* ── Flux v0.40.0 tests ────────────────────────────────────────────────────
 * Manual "Reload source" button (top bar, right of Change source, and on
 * the fail card): rebuilds EVERYTHING from scratch — hls.js, Artplayer,
 * the <video> element, buffers, retry budgets, timers — on the SAME source
 * and seeks back to the exact position we were on, restoring the paused /
 * playing state. The user-facing escape hatch when resume or unpause goes
 * stale and the automatic one-shot rescue is already spent.
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
const icons = read('src/renderer/src/components/icons.jsx');
const pkg = JSON.parse(read('package.json'));

// Extract the reloadSource callback body (up to its dependency array)
const cbStart = pv.indexOf('const reloadSource = useCallback(() => {');
const cbEnd = pv.indexOf('}, [isEmbed, isTrailer]);', cbStart);
const reloadBody = cbStart >= 0 && cbEnd > cbStart ? pv.slice(cbStart, cbEnd) : '';

console.log('A. ReloadIcon');
ok(/export function ReloadIcon\(\{ size = 16 \}\)/.test(icons), 'ReloadIcon exported (16px, house default)');
ok(/M17\.65 6\.35A7\.958 7\.958 0 0 0 12 4c-4\.42 0/.test(icons), 'MD refresh glyph (circular arrow)');
ok(/import \{ BackIcon, SwitchIcon, ReloadIcon, ListIcon/.test(pv), 'PlayerView imports ReloadIcon');

console.log('B. reloadSource callback — same source, same point, clean slate');
ok(cbStart >= 0 && cbEnd > cbStart, 'reloadSource defined as a useCallback');
ok(/if \(isEmbed \|\| isTrailer\) return;/.test(reloadBody), 'embeds/trailers are a no-op (nothing to rebuild)');
ok(/now - lastReloadClickRef\.current < 400\) return;/.test(reloadBody), '400ms double-click guard (no accidental double rebuilds)');
ok(/lastReloadClickRef\.current = now;/.test(reloadBody), 'guard anchor recorded');
ok(/resumeSecRef\.current = Math\.floor\(Math\.max\(0, v\.currentTime\)\);/.test(reloadBody),
  'captures the EXACT current position into resumeSecRef (tryResumeSeek reapplies it)');
ok(/wasPausedOnReloadRef\.current = Boolean\(v\.paused\);/.test(reloadBody),
  'captures paused state (reload stays paused / resumes playing as it was)');
ok(/if \(v && Number\.isFinite\(v\.currentTime\) && v\.currentTime >= 3\)/.test(reloadBody),
  'position capture is guarded (no video element yet → still rebuilds; v0.41: only positions >= 3s, so a connecting resume never erases its pending target)');
ok(reloadBody.indexOf('saveProgressRef.current()') >= 0, 'progress saved before the rebuild (history keeps the resume point)');
ok(reloadBody.indexOf('saveProgressRef.current()') < reloadBody.indexOf('setReloadNonce'),
  'progress save happens BEFORE the teardown is scheduled');
ok(/staleReloadUsedRef\.current = false;/.test(reloadBody), 'RE-ARMS the automatic one-shot rescue for the fresh attempt');
ok(/setBuffering\(true\);/.test(reloadBody), 'buffering veil goes up immediately');
ok(/setReloadNonce\(\(n\) => n \+ 1\);/.test(reloadBody), 'nonce bump re-runs the open effect (full teardown + rebuild)');
ok(!/playedOnceRef/.test(reloadBody), 'NOT gated on playedOnce — works even if the stream never started');
ok(!/return false/.test(reloadBody), 'no one-shot guard — unlimited clicks by design (each is explicit intent)');

console.log('C. "Clearing everything" — the open effect teardown the nonce re-runs');
ok(/return \(\) => \{[\s\S]*?const hls = hlsRef\.current;[\s\S]*?hls\.destroy\(\)[\s\S]*?art\.destroy\(true\)[\s\S]*?\};/.test(pv),
  'cleanup destroys hls.js AND Artplayer + <video> (zero stale buffers/state)');
ok(/\}, \[source, reloadNonce, tryStaleReload\]\);/.test(pv), 'open effect depends on reloadNonce (bump = rebuild)');

console.log('D. Top bar button — right of Change source');
const switchIdx = pv.indexOf('data-testid="player-switch"');
const reloadIdx = pv.indexOf('data-testid="player-reload"');
ok(switchIdx >= 0 && reloadIdx > switchIdx, 'rendered AFTER the Change source button in the top bar');
ok(/\{!isEmbed && !isTrailer \? \(\s*\n\s*<button\s*\n\s*data-testid="player-reload"/.test(pv),
  'hidden for embeds/trailers (guard matches the reload no-op)');
ok(/data-testid="player-reload"[\s\S]{0,220}onClick=\{reloadSource\}/.test(pv), 'wired to reloadSource');
ok(/data-testid="player-reload"[\s\S]{0,400}<ReloadIcon \/>\s*\n\s*<span>Reload source<\/span>/.test(pv),
  'icon + visible label "Reload source"');
ok(/data-testid="player-reload"[\s\S]{0,220}title="Rebuild this source from scratch at the current position"/.test(pv),
  'tooltip explains what it does');

console.log('E. Fail card button');
const failReloadIdx = pv.indexOf('data-testid="player-fail-reload"');
ok(failReloadIdx > 0, 'fail card carries a Reload source button');
ok(pv.indexOf('data-testid="player-fail-sources"') < failReloadIdx &&
   failReloadIdx < pv.indexOf('data-testid="player-fail-back"'),
  'ordered between "Pick another source" and "Go back"');
ok(/data-testid="player-fail-reload"[\s\S]{0,200}onClick=\{reloadSource\}/.test(pv),
  'same handler — manual recovery straight from the fail card');
ok(/data-testid="player-fail-reload"[\s\S]{0,400}<span>Reload source<\/span>|data-testid="player-fail-reload"[\s\S]{0,400}>\s*Reload source\s*<\/button>/.test(pv),
  'labeled "Reload source"');

console.log('F. Housekeeping');
const vMinor = parseInt((pkg.version || '').split('.')[1], 10);
ok(Number.isFinite(vMinor) && vMinor >= 40, 'package.json version carries the reload-source feature (>= 0.40)');
ok(/export function SwitchIcon/.test(icons) && /export function BackIcon/.test(icons) &&
   /export function ListIcon/.test(icons), 'existing icons untouched');

console.log('\nflux-test-v040: ' + passed + '/' + passed + ' PASS');

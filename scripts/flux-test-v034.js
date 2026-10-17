#!/usr/bin/env node
/* ── Flux v0.34.0 verification ────────────────────────────────────────────
 * 1. Subtitle menu order: English, French, Arabic, Italian, Spanish
 *    (external provider groups in main + embedded HLS tracks in renderer).
 * 2. Spurious fail card gone: video:error ignores aborted/alive-stream
 *    errors; hls.js fatal media/network errors get retry budgets instead of
 *    an instant fail card.
 * 3. Fail card "Pick another source" opens the SOURCES screen (not onBack),
 *    with a separate "Go back" button.
 * 4. Window size/position persistence (windowState.js + main wiring).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
function ok(cond, label) {
  if (!cond) { console.error('  FAIL: ' + label); process.exit(1); }
  passed++;
  console.log('  ok ' + passed + ' - ' + label);
}
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

console.log('A. subtitle menu order (main — external provider groups)');
const subs = require('../src/main/subtitles.js');
ok(JSON.stringify(subs.SUB_LANG_ORDER) === '["en","fr","ar","it","es"]', 'SUB_LANG_ORDER = en, fr, ar, it, es');
const v = (lang, url) => ({ language: lang, downloadUrl: url });
const groups = subs.groupVariantsByLanguage([
  v('Spanish', 'u1'), v('Arabic', 'u2'), v('English', 'u3'),
  v('Italian', 'u4'), v('French', 'u5'), v('English', 'u3') // dupe URL
]);
ok(JSON.stringify(groups.map((g) => g.language)) ===
   JSON.stringify(['English', 'French', 'Arabic', 'Italian', 'Spanish']),
   'groups ordered English, French, Arabic, Italian, Spanish (alphabetical was Arabic first)');
ok(subs.subLangOrderIndex('en-US') === 0 && subs.subLangOrderIndex('French') === 1 &&
   subs.subLangOrderIndex('ara') === 2 && subs.subLangOrderIndex('it') === 3 &&
   subs.subLangOrderIndex('es-419') === 4, 'order index via names AND codes (regional variants collapse)');
ok(subs.subLangOrderIndex('Unknown') === 5 && subs.subLangOrderIndex(null) === 5, 'non-whitelisted sorts last');
const groupsUnknown = subs.groupVariantsByLanguage([v('Unknown', 'u6'), v('Spanish', 'u7')]);
ok(groupsUnknown[0].language === 'Spanish' && groupsUnknown[1].language === 'Unknown', 'Unknown bucket after the whitelist');

console.log('B. subtitle menu order (renderer — embedded HLS tracks)');
const sp = read('../src/renderer/src/lib/subsParser.js');
ok(/export const SUB_MENU_ORDER = \['English', 'French', 'Arabic', 'Italian', 'Spanish'\]/.test(sp), 'renderer SUB_MENU_ORDER matches the main order');
ok(/export function subMenuOrderIndex/.test(sp), 'subMenuOrderIndex exported');
const us = read('../src/renderer/src/hooks/useSubtitles.js');
ok(/subMenuOrderIndex\(a\.name\) - subMenuOrderIndex\(b\.name\)/.test(us), 'embedded tracks sorted by the menu order');

console.log('C. spurious fail card while playback is fine');
const pv = read('../src/renderer/src/components/PlayerView.jsx');
ok(/const code = v\.error && v\.error\.code;\s*\n\s*if \(code === 1\) return;/.test(pv), 'video:error ignores MEDIA_ERR_ABORTED (benign load switch)');
ok(/if \(!v\.paused && !v\.ended && v\.readyState >= 2\) return;/.test(pv), 'video:error never fails a stream that is still playing');
ok(/if \(hlsMediaRetries\+\+ < 3\)/.test(pv), 'fatal MEDIA errors get up to 3 recoverMediaError retries');
ok(/if \(hlsNetRetries\+\+ < 2\)/.test(pv), 'fatal NETWORK errors get up to 2 startLoad retries');
ok(/hlsMediaRetries = 0;[\s\S]*?hlsNetRetries = 0;/.test(pv), 'retry budgets reset when playback resumes (video:playing)');
ok(/if \(!data \|\| !data\.fatal\) return;/.test(pv), 'non-fatal hls errors still ignored');

console.log('D. fail card routes: sources screen vs back');
ok(/data-testid="player-fail-sources"\s*\n\s*onClick=\{onChangeSource \|\| onBack\}/.test(pv), '"Pick another source" opens the sources screen (onChangeSource)');
ok(/data-testid="player-fail-back"\s*\n\s*onClick=\{onBack\}/.test(pv), 'separate "Go back" button keeps the origin-aware return');
ok(pv.includes('Go back'), 'secondary button labeled "Go back"');

console.log('E. window state persistence');
const wsMod = require('../src/main/windowState.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-ws-'));
const file = path.join(tmp, 'window-state.json');
ok(wsMod.loadWindowState(file) === null, 'missing file loads as null');
fs.writeFileSync(file, '{corrupt');
ok(wsMod.loadWindowState(file) === null, 'corrupt file loads as null');
const disp = () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } });
let s = wsMod.sanitizeWindowState(null, disp);
ok(s.width === 1280 && s.height === 820 && !s.maximized && s.x === undefined, 'null state → 1280x820 defaults, centered');
s = wsMod.sanitizeWindowState({ width: 1600, height: 900, x: 100, y: 80, maximized: true }, disp);
ok(s.width === 1600 && s.height === 900 && s.x === 100 && s.y === 80 && s.maximized === true, 'valid on-screen bounds kept verbatim');
s = wsMod.sanitizeWindowState({ width: 1600, height: 900, x: 5000, y: 80 }, disp);
ok(s.x === undefined && s.y === undefined && s.width === 1600, 'off-screen position dropped, size kept (unplugged monitor)');
s = wsMod.sanitizeWindowState({ width: 'abc', height: -3, x: 'x', maximized: 'yes' }, disp);
ok(s.width === 1280 && s.height === 820 && s.x === undefined && s.maximized === true, 'garbage values sanitized, truthy maximized kept');
ok(wsMod.saveWindowState(file, {
  getNormalBounds: () => ({ width: 1500, height: 850, x: 40, y: 30 }),
  isMaximized: () => true
}) === true, 'save writes successfully');
const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
ok(saved.width === 1500 && saved.height === 850 && saved.x === 40 && saved.y === 30 && saved.maximized === true,
   'saved NORMAL bounds (not maximized bounds) + maximized flag');
const idx = read('../src/main/index.js');
ok(/require\('\.\/windowState\.js'\)/.test(idx), 'main imports windowState');
ok(/screen\.getDisplayMatching\(b\)\.workArea/.test(idx), 'bounds validated against real displays');
ok(/win\.on\('resize', queueSaveWinState\);/.test(idx) && /win\.on\('move', queueSaveWinState\);/.test(idx) && /win\.on\('close', \(\) =>/.test(idx), 'resize/move (debounced) + close all persist');
ok(/if \(ws\.maximized\) win\.maximize\(\);/.test(idx), 'maximized flag restored after create');
ok(/width: ws\.width,\n    height: ws\.height,\n    \.\.\.\(ws\.x != null \? \{ x: ws\.x, y: ws\.y \} : \{\}\),/.test(idx), 'BrowserWindow prefilled from saved bounds (position optional)');

console.log('\nALL ' + passed + ' ASSERTIONS PASSED');

#!/usr/bin/env node
/* ── Flux v0.41.0 tests ────────────────────────────────────────────────────
 * 1. Subtitle MEMORY: the last user choice persists (userData/flux-subs.json)
 *    and re-applies automatically across episodes of a show and across
 *    resumes — exact external file when offered again, else the remembered
 *    language (external first, embedded fallback). 'off' is remembered too.
 * 2. Reload source position fix: hitting Reload while a resumed stream is
 *    still connecting / pre-resume-seek used to capture currentTime ~0 and
 *    ERASE the pending resume target (restart from 0:00). Now a meaningful
 *    position (>= 3s) is captured; otherwise the pending target is kept.
 * 3. Carry hardening: progress snapshots fired before resume-meta lands keep
 *    the title id (lastImdbIdRef) instead of nulling it.
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
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const pv = read('src/renderer/src/components/PlayerView.jsx');
const hook = read('src/renderer/src/hooks/useSubtitles.js');
const mainIdx = read('src/main/index.js');
const preload = read('src/preload/index.js');
const pkg = JSON.parse(read('package.json'));

console.log('A. subsMemory module (real file unit tests)');
const memMod = require('../src/main/subsMemory.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-subs-test-'));
const memFile = path.join(tmpDir, 'flux-subs.json');

ok(JSON.stringify(memMod.loadSubsMemory(memFile)) === '{"titles":{},"last":null}',
  'missing file → empty memory {titles:{}, last:null}');

memMod.recordSubsChoice(memFile, 'tt1111111', { kind: 'external', language: 'English', url: 'https://x/sub.srt' });
let mem = memMod.loadSubsMemory(memFile);
ok(mem.titles.tt1111111 && mem.titles.tt1111111.kind === 'external' &&
   mem.titles.tt1111111.language === 'English' && mem.titles.tt1111111.url === 'https://x/sub.srt',
  'external choice stored under the title key (language + exact url)');
ok(mem.last && mem.last.language === 'English', 'same choice mirrored as global last');

memMod.recordSubsChoice(memFile, null, { kind: 'external', language: 'Arabic', url: 'https://y/a.srt' });
mem = memMod.loadSubsMemory(memFile);
ok(!mem.titles.null && mem.titles.tt1111111.language === 'English' &&
   mem.last.language === 'Arabic',
  'choice without a title id lands in last only (per-title untouched)');

memMod.recordSubsChoice(memFile, 'tt2222222', { kind: 'embedded', language: 'Spanish' });
mem = memMod.loadSubsMemory(memFile);
ok(mem.titles.tt2222222.kind === 'embedded' && mem.titles.tt2222222.language === 'Spanish' &&
   mem.titles.tt2222222.url === undefined,
  'embedded choice: language kept, no url required');

memMod.recordSubsChoice(memFile, 'tt2222222', { kind: 'off' });
mem = memMod.loadSubsMemory(memFile);
ok(mem.titles.tt2222222.kind === 'off' && mem.titles.tt2222222.language === undefined,
  "'off' remembered (last action wins), language stripped");

memMod.recordSubsChoice(memFile, 'tt3333333', { kind: 'wat', language: 'English' });
mem = memMod.loadSubsMemory(memFile);
ok(!mem.titles.tt3333333, 'invalid kind rejected');
memMod.recordSubsChoice(memFile, 'tt3333333', { kind: 'external', language: '' });
mem = memMod.loadSubsMemory(memFile);
ok(!mem.titles.tt3333333, 'empty language rejected');
memMod.recordSubsChoice(memFile, 'not-an-id', { kind: 'external', language: 'English' });
mem = memMod.loadSubsMemory(memFile);
ok(mem.last.language === 'English' && !Object.keys(mem.titles).includes('not-an-id'),
  'non-tt title keys never pollute the per-title map');

fs.writeFileSync(memFile, '{corrupt json', 'utf8');
ok(JSON.stringify(memMod.loadSubsMemory(memFile)) === '{"titles":{},"last":null}',
  'corrupt file → defaults (no crash)');

fs.writeFileSync(memFile, JSON.stringify({
  titles: { tt4444444: { kind: 'bogus' }, tt5555555: { kind: 'external', language: 'French', url: 'https://z/f.srt' } },
  last: { kind: 'nope' }
}), 'utf8');
mem = memMod.loadSubsMemory(memFile);
ok(!mem.titles.tt4444444 && mem.titles.tt5555555.language === 'French' && mem.last === null,
  'load sanitizes: invalid entries dropped, valid ones kept');

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('B. IPC wiring (main + preload)');
ok(/const subsMemory = require\('\.\/subsMemory\.js'\);/.test(mainIdx), 'main requires subsMemory.js');
ok(/flux-subs\.json/.test(mainIdx), 'memory file is userData/flux-subs.json');
ok(/ipcMain\.handle\('flux:subs:memory:get', \(\) => subsMemory\.loadSubsMemory\(subsMemoryFile\(\)\)\)/.test(mainIdx),
  'GET handler → loadSubsMemory');
ok(/ipcMain\.handle\('flux:subs:memory:set'[\s\S]{0,120}subsMemory\.recordSubsChoice\(subsMemoryFile\(\), titleKey, choice\)/.test(mainIdx),
  'SET handler → recordSubsChoice (returns updated memory)');
ok(/subsMemoryGet: \(\) => ipcRenderer\.invoke\('flux:subs:memory:get'\)/.test(preload) &&
   /subsMemorySet: \(titleKey, choice\) =>\s*\n\s*ipcRenderer\.invoke\('flux:subs:memory:set', titleKey, choice\)/.test(preload),
  'preload exposes subsMemoryGet/subsMemorySet');

console.log('C. useSubtitles — recording user choices');
ok(/const memoryRef = useRef\(null\);/.test(hook), 'memory cached in a ref');
ok(/Promise\.resolve\(api\.subsMemoryGet\(\)\)\.then\(\(mem\) => \{/.test(hook), 'memory loaded once per session (mount effect)');
ok(/if \(maybeAutoApplyRef\.current\) maybeAutoApplyRef\.current\(\);/.test(hook),
  'late-loading memory triggers an apply pass when it lands');
ok(/const rememberChoice = useCallback/.test(hook), 'rememberChoice persists choices');
ok(/if \(ctx\.isEmbed\) return;/.test(hook), 'embeds never record (they manage their own subs)');
ok(/Promise\.resolve\(api\.subsMemorySet\(key, choice\)\)/.test(hook), 'choice written via IPC (fire & forget)');
ok(/userActedKeyRef\.current = episodeKeyOf\(\);[\s\S]{0,220}kind: 'external',\s*\n\s*language: String\(variant\.language \|\| 'Unknown'\),\s*\n\s*url: String\(variant\.downloadUrl\)/.test(hook),
  'selectVariant: marks user-acted + records language AND exact url');
ok(/selectEmbedded = useCallback[\s\S]{0,300}rememberChoice\(\{ kind: 'embedded', language: \(track && track\.name\) \|\| '' \}\)/.test(hook),
  'selectEmbedded: records the track language');
ok(/const off = useCallback[\s\S]{0,200}rememberChoice\(\{ kind: 'off' \}\)/.test(hook),
  'off: remembered too (last action wins)');

console.log('D. useSubtitles — auto-apply rules');
const autoStart = hook.indexOf('const maybeAutoApply = useCallback');
const autoEnd = hook.indexOf('}, [applyEmbedded, applyVariant, episodeKeyOf]);', autoStart);
const auto = autoStart >= 0 ? hook.slice(autoStart, autoEnd) : '';
ok(autoStart >= 0 && autoEnd > autoStart, 'maybeAutoApply defined');
ok(/if \(ctx\.isEmbed\) return;/.test(auto), 'never auto-applies on embeds');
ok(/if \(!memoryRef\.current\) return;/.test(auto), 'no-op until the memory has loaded');
ok(/if \(selectedRef\.current \|\| embeddedActiveRef\.current != null\) return;/, 'skips when something is already playing');
ok(/if \(userActedKeyRef\.current === episodeKeyOf\(\)\) return;/, 'skips when the user already picked for this episode');
ok(/memoryRef\.current\.titles\[ctx\.imdbId\]\) \|\|\s*\n\s*memoryRef\.current\.last/.test(auto),
  'per-title choice wins over the global last');
ok(/if \(!choice \|\| choice\.kind === 'off'\) return;/, "'off' memory → subs stay off");
ok(/const exact = groupsRef\.current\.flatMap\(\(g\) => g\.variants\)[\s\S]{0,180}toLowerCase\(\) ===\s*\n\s*String\(choice\.url\)\.toLowerCase\(\)/.test(auto),
  'external memory: exact same FILE re-picked on a resume (case-insensitive url match)');
ok(/const group = groupsRef\.current\.find\(\(g\) => g\.language === choice\.language\);[\s\S]{0,120}applyVariant\(group\.variants\[0\], true\)/.test(auto),
  'external memory: remembered LANGUAGE applied on the next episode (first variant)');
ok(/kind === 'embedded' && choice\.language\) \{\s*\n\s*const track = embeddedListRef\.current\.find\(\(t\) => t\.name === choice\.language\);[\s\S]{0,120}applyEmbedded\(track\.id, true\)/.test(auto),
  'embedded memory: matching embedded track selected');
ok(/const track = embeddedListRef\.current\.find[\s\S]{0,200}applyEmbedded[\s\S]{0,200}const group = groupsRef\.current\.find\(\(g\) => g\.language === choice\.language\);/.test(auto),
  'embedded memory falls back to the external language group');
ok(/if \(changed\) \{[\s\S]*?maybeAutoApplyRef\.current\(\);[\s\S]*?payload\.kind === 'done'\) \{\s*\n\s*setPending\(0\);\s*\n\s*if \(maybeAutoApplyRef\.current\) maybeAutoApplyRef\.current\(\);/.test(hook),
  'auto-apply runs on every provider batch AND on done');
ok(/setEmbeddedTracks = useCallback[\s\S]{0,900}maybeAutoApplyRef\.current\(\);/.test(hook),
  'auto-apply runs when embedded tracks land (MANIFEST_PARSED)');
ok(/embeddedListRef\.current = tracks;/.test(hook), 'embedded list mirrored to a ref (callback-readable)');
ok(/episodeKeyRef\.current = key;\s*\n\s*userActedKeyRef\.current = '';/, 'fresh search resets the user-acted mark (refresh re-applies memory)');
ok(/resetForEpisode = useCallback[\s\S]{0,600}userActedKeyRef\.current = '';/.test(hook),
  'new episode clears the user-acted mark');
ok(/selectVariant|selectEmbedded|off/.test(hook) &&
   /setContext, search, off, selectVariant, selectEmbedded, setDelay, setSubsStyle,/.test(hook),
  'public hook API unchanged (SubtitleMenu contract intact)');

console.log('E. Reload source keeps the resume target');
ok(/if \(v && Number\.isFinite\(v\.currentTime\) && v\.currentTime >= 3\) \{[\s\S]{0,200}\} else \{\s*\n\s*\/\/ No meaningful live position[\s\S]{0,320}wasPausedOnReloadRef\.current = false;\s*\n\s*\}/.test(pv),
  'captures the position only when meaningful (>= 3s); otherwise keeps the pending resume target + autoplay');
ok(/resume → impatient Reload = restart from 0:00/.test(pv), 'the clobber regression is documented in-place');
ok(/const lastImdbIdRef = useRef\(null\);/.test(pv), 'lastImdbIdRef remembers the title id');
ok(/lastImdbIdRef\.current = meta\.id;/.test(pv),
  'saveProgress learns the id from meta when it lands');
ok(/imdbId: \(meta && meta\.id\) \|\| lastImdbIdRef\.current,/.test(pv),
  'snapshots fired BEFORE resume-meta lands keep the title id (carry survives reload → fallback scan)');

console.log('F. Housekeeping');
const vMinor41 = parseInt((pkg.version || '').split('.')[1], 10);
ok(Number.isFinite(vMinor41) && vMinor41 >= 41, 'package.json version carries the subtitle memory (>= 0.41)');

console.log('\nflux-test-v041: ' + passed + '/' + passed + ' PASS');

#!/usr/bin/env node
/* ── Flux v0.41.1 tests ────────────────────────────────────────────────────
 * HOTFIX: v0.41.0 crashed EVERY player open with
 *   "Cannot access 'buildParams' before initialization"
 * useSubtitles declared `episodeKeyOf` (deps [buildParams]) BEFORE the
 * `const buildParams = useCallback(...)` declaration. Dep arrays evaluate
 * during render → TDZ the moment PlayerView mounts. The v0.41.0 checks were
 * regex-only and the Xvfb boot smoke never opened a player, so it shipped.
 *
 * Two defenses so this class of bug can NEVER ship again:
 *   1. RUNTIME hook render — bundle each renderer hook with esbuild and
 *      actually execute it via react-dom/server renderToString. Any TDZ /
 *      ReferenceError in the hook body throws right here.
 *   2. STATIC dep-order guard — in every renderer file, any hook-local
 *      useCallback/useMemo const that appears in a dep array (useEffect /
 *      useCallback / useMemo) must be declared BEFORE that hook call.
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

const ROOT = path.join(__dirname, '..');
const HOOKS = path.join(ROOT, 'src', 'renderer', 'src', 'hooks');

/* ── 1. Static dep-order guard across all renderer files ─────────────── */
console.log('static dep-order guard (renderer-wide TDZ scan)');

const SRC = path.join(ROOT, 'src', 'renderer', 'src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return /\.(js|jsx)$/.test(d.name) ? [p] : [];
  });
}

let scanned = 0;
let violations = [];
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  scanned++;

  // hook-local function declarations: const NAME = useCallback( / useMemo(
  const decls = [];
  const declRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:useCallback|useMemo)\(/g;
  let m;
  while ((m = declRe.exec(src))) decls.push({ name: m[1], pos: m.index });
  if (!decls.length) continue;
  const byName = new Map(decls.map((d) => [d.name, d.pos]));

  // every dep array line: `}, [a, b, c]` — attributed to the nearest
  // preceding useCallback/useMemo/useEffect call
  const hookStarts = [];
  const hookRe = /=\s*use(?:Callback|Memo|Effect)\s*\(/g;
  while ((m = hookRe.exec(src))) hookStarts.push(m.index);
  const depRe = /^\s*\},\s*\[([^\]]*)\]/gm;
  while ((m = depRe.exec(src))) {
    const owner = [...hookStarts].reverse().find((p) => p < m.index);
    if (owner === undefined) continue;
    for (const raw of m[1].split(',')) {
      const id = raw.trim();
      if (!byName.has(id)) continue;
      const declPos = byName.get(id);
      if (declPos > owner) {
        violations.push(
          `${path.relative(ROOT, file)}: "${id}" used in a dep array before ` +
          `its declaration (TDZ) — dep array @${m.index}, declared @${declPos}`
        );
      }
    }
  }
}
ok(scanned >= 15, `scanned ${scanned} renderer files`);
if (violations.length) {
  console.error(violations.map((v) => '  VIOLATION: ' + v).join('\n'));
  process.exit(1);
}
ok(true, 'zero dep-array-before-declaration violations renderer-wide');

// Pin the exact fixed pair (documentation value — the crash that shipped)
const hookSrc = fs.readFileSync(path.join(HOOKS, 'useSubtitles.js'), 'utf8');
const buildPos = hookSrc.indexOf('const buildParams = useCallback');
const episodePos = hookSrc.indexOf('const episodeKeyOf = useCallback');
ok(buildPos !== -1 && episodePos !== -1, 'buildParams + episodeKeyOf both declared');
ok(buildPos < episodePos, 'buildParams declared BEFORE episodeKeyOf (the v0.41.0 TDZ)');

/* ── 2. Runtime hook render (the defense that would have caught it) ──── */
console.log('runtime hook render (esbuild bundle + react-dom/server)');

const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const React = require(path.join(ROOT, 'node_modules', 'react'));
const { renderToString } = require(path.join(ROOT, 'node_modules', 'react-dom', 'server'));

const tmp = path.join(__dirname, '.tmp-hooks');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });   // INSIDE the repo so require('react')
                                          // walks up to Flux/node_modules
const hooksToSmoke = ['useSubtitles.js', 'useSearch.js', 'useStreams.js', 'useHome.js'];
const bundles = [];
for (const h of hooksToSmoke) {
  const out = path.join(tmp, h.replace(/\.js$/, '.cjs'));
  esbuild.buildSync({
    entryPoints: [path.join(HOOKS, h)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: out,
    external: ['react', 'react-dom']
  });
  const mod = require(out);
  const base = h.replace(/\.js$/, '');
  bundles.push({ name: h, fn: mod[base] || mod.default || mod });
}
ok(bundles.length === 4, 'bundled 4 renderer hooks for real execution');

for (const { name, fn } of bundles) {
  const hookName = name.replace(/\.js$/, '');
  let api = null;
  function Probe() { api = fn(); return null; }
  let threw = null;
  try { renderToString(React.createElement(Probe)); }
  catch (e) { threw = e; }
  ok(!threw, `${hookName}() executes in a real React render without throwing` +
    (threw ? ` — got: ${threw.message}` : ''));
  if (!threw) {
    ok(api && typeof api === 'object', `${hookName}() returns its API object`);
  }
}

// The exact hook that crashed: shape + a real call path through the
// previously-misordered callbacks (getOverlayText → refs; setContext → ref)
{
  const mod = require(path.join(tmp, 'useSubtitles.cjs'));
  const useSubtitles = mod.useSubtitles || mod.default || mod;
  let api = null;
  function Probe() { api = useSubtitles(); return null; }
  renderToString(React.createElement(Probe));
  const expected = ['setContext', 'search', 'off', 'selectVariant', 'selectEmbedded',
    'setDelay', 'setSubsStyle', 'setEmbeddedTracks', 'pushEmbeddedCues',
    'attachHls', 'detachHls', 'resetForEpisode', 'stopInFlight', 'getOverlayText'];
  for (const k of expected) ok(typeof api[k] === 'function', `useSubtitles().${k} is a function`);
  api.setContext({ name: 'Dark', imdbId: 'tt5753856', isSeries: true, season: 1, episode: 2 });
  ok(api.getOverlayText(0) === '', 'getOverlayText works after setContext (no TDZ, no throw)');
  ok(api.groups.length === 0 && api.pending === 0, 'initial subtitle state is clean');
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\nAll ${passed} v0.41.1 assertions passed.`);

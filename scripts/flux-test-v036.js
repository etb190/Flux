#!/usr/bin/env node
/* ── Flux v0.36.0 tests ────────────────────────────────────────────────────
 * 1. Subtitle menu while viewing a video: external language groups now sort
 *    by menu order (English, French, Arabic, Italian, Spanish) — the
 *    renderer's batch merge still used a plain alphabetical localeCompare,
 *    which put Arabic above English (exactly what the user saw).
 * 2. Sidebar Discord badge is now a button: clicking it performs a FULL
 *    Rich Presence reset — teardown of the RPC client, fresh reconnect,
 *    ending idle (recovers stuck presences).
 */
const fs = require('fs');
const path = require('path');

const d = require('../src/main/discord.js');
const sp = require('../src/renderer/src/lib/subsParser.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) { console.error('  FAIL: ' + label); process.exit(1); }
  passed++;
  console.log('  ok ' + passed + ' - ' + label);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('A. subMenuCompare — English above Arabic (menu order, not alphabetical)');
ok(sp.subMenuCompare('English', 'Arabic') < 0, 'English sorts ABOVE Arabic');
ok(sp.subMenuCompare('Arabic', 'English') > 0, 'Arabic sorts BELOW English');
ok(sp.subMenuCompare('English', 'French') < 0 && sp.subMenuCompare('French', 'Arabic') < 0, 'English < French < Arabic');
ok(sp.subMenuCompare('Arabic', 'Italian') < 0 && sp.subMenuCompare('Italian', 'Spanish') < 0, 'Arabic < Italian < Spanish');
ok(sp.subMenuCompare('Spanish', 'Unknown') < 0, 'unknown languages sort after the whitelist');
ok(sp.subMenuCompare('English', 'English') === 0, 'equal labels compare equal');
const sorted = ['Arabic', 'Unknown', 'Spanish', 'English', 'Italian', 'French'].sort(sp.subMenuCompare);
ok(JSON.stringify(sorted) === JSON.stringify(['English', 'French', 'Arabic', 'Italian', 'Spanish', 'Unknown']),
  'array sort → English, French, Arabic, Italian, Spanish, Unknown');

console.log('B. renderer batch merge uses the menu order');
const hook = read('src/renderer/src/hooks/useSubtitles.js');
ok(/subMenuCompare\(a\.language, b\.language\)/.test(hook), 'group merge sorts via subMenuCompare');
ok(!/next\.sort\(\(a, b\) => a\.language\.localeCompare\(b\.language\)\)/.test(hook), 'plain alphabetical group sort is gone');
ok(/subMenuOrderIndex, subMenuCompare/.test(hook), 'hook imports the comparator');

console.log('C. Discord service reset (sidebar badge action)');
const frames = [];
const instances = [];
class FakeClient {
  constructor(opts) { this.clientId = opts.clientId; this.destroyed = false; this.loggedIn = false; instances.push(this); }
  async login() { this.loggedIn = true; return true; }
  async destroy() { this.destroyed = true; }
  async request(cmd, args) {
    if (cmd === 'SET_ACTIVITY' && args && args.activity) frames.push(args.activity);
    return {};
  }
}
(async () => {
  const svc = d.createDiscordService({ clientClass: FakeClient, pausedRefreshMs: 50, silent: true });
  await svc.initialize({ enabled: true });          // instance #1 + idle
  frames.length = 0;
  await svc.setWatchingSeries({ title: 'Batman', season: 1, episode: 2, episodeTitle: 'Hi Diddle Riddle', positionSec: 5, paused: true });
  ok(frames.length > 0 && /S1E2: Hi Diddle Riddle \(Paused\)/.test(frames[frames.length - 1].state), 'media presence pushed before reset');
  const first = instances[instances.length - 1];
  frames.length = 0;
  const okReset = await svc.reset();
  ok(okReset === true, 'reset() resolves true when enabled');
  ok(first.destroyed === true, 'old RPC client destroyed');
  ok(instances.length === 2, 'exactly ONE fresh client created');
  ok(instances[1].loggedIn === true, 'fresh client logged in');
  ok(frames.length > 0 && frames[frames.length - 1].details === 'Browsing Netflix', 'reset ends on the idle presence');
  await new Promise((r) => setTimeout(r, 180));
  ok(!frames.some((f) => /\(Paused\)/.test(f.state || '')), 'paused re-send timer is dead after reset');
  ok(await svc.clearToIdle() === false, 'already idle → clearToIdle is a no-op');
  ok(await svc.setWatchingMovie({ title: 'X', year: '2001', positionSec: 1, paused: false }) === true, 'service still usable after reset');
  await svc.shutdown();

  const before = instances.length;
  const svc2 = d.createDiscordService({ clientClass: FakeClient, silent: true });
  ok(await svc2.reset() === false, 'reset without enable → false');
  ok(instances.length === before, 'no client created when the service is disabled');

  console.log('D. wiring: badge button → preload → IPC → service.reset');
  const sidebar = read('src/renderer/src/components/SideBar.jsx');
  ok(/type="button"/.test(sidebar) && /data-testid="sidebar-discord"/.test(sidebar), 'badge is a real button (still sidebar-discord)');
  ok(/onClick=\{resetPresence\}/.test(sidebar), 'badge click handler wired');
  ok(/discordReset\(\)/.test(sidebar), 'badge calls the discordReset API');
  ok(/double-click guard/.test(sidebar), 'double-click guarded');
  const preload = read('src/preload/index.js');
  ok(/discordReset: \(\) => ipcRenderer\.invoke\('flux:discord:reset'\)/.test(preload), 'preload exposes discordReset');
  const main = read('src/main/index.js');
  ok(/ipcMain\.handle\('flux:discord:reset', \(\) => discord\.reset\(\)\)/.test(main), 'IPC flux:discord:reset → discord.reset()');
  const dj = read('src/main/discord.js');
  ok(/async reset\(\)/.test(dj), 'service has the reset() method');

  console.log('\nALL ' + passed + ' ASSERTIONS PASSED');
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });

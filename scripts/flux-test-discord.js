#!/usr/bin/env node
/* ── Flux Discord Rich Presence tests (v0.33.0 changes) ───────────────────
 * 1. New application id + public key (user-supplied replacement app).
 * 2. Small icon = EXTERNAL https logo URL (the old 'logo' portal asset key
 *    never existed on the application portal → Discord rendered nothing).
 *    Browsing presence must NOT carry a small icon; watching presence must.
 * 3. Series presence large image = the EPISODE'S OWN banner (renderer now
 *    resolves videos[].thumbnail), with show art as fallback only.
 * Runs the REAL createDiscordService against a fake Discord IPC client and
 * inspects the actual SET_ACTIVITY wire payloads.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const d = require('../src/main/discord.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) { console.error('  FAIL: ' + label); process.exit(1); }
  passed++;
  console.log('  ok ' + passed + ' - ' + label);
}

console.log('A. application identity');
ok(d.DISCORD_APP_ID === '1557628426402271323', 'app id switched to the user-supplied application');
ok(d.DISCORD_PUBLIC_KEY === '5ceebfd2caf3c033c5413badc1e4b8d86f583b7554909bab50c0ea8da34d3127', 'public key matches the new application');
ok(/^https:\/\/raw\.githubusercontent\.com\/etb190\/Flux\/main\/assets\/icon\.png$/.test(d.LOGO_IMAGE), 'LOGO_IMAGE is the hosted repo icon URL');
ok(fs.existsSync(path.join(__dirname, '../assets/icon.png')), 'assets/icon.png exists in the repo (hosted on main)');

console.log('B. small icon is an external URL, not a portal asset key');
const LOGO = d.LOGO_IMAGE;
ok(d.buildLargeImage('https://images.metahub.space/poster/medium/tt1/img', 'T').key === 'https://images.metahub.space/poster/medium/tt1/img', 'valid poster URL passes through as large image');
ok(d.buildLargeImage('/relative/path', 'T').key === LOGO, 'relative poster path falls back to the hosted logo');
ok(d.buildLargeImage('data:image/png;base64,xxx', 'T').key === LOGO, 'data URI falls back to the hosted logo');
ok(d.buildLargeImage(null, 'T').key === LOGO, 'missing poster falls back to the hosted logo');

console.log('C. presence builders');
const idle = d.buildIdlePresence(new Date('2026-01-01T00:00:00Z'));
ok(idle.details === 'Browsing Netflix', 'idle details text');
ok(idle.largeImage.key === LOGO, 'idle large image = logo');
ok(idle.smallImage === undefined, 'browsing presence has NO small icon');
ok(idle.timestamps.startTimestamp instanceof Date, 'idle session start timestamp');

const now = Date.now();
const movie = d.buildMoviePresence({ title: 'Inception', year: '2010', posterUrl: 'https://images.metahub.space/poster/medium/tt1375666/img', positionSec: 90, paused: false, now });
ok(movie.details === 'Watching Inception' && movie.state === '(2010)', 'movie details/state');
ok(movie.smallImage && movie.smallImage.key === LOGO && /^https:\/\//.test(movie.smallImage.key), 'watching a movie → small icon IS present (external URL)');
ok(movie.largeImage.key === 'https://images.metahub.space/poster/medium/tt1375666/img', 'movie large image = poster');
ok(movie.timestamps.startTimestamp.getTime() <= now - 89000, 'movie elapsed timestamp start = now - position');

const series = d.buildSeriesPresence({ title: 'The Last of Us', season: 1, episode: 2, episodeTitle: 'Infected', posterUrl: 'https://episodes.metahub.space/tt3581920/1/2/w780.jpg', positionSec: 30, paused: false, now });
ok(series.state === 'S1E2: Infected', 'series state S1E2 with episode title');
ok(series.largeImage.key === 'https://episodes.metahub.space/tt3581920/1/2/w780.jpg', 'series large image = the EPISODE banner (not the show backdrop)');
ok(series.smallImage && series.smallImage.key === LOGO, 'watching a series → small icon IS present');
const seriesPaused = d.buildSeriesPresence({ title: 'T', season: 2, episode: 5, posterUrl: 'https://x/y.jpg', positionSec: 10, paused: true, now });
ok(seriesPaused.state === 'Season 2 Episode 5 (Paused)', 'paused suffix (long form without episode title)');
const seriesPausedShort = d.buildSeriesPresence({ title: 'T', season: 2, episode: 5, episodeTitle: 'X', posterUrl: 'https://x/y.jpg', positionSec: 10, paused: true, now });
ok(seriesPausedShort.state === 'S2E5: X (Paused)', 'paused suffix (short form with episode title)');
ok(seriesPaused.largeImage.text === 'T', 'large image hover text = title');

const seriesFallback = d.buildSeriesPresence({ title: 'T', season: 1, episode: 1, posterUrl: null, positionSec: 0, paused: false, now });
ok(seriesFallback.largeImage.key === LOGO, 'series without episode art falls back to the logo');

console.log('D. SET_ACTIVITY wire payload');
const w = d.toSetActivityPayload(series);
ok(w.type === 3 && w.details === 'Watching The Last of Us' && w.state === 'S1E2: Infected', 'watching type + details/state on the wire');
ok(w.assets.large_image === 'https://episodes.metahub.space/tt3581920/1/2/w780.jpg', 'wire assets.large_image = episode banner');
ok(w.assets.small_image === LOGO && w.assets.small_text === 'Netflix', 'wire assets.small_image = logo + hover text');
ok(typeof w.timestamps.start === 'number' && w.timestamps.start <= now - 29000, 'wire timestamps.start is epoch ms');
const wi = d.toSetActivityPayload(idle);
ok(wi.assets && wi.assets.large_image === LOGO && !wi.assets.small_image, 'wire idle payload has large only, no small_image');

console.log('E. real service against a fake Discord IPC client');
const fakeInstances = [];
class FakeClient {
  constructor(opts) {
    this.clientId = opts.clientId;
    this.requests = [];
    this.destroyed = 0;
    fakeInstances.push(this);
  }
  async login() { return true; }
  async destroy() { this.destroyed++; }
  async request(cmd, args) { this.requests.push({ cmd, args }); return {}; }
}

(async () => {
  const svc = d.createDiscordService({ clientClass: FakeClient, appId: 'test-app', pausedRefreshMs: 30, silent: true });
  ok((await svc.initialize({ enabled: true })) === true, 'initialize connects');
  ok(fakeInstances.length === 1 && fakeInstances[0].clientId === 'test-app', 'client constructed with the injected app id');

  ok(await svc.setIdle() === true, 'idle push succeeds');
  const mediaFrames = () => fakeInstances[0].requests.filter((r) => r.cmd === 'SET_ACTIVITY' && r.args && r.args.activity);
  const idlePush = mediaFrames().pop();
  ok(idlePush.args.activity.assets.large_image === LOGO, 'service idle push: logo as large image');
  ok(!idlePush.args.activity.assets.small_image, 'service idle push: NO small icon while browsing');

  ok(await svc.setWatchingSeries({
    title: 'The Last of Us', season: 1, episode: 2, episodeTitle: 'Infected',
    posterUrl: 'https://episodes.metahub.space/tt3581920/1/2/w780.jpg',
    positionSec: 120, paused: false
  }) === true, 'series push succeeds');
  const seriesPush = mediaFrames().pop();
  ok(seriesPush.args.activity.assets.large_image === 'https://episodes.metahub.space/tt3581920/1/2/w780.jpg', 'service series push: large_image = EPISODE banner');
  ok(seriesPush.args.activity.assets.small_image === LOGO, 'service series push: small icon present');
  ok(seriesPush.args.activity.details === 'Watching The Last of Us' && seriesPush.args.activity.state === 'S1E2: Infected', 'service series push: details/state');

  ok(await svc.setWatchingMovie({ title: 'Inception', year: '2010', posterUrl: 'https://images.metahub.space/poster/medium/tt1375666/img', positionSec: 5, paused: false }) === true, 'movie push succeeds');
  const moviePush = mediaFrames().pop();
  ok(moviePush.args.activity.assets.large_image === 'https://images.metahub.space/poster/medium/tt1375666/img' && moviePush.args.activity.assets.small_image === LOGO, 'service movie push: poster + small icon');

  // paused freeze: re-sends arrive on the refresh cadence, each keeping the
  // small icon (the badge must not blink away between re-sends)
  const before = fakeInstances[0].requests.length;
  await svc.setWatchingSeries({ title: 'T', season: 1, episode: 1, posterUrl: 'https://e/1/1/w780.jpg', positionSec: 60, paused: true });
  await new Promise((r) => setTimeout(r, 110));
  const delta = fakeInstances[0].requests.length - before;
  ok(delta >= 3, 'paused re-send cadence fired (+' + delta + ' frames in 110ms)');
  const pausedFrame = mediaFrames().pop();
  ok(pausedFrame.args.activity.assets.small_image === LOGO, 'paused re-sends keep the small icon');
  await svc.setIdle(); // stops the paused timer

  const cnt = fakeInstances[0].requests.length;
  ok(await svc.clearToIdle() === false && fakeInstances[0].requests.length === cnt, 'clearToIdle no-ops (no extra frame) while idle');

  await svc.shutdown();
  ok(fakeInstances[0].destroyed >= 1, 'shutdown destroys the client cleanly');

  console.log('F. renderer source (PlayerView.updatePresence)');
  const pv = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/PlayerView.jsx'), 'utf8');
  ok(pv.includes('if (epMeta && epMeta.thumbnail) posterUrl = epMeta.thumbnail;'), 'PlayerView: series posterUrl = episode thumbnail');
  ok(/discordSet\(\{[\s\S]*?posterUrl,/.test(pv), 'PlayerView: computed posterUrl passed to discordSet');
  ok(!/posterUrl: \(meta && \(meta\.background/.test(pv), 'PlayerView: old show-art-only posterUrl expression removed');

  console.log('\nALL ' + passed + ' ASSERTIONS PASSED');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });

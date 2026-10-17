#!/usr/bin/env node
/* ── Flux v0.35.0 tests ────────────────────────────────────────────────────
 * 1. Movies now say "(Paused)" in the presence state line while paused
 *    (series already did; movies never indicated the pause at all).
 * 2. Sidebar footer: FLUX wordmark WITHOUT the version number, and the
 *    black Discord mark across from it (light chip so it reads on the
 *    #0d0d0d rail).
 * 3. Renderer pause wiring still feeds updatePresence(true) on video:pause
 *    (source-level check — the event chain that carries paused:true).
 */
const fs = require('fs');
const path = require('path');

const d = require('../src/main/discord.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) { console.error('  FAIL: ' + label); process.exit(1); }
  passed++;
  console.log('  ok ' + passed + ' - ' + label);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('A. movie presence says (Paused) while paused');
const now = Date.now();
const pausedMovie = d.buildMoviePresence({
  title: 'Inception', year: '2010',
  posterUrl: 'https://images.metahub.space/poster/medium/tt1375666/img',
  positionSec: 90, paused: true, now
});
ok(pausedMovie.state === '(2010) (Paused)', 'paused movie state = "(2010) (Paused)"');
ok(pausedMovie.details === 'Watching Inception', 'paused movie details unchanged');
ok(pausedMovie.smallImage && pausedMovie.smallImage.key === d.LOGO_IMAGE, 'paused movie keeps the watching badge');
ok(pausedMovie.timestamps && pausedMovie.timestamps.startTimestamp instanceof Date, 'paused movie still pins the elapsed start marker');
ok(pausedMovie.activityType === d.TYPE_WATCHING, 'paused movie stays a WATCHING activity');

console.log('B. playing movie shows no pause text (regression)');
const playMovie = d.buildMoviePresence({
  title: 'Inception', year: '2010',
  posterUrl: 'https://images.metahub.space/poster/medium/tt1375666/img',
  positionSec: 90, paused: false, now
});
ok(playMovie.state === '(2010)', 'playing movie state stays "(2010)"');
ok(playMovie.details === 'Watching Inception', 'playing movie details unchanged');

console.log('C. no-year movie paused');
const noYear = d.buildMoviePresence({ title: 'Inception', positionSec: 5, paused: true, now });
ok(noYear.state === 'In Netflix (Paused)', 'no-year paused movie state = "In Netflix (Paused)"');
const noYearPlay = d.buildMoviePresence({ title: 'Inception', positionSec: 5, paused: false, now });
ok(noYearPlay.state === 'In Netflix', 'no-year playing movie state stays "In Netflix"');

console.log('D. series pause text unchanged (regression)');
const pausedSeries = d.buildSeriesPresence({
  title: 'Batman', season: 1, episode: 2, episodeTitle: 'Hi Diddle Riddle',
  positionSec: 30, paused: true, now
});
ok(pausedSeries.state === 'S1E2: Hi Diddle Riddle (Paused)', 'series paused state still ends with "(Paused)"');
const playSeries = d.buildSeriesPresence({ title: 'Batman', season: 1, episode: 2, positionSec: 30, paused: false, now });
ok(playSeries.state.indexOf('(Paused)') === -1, 'series playing state has no pause text');

console.log('E. wire payload carries the paused state');
const wire = d.toSetActivityPayload(pausedMovie);
ok(wire.state === '(2010) (Paused)', 'SET_ACTIVITY payload state = "(2010) (Paused)"');
ok(wire.details === 'Watching Inception', 'SET_ACTIVITY payload details unchanged');

console.log('F. service pushes the paused movie state to Discord');
// Fake Discord IPC client: capture SET_ACTIVITY frames.
const frames = [];
class FakeClient {
  constructor(opts) { this.clientId = opts.clientId; }
  async login() { return true; }
  async destroy() {}
  async request(cmd, args) {
    if (cmd === 'SET_ACTIVITY' && args && args.activity) frames.push(args.activity);
    return {};
  }
}
(async () => {
  const svc = d.createDiscordService({ clientClass: FakeClient, pausedRefreshMs: 60, silent: true });
  await svc.initialize({ enabled: true });
  frames.length = 0;
  ok(await svc.setWatchingMovie({ title: 'Inception', year: '2010', posterUrl: 'https://images.metahub.space/poster/medium/tt1375666/img', positionSec: 5, paused: true }) === true, 'paused movie push succeeds');
  ok(frames.length > 0 && frames[frames.length - 1].state === '(2010) (Paused)', 'SET_ACTIVITY frame carries "(2010) (Paused)"');
  frames.length = 0;
  await svc.setWatchingMovie({ title: 'Inception', year: '2010', positionSec: 6, paused: false });
  ok(frames.length > 0 && frames[frames.length - 1].state === '(2010)', 'resuming wipes the pause text from the frame');
  await svc.shutdown();

  console.log('G. sidebar footer: no version number, Discord mark across from FLUX');
  const sidebar = read('src/renderer/src/components/SideBar.jsx');
  ok(!/appVersion/.test(sidebar), 'version fetch removed from the sidebar');
  ok(/>\s*FLUX\s*</.test(sidebar), 'FLUX wordmark renders without a version suffix');
  ok(!/\{version\}/.test(sidebar), 'no {version} interpolation left in the footer');
  ok(/sidebar-discord/.test(sidebar), 'Discord badge is present (data-testid sidebar-discord)');
  ok(/DiscordIcon/.test(sidebar), 'footer uses the DiscordIcon glyph');
  ok(/justify-between/.test(sidebar), 'footer row spreads FLUX and the badge to opposite ends');
  ok(/text-black/.test(sidebar), 'badge glyph renders black');
  ok(/bg-\[#f5f5f5\]/.test(sidebar), 'badge sits on a light chip so black reads on the dark rail');

  console.log('H. DiscordIcon exists in the icon set');
  const icons = read('src/renderer/src/components/icons.jsx');
  ok(/export function DiscordIcon/.test(icons), 'icons.jsx exports DiscordIcon');
  ok(/M20\.317 4\.3698/.test(icons), 'glyph path is the real Discord mark');

  console.log('I. renderer pause wiring intact (paused:true reaches discordSet)');
  const pv = read('src/renderer/src/components/PlayerView.jsx');
  ok(/art\.on\('video:pause'/.test(pv), 'video:pause is hooked');
  ok(/updatePresenceRef\.current\(true\)/.test(pv), 'pause handler forces paused=true');
  ok(/art\.on\('video:playing'/.test(pv) && /updatePresenceRef\.current\(false\)/.test(pv), 'playing handler forces paused=false');
  ok(/discordSet\(/.test(pv) && /paused,?\n/.test(pv), 'presence payload includes the paused flag');

  console.log('\nALL ' + passed + ' ASSERTIONS PASSED');
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });

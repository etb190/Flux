// ── Discord Rich Presence (Helix DiscordRpcService port) ─────────────────
// Same behavior as Helix's lib/services/discord/discord_rpc_service.dart:
//
//   • One connection to the local Discord IPC pipe (Windows named pipe
//     \\?\pipe\discord-ipc-N) owned by the main process.
//   • Idle presence "Browsing Netflix" with the session start time.
//   • Watching a movie  → details "Watching {title}", state "(year)",
//     large image = poster URL, timestamps = elapsed position (Discord
//     counts UP the hours/minutes/seconds you are into the video).
//   • Watching a series → details "Watching {title}", state
//     "S{x}E{y}: {episode}" (+ " (Paused)"), same image/timestamp rules.
//   • Paused → the timer FREEZES at the paused position. Discord renders
//     elapsed as (now - start) and RETAINS omitted timestamps between
//     updates, so freezing needs re-sends: while paused the service
//     re-pushes the presence every ~1.5s with start = now - pausedPosition,
//     pinning the clock around the pause point (±1s) instead of letting it
//     run away.
//   • Leaving the player → back to idle (only if not already idle).
//   • A live toggle (default ON): off = clear presence + disconnect,
//     on = reconnect + restore the last presence.
//
// The Discord application is branded "Netflix" (that is what the presence
// shows); the app id is the Discord Application's ID ("the discord netflix
// thing");
// the application's public key is stored next to it for reference — plain
// Rich Presence only ever needs the application id.
//
// Everything is guarded: if Discord isn't running the pipe connect fails
// and every call becomes a silent no-op, exactly like Helix's debugPrint.

const { Client } = require('@xhayper/discord-rpc');

// Discord Application (branded "Netflix" — the netflix-style one)
const DISCORD_APP_ID = '1556017689758007427';
// Application public key (only needed for OAuth2 token verification /
// join flows — NOT for Rich Presence; kept here for reference).
const DISCORD_PUBLIC_KEY =
  '6f9abda0f2852d72db10aa459d7227810f3edf33f9956bcbb680af4406a0c3d5';

// Activity asset uploaded on the Discord application portal. If the asset
// does not exist Discord simply renders no image — never an error.
const LOGO_KEY = 'logo';

// discord-api-types ActivityType: 0 = PLAYING, 3 = WATCHING
const TYPE_PLAYING = 0;
const TYPE_WATCHING = 3;

const APP_NAME = 'Netflix';

// ── Pure presence builders (unit-testable, no client involved) ───────────
// Timestamps show ELAPSED progress (deliberate Flux change vs Helix's
// remaining-time countdown): start = now - position, so Discord renders
// the current hour/minute/second you are on and counts up while you watch.
// While paused the SAME start marker is recomputed from the paused
// position on every service refresh (see startPausedRefresh) so the clock
// stays pinned at the pause point instead of running away.

function buildTimestamps({ now, positionSec, paused }) {
  const position = Number(positionSec);
  // Paused: emit a start marker for ANY known position (incl. 0). Discord
  // keeps the previous timestamps when an update omits them, which would
  // let the clock run on while paused — the service refreshes these.
  // (positionSec == null is checked against the RAW arg: Number(null) is 0.)
  if (paused) {
    if (positionSec != null && Number.isFinite(position) && position >= 0) {
      return { startTimestamp: new Date(now - Math.round(position) * 1000) };
    }
    return undefined;
  }
  if (Number.isFinite(position) && position > 0) {
    return { startTimestamp: new Date(now - Math.round(position) * 1000) };
  }
  return undefined;
}

function buildLargeImage(posterUrl, imageText) {
  const poster = typeof posterUrl === 'string' ? posterUrl.trim() : '';
  // Helix: only trust absolute http(s) URLs — scraped relative paths or
  // data URIs would 404 inside Discord's image proxy.
  if (poster && /^https?:\/\//i.test(poster)) {
    return { key: poster, text: imageText || undefined };
  }
  return { key: LOGO_KEY, text: APP_NAME };
}

function buildIdlePresence(startedAt) {
  return {
    activityType: TYPE_PLAYING,
    details: 'Browsing ' + APP_NAME,
    largeImage: { key: LOGO_KEY, text: APP_NAME },
    timestamps: { startTimestamp: startedAt instanceof Date ? startedAt : new Date(startedAt) }
  };
}

function buildMoviePresence({ title, year, posterUrl, positionSec, durationSec, paused, now }) {
  const cleanTitle = String(title || '').trim() || APP_NAME;
  const cleanYear = String(year == null ? '' : year).trim();
  return {
    activityType: TYPE_WATCHING,
    details: 'Watching ' + cleanTitle,
    // Helix: "(2021)" while watching, "In Netflix" without a year
    state: cleanYear ? '(' + cleanYear + ')' : 'In ' + APP_NAME,
    largeImage: buildLargeImage(posterUrl, cleanTitle),
    smallImage: { key: LOGO_KEY, text: APP_NAME },
    timestamps: buildTimestamps({ now, positionSec, durationSec, paused })
  };
}

function buildSeriesPresence({ title, season, episode, episodeTitle, posterUrl, positionSec, durationSec, paused, now }) {
  const cleanTitle = String(title || '').trim() || APP_NAME;
  const s = Number.isFinite(Number(season)) && Number(season) > 0 ? Math.floor(Number(season)) : 1;
  const e = Number.isFinite(Number(episode)) && Number(episode) > 0 ? Math.floor(Number(episode)) : 1;
  const cleanEp = String(episodeTitle || '').trim();
  let stateText = cleanEp ? 'S' + s + 'E' + e + ': ' + cleanEp : 'Season ' + s + ' Episode ' + e;
  if (paused) stateText += ' (Paused)';
  return {
    activityType: TYPE_WATCHING,
    details: 'Watching ' + cleanTitle,
    state: stateText,
    largeImage: buildLargeImage(posterUrl, cleanTitle),
    smallImage: { key: LOGO_KEY, text: APP_NAME },
    timestamps: buildTimestamps({ now, positionSec, durationSec, paused })
  };
}

// Convert a builder result into the SET_ACTIVITY wire payload. This is the
// real Discord RPC frame shape (not the flat camelCase shape the library's
// ClientUser.setActivity formatter takes, which we bypass by issuing the
// raw request): timestamps.{start,end} in ms and assets.large_image/….
function toSetActivityPayload(p) {
  const activity = {
    type: p.activityType,
    instance: false
  };
  if (p.details) activity.details = p.details;
  if (p.state) activity.state = p.state;
  const ts = p.timestamps;
  if (ts && (ts.startTimestamp || ts.endTimestamp)) {
    activity.timestamps = {};
    if (ts.startTimestamp) {
      activity.timestamps.start = ts.startTimestamp instanceof Date
        ? ts.startTimestamp.getTime() : ts.startTimestamp;
    }
    if (ts.endTimestamp) {
      activity.timestamps.end = ts.endTimestamp instanceof Date
        ? ts.endTimestamp.getTime() : ts.endTimestamp;
    }
  }
  const largeKey = p.largeImage ? p.largeImage.key : undefined;
  const smallKey = p.smallImage ? p.smallImage.key : undefined;
  if (largeKey || smallKey) {
    activity.assets = {};
    if (largeKey) {
      activity.assets.large_image = largeKey;
      if (p.largeImage.text) activity.assets.large_text = p.largeImage.text;
    }
    if (smallKey) {
      activity.assets.small_image = smallKey;
      if (p.smallImage.text) activity.assets.small_text = p.smallImage.text;
    }
  }
  return activity;
}

// ── Service ───────────────────────────────────────────────────────────────
// clientId / Client class are injectable so the fake Discord IPC server
// tests can drive the real connection code.

function createDiscordService(options) {
  const opts = options || {};
  const appId = opts.appId || DISCORD_APP_ID;
  const ClientClass = opts.clientClass || Client;
  const sessionStart = Date.now();

  let client = null;
  let initialized = false;
  let enabled = false;
  let currentKind = 'idle';          // 'idle' | 'movie' | 'series'
  let lastArgs = null;               // last media args (restore on re-enable)
  let refreshTimer = null;           // paused-position re-send interval
  // Re-send cadence while paused (< 1s would render perfectly frozen;
  // 1.5s gives the ±1s back-and-forth the paused display may show).
  const PAUSED_REFRESH_MS = (opts.pausedRefreshMs != null) ? opts.pausedRefreshMs : 1500;

  const log = (...args) => {
    if (!opts.silent) console.log('[DiscordRPC]', ...args);
  };

  async function disposeClient() {
    if (!client) return;
    const c = client;
    client = null;
    try { await c.destroy(); } catch (_) { /* already gone */ }
  }

  async function connect() {
    if (initialized && client) return true;
    await disposeClient();
    try {
      client = new ClientClass({ clientId: appId });
      await client.login();
      initialized = true;
      log('Connected to Discord');
      return true;
    } catch (e) {
      initialized = false;
      await disposeClient();
      log('Discord not available (' + ((e && e.message) || e) + ')');
      return false;
    }
  }

  // SET_ACTIVITY without an activity wipes the presence (same as the
  // library's clearActivity, but as a raw request so no user object needed).
  async function clearActivityRaw() {
    await client.request('SET_ACTIVITY', {
      pid: (typeof process !== 'undefined' && process.pid) || 0
    });
  }

  // Push one presence; rebuilds the payload from the RAW args with a fresh
  // `now` so repeated pushes (paused refresh) recompute the start marker.
  async function push(kind, args) {
    const now = Date.now();
    const payload = kind === 'movie'
      ? buildMoviePresence({ ...args, now })
      : kind === 'series'
        ? buildSeriesPresence({ ...args, now })
        : buildIdlePresence(sessionStart);
    currentKind = kind;
    if (kind !== 'idle') lastArgs = args;
    if (!enabled) return false;
    if (!client || !initialized) await connect();
    if (!client || !initialized) return false;
    try {
      // Raw request (not client.user.setActivity) so it works even when
      // Discord's READY payload carried no user object.
      await client.request('SET_ACTIVITY', {
        pid: (typeof process !== 'undefined' && process.pid) || 0,
        activity: toSetActivityPayload(payload)
      });
      return true;
    } catch (e) {
      log('setActivity failed (' + ((e && e.message) || e) + ')');
      return false;
    }
  }

  function stopPausedRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  // While paused, re-push the same presence every PAUSED_REFRESH_MS with a
  // freshly recomputed start marker: Discord's elapsed clock renders
  // (now - start), so each re-send pins it back to the paused position —
  // it can only drift +1s between refreshes, giving the "second 10,
  // second 9" back-and-forth instead of a runaway counter.
  function startPausedRefresh() {
    stopPausedRefresh();
    refreshTimer = setInterval(() => {
      if (!enabled) { stopPausedRefresh(); return; }
      push(currentKind, lastArgs).catch(() => {});
    }, PAUSED_REFRESH_MS);
    if (refreshTimer.unref) refreshTimer.unref();   // never block app quit
  }

  async function update(kind, args) {
    stopPausedRefresh();
    const p = push(kind, args);
    if ((kind === 'movie' || kind === 'series') && args && args.paused &&
        Number.isFinite(Number(args.positionSec))) {
      startPausedRefresh();
    }
    return p;
  }

  return {
    // Called once on app ready with the persisted user preference.
    async initialize(opts2) {
      enabled = Boolean(opts2 && opts2.enabled);
      if (!enabled) return false;
      const ok = await connect();
      if (ok) await this.setIdle();
      return ok;
    },

    // Live toggle (Helix setEnabled): off → stop refresh + clear +
    // disconnect, on → reconnect + restore the last presence (or idle);
    // a paused restore restarts the freeze refresh via update().
    async setEnabled(on) {
      enabled = Boolean(on);
      if (enabled) {
        const ok = await connect();
        if (ok) {
          if (lastArgs && currentKind !== 'idle') {
            await update(currentKind, lastArgs);
          } else {
            await this.setIdle();
          }
        }
        return ok;
      }
      stopPausedRefresh();
      try {
        if (client && initialized) await clearActivityRaw();
      } catch (_) { /* gone already */ }
      await disposeClient();
      initialized = false;
      return true;
    },

    isEnabled() {
      return enabled;
    },

    async setIdle() {
      return update('idle', null);
    },

    async setWatchingMovie(args) {
      return update('movie', args);
    },

    async setWatchingSeries(args) {
      return update('series', args);
    },

    // Helix clearToIdle: leaving the player returns to idle, but only
    // transition when we actually left a media presence.
    async clearToIdle() {
      if (currentKind !== 'idle') return this.setIdle();
      return false;
    },

    async clearPresence() {
      stopPausedRefresh();
      currentKind = 'idle';
      lastArgs = null;
      try {
        if (client && initialized) await clearActivityRaw();
      } catch (_) { /* ignore */ }
    },

    // App quit: wipe the presence, then close the pipe cleanly.
    async shutdown() {
      stopPausedRefresh();
      try {
        if (client && initialized) await clearActivityRaw();
      } catch (_) { /* ignore */ }
      await disposeClient();
      initialized = false;
    }
  };
}

module.exports = {
  DISCORD_APP_ID,
  DISCORD_PUBLIC_KEY,
  LOGO_KEY,
  TYPE_PLAYING,
  TYPE_WATCHING,
  buildTimestamps,
  buildLargeImage,
  buildIdlePresence,
  buildMoviePresence,
  buildSeriesPresence,
  toSetActivityPayload,
  createDiscordService
};

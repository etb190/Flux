const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { searchAll, fetchMeta } = require('./search.js');
const { fetchStreams, cancelStreams } = require('./streams.js');
const { searchSubtitles, downloadSubtitle, cancelSubtitles } = require('./subtitles.js');
const home = require('./home.js');
const library = require('./library.js');
const tmdbapi = require('./tmdbapi.js');
const { ANGLE_BACKENDS, loadSettings, saveSettings } = require('./settings.js');

// ── Squirrel (Windows installer lifecycle) ──────────────────────────────
// When Flux is installed/updated/uninstalled by Squirrel.Windows it is
// launched with --squirrel-install / --squirrel-updated / --squirrel-uninstall
// / --squirrel-firstrun args. electron-squirrel-startup handles those events
// (shortcuts, uninstaller entry, etc.) and returns true — in that case the
// app must quit immediately instead of opening a window.
const squirrelStartup = require('electron-squirrel-startup');
if (squirrelStartup) {
  app.quit();
}

// ── Graphics backend (same choice as brave://flags/#use-angle) ───────────
// Must be applied BEFORE app ready. Saved in userData/flux-settings.json.
const settingsFile = () => path.join(app.getPath('userData'), 'flux-settings.json');
const libraryFile = () => path.join(app.getPath('userData'), 'flux-library.json');

(() => {
  const saved = loadSettings(settingsFile());
  if (saved.angleBackend && saved.angleBackend !== 'default') {
    app.commandLine.appendSwitch('use-angle', saved.angleBackend);
    console.log('[Flux] ANGLE graphics backend: ' + saved.angleBackend);
  }
})();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    show: false,
    title: 'Flux',
    icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true          // embed-player sources (vidsrc, vidlink, ...)
    }
  });

  win.once('ready-to-show', () => win.show());

  // Vite dev server (HMR) in development, built output in production.
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// ── IPC: search movies + series in parallel (Helix pattern) ──────────────
ipcMain.handle('flux:search', (_event, query) => searchAll(query));

// ── IPC: fetch full metadata (episodes/seasons for series) ───────────────
ipcMain.handle('flux:meta', (_event, type, id) => fetchMeta(type, id));

// ── IPC: scrape all sources for one episode (Helix ScraperManager pattern)
// Returns a requestId immediately; results stream back as
// 'flux:streams:progress' events: {kind: init|provider|done, ...}
let streamRequestSeq = 0;

ipcMain.handle('flux:streams', (event, params) => {
  const wc = event.sender;
  const requestId = ++streamRequestSeq;
  cancelStreams();                        // abort any previous scan

  const send = (payload) => {
    if (!wc.isDestroyed()) wc.send('flux:streams:progress', payload);
  };

  fetchStreams(params || {}, {
    onInit: (providers) => send({ requestId, kind: 'init', providers }),
    onProvider: (p) => send({ requestId, kind: 'provider', ...p }),
    onDone: (summary) => send({
      requestId,
      kind: 'done',
      total: summary.total,
      directCount: summary.directCount,
      embedCount: summary.embedCount,
      providers: summary.providers,
      sources: summary.sources,
      embeds: summary.embeds
    })
  });

  return { requestId };
});

ipcMain.handle('flux:streams:cancel', () => {
  cancelStreams();
  return true;
});

// ── IPC: subtitle search (Helix SubtitleService pattern) ─────────────────
// Returns a requestId immediately; each provider's results stream back as
// 'flux:subs:progress' events: {kind:'batch', requestId, variants, provider}
// followed by {kind:'done', requestId, total}.
let subsRequestSeq = 0;

ipcMain.handle('flux:subs:search', (event, params) => {
  const wc = event.sender;
  const requestId = ++subsRequestSeq;
  cancelSubtitles();                       // abort any previous search

  const send = (payload) => {
    if (!wc.isDestroyed()) wc.send('flux:subs:progress', payload);
  };

  searchSubtitles(params || {}, {
    onBatch: (variants, provider) => send({ requestId, kind: 'batch', variants, provider }),
    onDone: (total) => send({ requestId, kind: 'done', total })
  });

  return { requestId };
});

ipcMain.handle('flux:subs:cancel', () => {
  cancelSubtitles();
  return true;
});

// IPC: download + extract one subtitle variant → UTF-8 text
ipcMain.handle('flux:subs:download', (_event, variant) => downloadSubtitle(variant));

// ── Player: request header injection + CORS pass-through ────────────────
// Scraped direct links usually require a specific User-Agent/Referer (the
// values their scraper sites send). A <video> tag / hls.js XHR can't set
// Referer itself, so the main process injects them via webRequest while the
// player is open. hls.js also needs CORS on the m3u8/segment responses, so
// while the player is active we add Access-Control-Allow-Origin: * to the
// media hosts it touches.
//
// Renderer calls flux:player-rules with:
//   { headers: [{host, headers: {...}}], corsHosts: ['host1', ...] }
// and flux:player-rules:clear when the player closes.
let playerRules = { headers: [], corsHosts: [] };

function hostOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ''; }
}

function matchRuleHost(host) {
  for (const rule of playerRules.headers) {
    if (host === rule.host || host.endsWith('.' + rule.host)) return rule;
  }
  return null;
}

function matchCorsHost(host) {
  for (const pattern of playerRules.corsHosts) {
    if (host === pattern || host.endsWith('.' + pattern)) return true;
  }
  return false;
}

function installPlayerInterceptors() {
  const ses = session.defaultSession;

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (details.webContentsId != null && details.resourceType === 'webview') {
      // embed players manage their own requests
      callback({ requestHeaders: headers });
      return;
    }
    const host = hostOf(details.url);
    const rule = host ? matchRuleHost(host) : null;
    if (rule && rule.headers) {
      for (const [k, v] of Object.entries(rule.headers)) headers[k] = v;
    }
    callback({ requestHeaders: headers });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'webview') {
      callback({});
      return;
    }
    const host = hostOf(details.url);
    if (host && matchCorsHost(host)) {
      const responseHeaders = { ...details.responseHeaders };
      // replace any restrictive value the host sent
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === 'access-control-allow-origin') delete responseHeaders[key];
      }
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      callback({ responseHeaders });
      return;
    }
    callback({});
  });
}

ipcMain.handle('flux:player-rules', (_event, rules) => {
  playerRules = {
    headers: Array.isArray(rules && rules.headers) ? rules.headers : [],
    corsHosts: Array.isArray(rules && rules.corsHosts) ? rules.corsHosts : []
  };
  return true;
});

ipcMain.handle('flux:player-rules:clear', () => {
  playerRules = { headers: [], corsHosts: [] };
  return true;
});

// ── IPC: app settings (graphics backend etc.) ────────────────────────────
ipcMain.handle('flux:settings:get', () => ({
  ...loadSettings(settingsFile()),
  backends: ANGLE_BACKENDS
}));

ipcMain.handle('flux:settings:set', (_event, patch) => saveSettings(settingsFile(), patch));

// ── IPC: home page (Streaming Availability API + TMDB) ───────────────────
ipcMain.handle('flux:home', async () => {
  const s = loadSettings(settingsFile());
  try {
    return await home.getHomeData({
      saaKey: s.saaApiKey,
      tmdbKey: s.tmdbApiKey,
      country: s.saaCountry,
      cacheDir: path.join(app.getPath('userData'), 'cache')
    });
  } catch (e) {
    return { error: (e && e.message) || 'Home data failed to load.' };
  }
});

// ── IPC: watch history ("Continue watching" row) ──────────────────────────
ipcMain.handle('flux:history:list', () => library.listHistory(libraryFile()));
ipcMain.handle('flux:history:add', (_e, entry) => {
  try { return { history: library.addHistory(libraryFile(), entry) }; }
  catch (e) { return { error: (e && e.message) || 'Failed to record.' }; }
});
ipcMain.handle('flux:history:remove', (_e, imdbId) =>
  library.removeHistory(libraryFile(), imdbId));

// ── IPC: watched list (manual list that drives the suggestions) ──────────
ipcMain.handle('flux:watched:list', () => library.listWatched(libraryFile()));
ipcMain.handle('flux:watched:add', (_e, entry) => {
  try { return { watched: library.addWatched(libraryFile(), entry) }; }
  catch (e) { return { error: (e && e.message) || 'Failed to add.' }; }
});
ipcMain.handle('flux:watched:remove', (_e, imdbId) =>
  library.removeWatched(libraryFile(), imdbId));

// ── IPC: TMDB suggestion rows for the watched list ───────────────────────
ipcMain.handle('flux:suggestions', async () => {
  const s = loadSettings(settingsFile());
  const key = s.tmdbApiKey || '';
  if (!key) return { rows: [] };        // TMDB key cleared → no suggestions
  try {
    return await tmdbapi.buildSuggestionRows(
      key, library.listWatched(libraryFile()));
  } catch (e) {
    return { error: (e && e.message) || 'Suggestions failed to load.' };
  }
});

// ── IPC: TMDB id → IMDb id (opening a suggestion card's details) ─────────
ipcMain.handle('flux:tmdb:imdb', async (_e, tmdbId, type) => {
  const s = loadSettings(settingsFile());
  try {
    return { imdbId: await tmdbapi.tmdbToImdb(s.tmdbApiKey, tmdbId, type) };
  } catch (e) {
    return { error: (e && e.message) || 'Lookup failed.' };
  }
});

ipcMain.handle('flux:app:relaunch', () => {
  app.relaunch();
  app.exit(0);
  return true;
});

// IPC: GPU info for the settings panel (which renderer is actually active)
ipcMain.handle('flux:gpu:info', async () => {
  try {
    const info = await app.getGPUInfo('basic');
    const devs = info && (info.gpuDevice ?? info.devices);
    const arr = Array.isArray(devs) ? devs : devs ? [devs] : [];
    const active = arr.find((d) => d && d.active) || arr[0] || null;
    return {
      renderer: active && active.renderer ? String(active.renderer) : null,
      vendor: active && active.vendor ? String(active.vendor) : null
    };
  } catch (_) {
    return { renderer: null, vendor: null };
  }
});

app.whenReady().then(() => {
  if (squirrelStartup) return;   // Squirrel event run — no UI
  installPlayerInterceptors();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

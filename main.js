const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { searchAll, fetchMeta } = require('./search.js');
const { fetchStreams, cancelStreams } = require('./streams.js');

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
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

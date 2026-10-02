const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { searchAll, fetchMeta } = require('./search.js');

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

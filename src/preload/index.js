const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluxAPI', {
  search: (query) => ipcRenderer.invoke('flux:search', query),
  getMeta: (type, id) => ipcRenderer.invoke('flux:meta', type, id),
  getStreams: (params) => ipcRenderer.invoke('flux:streams', params),
  cancelStreams: () => ipcRenderer.invoke('flux:streams:cancel'),
  onStreamsProgress: (callback) => {
    ipcRenderer.on('flux:streams:progress', (_event, payload) => callback(payload));
  },
  // Subtitles (Helix SubtitleService port)
  searchSubtitles: (params) => ipcRenderer.invoke('flux:subs:search', params),
  cancelSubtitles: () => ipcRenderer.invoke('flux:subs:cancel'),
  downloadSubtitle: (variant) => ipcRenderer.invoke('flux:subs:download', variant),
  onSubsProgress: (callback) => {
    ipcRenderer.on('flux:subs:progress', (_event, payload) => callback(payload));
  },
  // Player: header injection / CORS rules for direct stream playback
  setPlayerRules: (rules) => ipcRenderer.invoke('flux:player-rules', rules),
  clearPlayerRules: () => ipcRenderer.invoke('flux:player-rules:clear'),
  // Settings (graphics backend etc.) + relaunch + GPU info
  getSettings: () => ipcRenderer.invoke('flux:settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('flux:settings:set', patch),
  relaunchApp: () => ipcRenderer.invoke('flux:app:relaunch'),
  getGpuInfo: () => ipcRenderer.invoke('flux:gpu:info'),
  // Home page (Cinemeta addon catalogs + TMDB trending)
  getHome: () => ipcRenderer.invoke('flux:home'),
  // Watch history ("Continue watching" row)
  historyList: () => ipcRenderer.invoke('flux:history:list'),
  historyAdd: (entry) => ipcRenderer.invoke('flux:history:add', entry),
  historyRemove: (imdbId) => ipcRenderer.invoke('flux:history:remove', imdbId),
  // Live playback position / artwork patch (Continue watching)
  historyProgress: (imdbId, patch) =>
    ipcRenderer.invoke('flux:history:progress', imdbId, patch),
  // Watched list (drives the suggestion rows)
  watchedList: () => ipcRenderer.invoke('flux:watched:list'),
  watchedAdd: (entry) => ipcRenderer.invoke('flux:watched:add', entry),
  watchedRemove: (imdbId) => ipcRenderer.invoke('flux:watched:remove', imdbId),
  // Want-to-watch list (mutually exclusive with watched)
  wantList: () => ipcRenderer.invoke('flux:want:list'),
  wantAdd: (entry) => ipcRenderer.invoke('flux:want:add', entry),
  wantRemove: (imdbId) => ipcRenderer.invoke('flux:want:remove', imdbId),
  // Custom frameless window controls (black title bar)
  winMinimize: () => ipcRenderer.invoke('flux:win:minimize'),
  winMaximize: () => ipcRenderer.invoke('flux:win:maximize'),
  winClose: () => ipcRenderer.invoke('flux:win:close'),
  winIsMaximized: () => ipcRenderer.invoke('flux:win:is-maximized'),
  onWinState: (callback) => {
    ipcRenderer.on('flux:win:state', (_event, payload) => callback(payload));
  },
  // Suggestions ("Because you watched …", TMDB) + TMDB→IMDb id lookup
  getSuggestions: () => ipcRenderer.invoke('flux:suggestions'),
  // Trailers: host-page URL for the YouTube embed (error-153 fix) and the
  // system-browser escape hatch
  trailerUrl: (ytId) => ipcRenderer.invoke('flux:trailer:url', ytId),
  openExternal: (url) => ipcRenderer.invoke('flux:open-external', url),
  appVersion: () => ipcRenderer.invoke('flux:app:version'),
  tmdbToImdb: (tmdbId, type) => ipcRenderer.invoke('flux:tmdb:imdb', tmdbId, type)
});

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
  // Home page (Streaming Availability API + TMDB: trending, top 10s, new)
  getHome: () => ipcRenderer.invoke('flux:home'),
  // Watch history ("Continue watching" row)
  historyList: () => ipcRenderer.invoke('flux:history:list'),
  historyAdd: (entry) => ipcRenderer.invoke('flux:history:add', entry),
  historyRemove: (imdbId) => ipcRenderer.invoke('flux:history:remove', imdbId),
  // Watched list (drives the suggestion rows)
  watchedList: () => ipcRenderer.invoke('flux:watched:list'),
  watchedAdd: (entry) => ipcRenderer.invoke('flux:watched:add', entry),
  watchedRemove: (imdbId) => ipcRenderer.invoke('flux:watched:remove', imdbId),
  // Suggestions ("Because you watched …", TMDB) + TMDB→IMDb id lookup
  getSuggestions: () => ipcRenderer.invoke('flux:suggestions'),
  tmdbToImdb: (tmdbId, type) => ipcRenderer.invoke('flux:tmdb:imdb', tmdbId, type)
});

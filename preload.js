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
  // Home page (Streaming Availability API: top 10s, popular per service, new)
  getHome: () => ipcRenderer.invoke('flux:home')
});

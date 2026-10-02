const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluxAPI', {
  search: (query) => ipcRenderer.invoke('flux:search', query),
  getMeta: (type, id) => ipcRenderer.invoke('flux:meta', type, id),
  getStreams: (params) => ipcRenderer.invoke('flux:streams', params),
  cancelStreams: () => ipcRenderer.invoke('flux:streams:cancel'),
  onStreamsProgress: (callback) => {
    ipcRenderer.on('flux:streams:progress', (_event, payload) => callback(payload));
  }
});

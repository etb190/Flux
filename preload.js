const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluxAPI', {
  search: (query) => ipcRenderer.invoke('flux:search', query),
  getMeta: (type, id) => ipcRenderer.invoke('flux:meta', type, id)
});

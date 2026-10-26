const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wuxianDesktop', {
  platform: process.platform,
  openGeneration: input => ipcRenderer.invoke('dola:open-generation', input),
  generationStatus: id => ipcRenderer.invoke('dola:generation-status', id),
  upload: (file) => ipcRenderer.invoke('asset:upload', file),
  downloadMedia: (url) => ipcRenderer.invoke('media:download', url),
  mediaCapabilities: () => ipcRenderer.invoke('media:capabilities'),
  processMedia: (request) => ipcRenderer.invoke('media:process', request),
  ready: () => ipcRenderer.invoke('desktop:ready'),
  loadRecovery: () => ipcRenderer.invoke('project:recovery'),
  autosave: (project) => ipcRenderer.invoke('project:autosave', project),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (project, saveAs) => ipcRenderer.invoke('project:save', project, saveAs),
  close: (project) => ipcRenderer.invoke('project:close', project),
  accounts: () => ipcRenderer.invoke('dola:accounts'),
  login: (id, label) => ipcRenderer.invoke('dola:login', id, label),
  removeAccount: (id) => ipcRenderer.invoke('dola:remove', id),
  request: (id, requestPath, body) => ipcRenderer.invoke('dola:request', id, requestPath, body),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('desktop:command', listener);
    return () => ipcRenderer.removeListener('desktop:command', listener);
  },
});

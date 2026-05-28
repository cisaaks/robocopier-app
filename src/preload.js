// preload.js - exposes a safe `window.api` to the renderer.
// Context isolation is on; the renderer cannot touch Node directly.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  config: {
    get:  () => ipcRenderer.invoke('config:get'),
    save: (data) => ipcRenderer.invoke('config:save', data),
  },
  tasks: {
    add:        (task) => ipcRenderer.invoke('task:add', task),
    update:     (originalName, task) => ipcRenderer.invoke('task:update', originalName, task),
    remove:     (names) => ipcRenderer.invoke('task:remove', names),
    refresh:    (names) => ipcRenderer.invoke('task:refresh', names),
    refreshAll: () => ipcRenderer.invoke('task:refresh-all'),
  },
  dialog: {
    pickFolder: (defaultPath) => ipcRenderer.invoke('dialog:pick-folder', defaultPath),
    confirm:    (message, title) => ipcRenderer.invoke('dialog:confirm', message, title),
    warn:       (message, title) => ipcRenderer.invoke('dialog:warn', message, title),
  },
  app: {
    version:      () => ipcRenderer.invoke('app:version'),
    checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
  },
  shell: {
    openFolder: (p) => ipcRenderer.invoke('shell:open-folder', p),
  },
  on: (channel, handler) => {
    const valid = ['update-status', 'tasks-updated'];
    if (!valid.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => handler(data));
  },
});

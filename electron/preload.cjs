const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('focusStore', {
  loadSnapshot: () => ipcRenderer.invoke('snapshot:load'),
  saveSnapshot: (snapshot) => ipcRenderer.invoke('snapshot:save', snapshot),
})

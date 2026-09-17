const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('focusStore', {
  loadSnapshot: () => ipcRenderer.invoke('snapshot:load'),
  saveSnapshot: (snapshot) => ipcRenderer.invoke('snapshot:save', snapshot),
  setTrayTooltip: (text) => ipcRenderer.invoke('tray:setTooltip', text),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  exportBoardToFile: (snapshot) => ipcRenderer.invoke('snapshot:exportToFile', snapshot),
  importBoardFromFile: () => ipcRenderer.invoke('snapshot:importFromFile'),
  clearBoardFile: () => ipcRenderer.invoke('snapshot:clear'),
  mcp: {
    getConfig: () => ipcRenderer.invoke('mcp:getConfig'),
    saveConfig: (config) => ipcRenderer.invoke('mcp:saveConfig', config),
    getConfigPath: () => ipcRenderer.invoke('mcp:getConfigPath'),
    listServers: () => ipcRenderer.invoke('mcp:listServers'),
    listTools: (serverName) => ipcRenderer.invoke('mcp:listTools', serverName),
    callTool: (serverName, toolName, args) =>
      ipcRenderer.invoke('mcp:callTool', { serverName, toolName, args }),
    restartServer: (serverName) => ipcRenderer.invoke('mcp:restartServer', serverName),
  },
  /**
   * Register cleanup before the app process exits (Electron `before-quit`).
   * Invoke `handler` (may be async), then notify main so `app.quit()` can finish.
   * Returns an unsubscribe function.
   */
  onPrepareShutdown: (handler) => {
    const wrapped = async () => {
      try {
        await handler()
      } catch (e) {
        console.error('focus:prepare-shutdown handler failed', e)
      } finally {
        ipcRenderer.send('focus:shutdown-ready')
      }
    }
    ipcRenderer.on('focus:prepare-shutdown', wrapped)
    return () => ipcRenderer.removeListener('focus:prepare-shutdown', wrapped)
  },
})

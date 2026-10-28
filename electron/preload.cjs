const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('focusStore', {
  setTrayTooltip: (text) => ipcRenderer.invoke('tray:setTooltip', text),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  exportBoardToFile: (snapshot) => ipcRenderer.invoke('snapshot:exportToFile', snapshot),
  importBoardFromFile: () => ipcRenderer.invoke('snapshot:importFromFile'),
  boards: {
    readSync: (boardId) => ipcRenderer.sendSync('boards:readSync', boardId),
    readCatalogSync: () => ipcRenderer.sendSync('boards:readCatalogSync'),
    locationSync: () => ipcRenderer.sendSync('boards:locationSync'),
    write: (boardId, json, options) => ipcRenderer.invoke('boards:write', boardId, json, options),
    writeCatalog: (json) => ipcRenderer.invoke('boards:writeCatalog', json),
    remove: (boardId) => ipcRenderer.invoke('boards:delete', boardId),
    listBackups: (boardId) => ipcRenderer.invoke('boards:listBackups', boardId),
    readBackup: (boardId, backupId) => ipcRenderer.invoke('boards:readBackup', boardId, backupId),
    keepUnreadable: (boardId, raw) => ipcRenderer.invoke('boards:keepUnreadable', boardId, raw),
    revealUnreadable: () => ipcRenderer.invoke('boards:revealUnreadable'),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  fetchOgMetadata: (url) => ipcRenderer.invoke('link:fetchOgMetadata', url),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  onCaptureOpen: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('capture:open', listener)
    return () => ipcRenderer.removeListener('capture:open', listener)
  },
  onMaximizedChange: (callback) => {
    const listener = (_event, isMax) => callback(isMax)
    ipcRenderer.on('window:maximized-changed', listener)
    return () => ipcRenderer.removeListener('window:maximized-changed', listener)
  },
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
  mcpHost: {
    getStatus: () => ipcRenderer.invoke('mcpHost:getStatus'),
    updateConfig: (partial) => ipcRenderer.invoke('mcpHost:updateConfig', partial),
    regenerateToken: () => ipcRenderer.invoke('mcpHost:regenerateToken'),
    registerTools: (tools) => ipcRenderer.send('mcpHost:registerTools', tools),
    onToolCall: (handler) => {
      const listener = async (_event, { requestId, name, args }) => {
        let result
        try {
          result = await handler(name, args)
        } catch (e) {
          result = { isError: true, content: [{ type: 'text', text: String((e && e.message) || e) }] }
        }
        ipcRenderer.send('mcpHost:result', { requestId, result })
      }
      ipcRenderer.on('mcpHost:call', listener)
      return () => ipcRenderer.removeListener('mcpHost:call', listener)
    },
  },
  claudeCode: {
    detect: () => ipcRenderer.invoke('claudeCode:detect'),
    run: (req) => ipcRenderer.invoke('claudeCode:run', req),
    cancel: (requestId) => ipcRenderer.invoke('claudeCode:cancel', requestId),
    onLine: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('claudeCode:line', listener)
      return () => ipcRenderer.removeListener('claudeCode:line', listener)
    },
    onExit: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('claudeCode:exit', listener)
      return () => ipcRenderer.removeListener('claudeCode:exit', listener)
    },
  },
  reminders: {
    set: (list) => ipcRenderer.send('reminders:set', list),
    onFired: (callback) => {
      const listener = (_event, nodeId) => callback(nodeId)
      ipcRenderer.on('reminders:fired', listener)
      return () => ipcRenderer.removeListener('reminders:fired', listener)
    },
    onOpen: (callback) => {
      const listener = (_event, nodeId) => callback(nodeId)
      ipcRenderer.on('reminders:open', listener)
      return () => ipcRenderer.removeListener('reminders:open', listener)
    },
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    getState: () => ipcRenderer.invoke('updater:getState'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onStatusChange: (callback) => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('updater:status-changed', listener)
      return () => ipcRenderer.removeListener('updater:status-changed', listener)
    },
  },
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  /**
   * Register cleanup before the app process exits (Electron `before-quit`).
   * Invoke `handler` (may be async), then notify main so `app.quit()` can finish.
   * Returns an unsubscribe function.
   */
  logbook: {
    append: (payload) => ipcRenderer.invoke('logbook:append', payload),
    listDays: (opts) => ipcRenderer.invoke('logbook:listDays', opts),
    getEntriesByIds: (ids) => ipcRenderer.invoke('logbook:getEntriesByIds', ids),
    removeEntry: (entryId) => ipcRenderer.invoke('logbook:removeEntry', entryId),
    search: (query) => ipcRenderer.invoke('logbook:search', query),
  },
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

contextBridge.exposeInMainWorld('electron', {
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
})

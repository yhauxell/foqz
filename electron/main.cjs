const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
  globalShortcut,
  dialog,
  session,
  shell,
} = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')
const { McpClientManager } = require('./mcp/McpClientManager.cjs')
const { getMcpConfigPath, loadMcpConfig } = require('./mcp/mcpConfig.cjs')

// Ensure production macOS app inherits full user shell PATH (npx, node, uvx, bun, etc.)
function fixSystemPath() {
  if (process.platform !== 'darwin') return

  const commonPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]

  const home = process.env.HOME || ''
  if (home) {
    commonPaths.unshift(
      path.join(home, '.local/bin'),
      path.join(home, '.cargo/bin'),
      path.join(home, '.bun/bin')
    )
    const nvmDir = path.join(home, '.nvm/versions/node')
    try {
      if (fsSync.existsSync(nvmDir)) {
        const versions = fsSync.readdirSync(nvmDir)
        for (const v of versions.reverse()) {
          const binPath = path.join(nvmDir, v, 'bin')
          if (fsSync.existsSync(binPath)) {
            commonPaths.unshift(binPath)
          }
        }
      }
    } catch {}
  }

  try {
    const userShell = process.env.SHELL || '/bin/zsh'
    const out = childProcess.execFileSync(
      userShell,
      ['-l', '-c', 'printf "%s" "$PATH"'],
      { encoding: 'utf8', timeout: 2000 }
    )
    if (out && typeof out === 'string' && out.includes('/')) {
      const shellPaths = out.split(':').filter(Boolean)
      const combined = Array.from(new Set([...shellPaths, ...commonPaths, ...(process.env.PATH || '').split(':')]))
      process.env.PATH = combined.filter(Boolean).join(':')
      return
    }
  } catch {}

  const current = (process.env.PATH || '').split(':').filter(Boolean)
  process.env.PATH = Array.from(new Set([...commonPaths, ...current])).join(':')
}

fixSystemPath()

const mcpManager = new McpClientManager()

app.setName('Foqz')
app.name = 'Foqz'

let mainWindow
let tray
let animating = false

/** Auto-update via electron-updater (publish config baked at build time, or FOCUS_UPDATE_URL). */
let autoUpdaterInstance = null
let isManualCheck = false
let updaterState = {
  status: 'idle', // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev-mode'
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  updateInfo: null,
  error: null,
  progress: null,
  lastChecked: null,
}

function sendUpdaterState() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('updater:status-changed', {
      ...updaterState,
      currentVersion: app.getVersion(),
      isPackaged: app.isPackaged,
    })
  }
}

function getAutoUpdater() {
  if (autoUpdaterInstance) return autoUpdaterInstance
  if (process.env.FOCUS_SKIP_UPDATER === '1') return null
  const genericUrl = process.env.FOCUS_UPDATE_URL
  const bakedConfigPath = path.join(process.resourcesPath, 'app-update.yml')
  const hasBakedFeed = fsSync.existsSync(bakedConfigPath)
  if (!app.isPackaged && !process.env.FOCUS_FORCE_DEV_UPDATER) {
    return null
  }
  if (!genericUrl && !hasBakedFeed && !process.env.FOCUS_FORCE_DEV_UPDATER) return null

  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    if (genericUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: genericUrl })
    }

    autoUpdater.on('checking-for-update', () => {
      updaterState.status = 'checking'
      updaterState.error = null
      updaterState.lastChecked = new Date().toISOString()
      sendUpdaterState()
    })

    autoUpdater.on('update-available', (info) => {
      updaterState.status = 'available'
      updaterState.updateInfo = info
      updaterState.error = null
      sendUpdaterState()
    })

    autoUpdater.on('download-progress', (progressObj) => {
      updaterState.status = 'downloading'
      updaterState.progress = {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      }
      sendUpdaterState()
    })

    autoUpdater.on('update-not-available', (info) => {
      updaterState.status = 'not-available'
      updaterState.updateInfo = info
      updaterState.progress = null
      updaterState.error = null
      sendUpdaterState()
      if (isManualCheck) {
        isManualCheck = false
        dialog.showMessageBox(mainWindow || undefined, {
          type: 'info',
          title: 'Foqz Update',
          message: 'You’re up to date!',
          detail: `Foqz ${app.getVersion()} is currently the newest version available.`,
        }).catch(() => {})
      }
    })

    autoUpdater.on('update-downloaded', (info) => {
      updaterState.status = 'downloaded'
      updaterState.updateInfo = info
      updaterState.progress = null
      sendUpdaterState()
      if (isManualCheck) {
        isManualCheck = false
        dialog.showMessageBox(mainWindow || undefined, {
          type: 'info',
          title: 'Update Ready',
          message: `Foqz ${info?.version || ''} has been downloaded.`,
          detail: 'Restart Foqz now to apply the update.',
          buttons: ['Restart & Install', 'Later'],
          defaultId: 0,
          cancelId: 1,
        }).then((res) => {
          if (res.response === 0) {
            autoUpdater.quitAndInstall()
          }
        }).catch(() => {})
      }
    })

    autoUpdater.on('error', (err) => {
      const errMsg = err?.message || String(err)
      console.error('[updater]', errMsg)
      updaterState.status = 'error'
      updaterState.error = errMsg
      updaterState.progress = null
      sendUpdaterState()
      if (isManualCheck) {
        isManualCheck = false
        dialog.showMessageBox(mainWindow || undefined, {
          type: 'warning',
          title: 'Update Check Failed',
          message: 'Unable to check for updates.',
          detail: errMsg,
        }).catch(() => {})
      }
    })

    autoUpdaterInstance = autoUpdater
    return autoUpdaterInstance
  } catch (e) {
    console.error('[updater] init failed', e)
    return null
  }
}

async function checkForUpdates(manual = false) {
  isManualCheck = manual
  const updater = getAutoUpdater()
  if (!updater) {
    if (!app.isPackaged) {
      updaterState.status = 'dev-mode'
      updaterState.error = null
      updaterState.currentVersion = app.getVersion()
      sendUpdaterState()
      if (manual) {
        dialog.showMessageBox(mainWindow || undefined, {
          type: 'info',
          title: 'Development Mode',
          message: 'Running in development mode',
          detail: `Version: ${app.getVersion()} (unpackaged). Auto-updater is active in packaged production builds.`,
        }).catch(() => {})
      }
      return { ok: false, status: 'dev-mode', currentVersion: app.getVersion() }
    }
    updaterState.status = 'error'
    updaterState.error = 'Update feed is not configured.'
    sendUpdaterState()
    return { ok: false, error: 'Update feed is not configured.' }
  }

  try {
    updaterState.status = 'checking'
    updaterState.error = null
    updaterState.lastChecked = new Date().toISOString()
    sendUpdaterState()
    const result = await updater.checkForUpdates()
    return { ok: true, updateInfo: result?.updateInfo, status: updaterState.status }
  } catch (err) {
    const errMsg = err?.message || String(err)
    updaterState.status = 'error'
    updaterState.error = errMsg
    sendUpdaterState()
    return { ok: false, error: errMsg }
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return
  if (process.env.FOCUS_SKIP_UPDATER === '1') return
  void checkForUpdates(false)
}

/** When false, first `before-quit` may be deferred so the renderer can stop timers and save. */
let appQuitting = false
let shutdownTimeout = null

const SNAPSHOT_FILE = 'board-snapshot.json'
const SETTINGS_FILE = 'app-settings.json'

const DEFAULT_SETTINGS = {
  defaultFocusMinutes: 25,
  durationPresets: [15, 25, 50],
  alwaysOnTop: true,
  pinWindow: false,
  rememberWindowBounds: true,
  windowBounds: null,
  openAtLogin: false,
  showDockIcon: false,
  globalToggleShortcut: 'CommandOrControl+Shift+F',
  notifyOnTimerEnd: true,
  playSoundOnTimerEnd: false,
  colorScheme: 'system',
  // 9am..5pm
  workingHours: { startMin: 9 * 60, endMin: 17 * 60 },
  typesafeEnabled: true,
  typesafeApiKey: '',
  typesafeBaseUrl: 'https://api.typesafe.ai',
  ollamaEnabled: true,
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaDefaultModel: '',
  openaiEnabled: false,
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiDefaultModel: 'gpt-4o-mini',
  geminiEnabled: false,
  geminiApiKey: '',
  geminiDefaultModel: 'gemini-1.5-flash',
}

/** @type {typeof DEFAULT_SETTINGS & { windowBounds: null | { x: number; y: number; width: number; height: number } }} */
let appSettings = { ...DEFAULT_SETTINGS }

function validBounds(b) {
  return (
    b &&
    typeof b === 'object' &&
    typeof b.x === 'number' &&
    typeof b.y === 'number' &&
    typeof b.width === 'number' &&
    typeof b.height === 'number' &&
    b.width >= 200 &&
    b.height >= 200
  )
}

function mergeSettings(parsed) {
  const d = { ...DEFAULT_SETTINGS }
  if (!parsed || typeof parsed !== 'object') return { ...d, windowBounds: null }

  const rawPresets = Array.isArray(parsed.durationPresets) ? parsed.durationPresets : d.durationPresets
  const durationPresets = [...new Set(rawPresets.map(Number).filter((n) => n >= 1 && n <= 480))].sort(
    (a, b) => a - b,
  )
  const presets = durationPresets.length ? durationPresets : d.durationPresets

  let defaultFocusMinutes =
    typeof parsed.defaultFocusMinutes === 'number' && Number.isFinite(parsed.defaultFocusMinutes)
      ? Math.round(parsed.defaultFocusMinutes)
      : d.defaultFocusMinutes
  defaultFocusMinutes = Math.min(480, Math.max(1, defaultFocusMinutes))
  if (!presets.includes(defaultFocusMinutes)) {
    defaultFocusMinutes = presets.reduce((best, cur) =>
      Math.abs(cur - defaultFocusMinutes) < Math.abs(best - defaultFocusMinutes) ? cur : best,
    presets[0])
  }

  const colorScheme = ['light', 'dark', 'system'].includes(parsed.colorScheme)
    ? parsed.colorScheme
    : d.colorScheme

  const globalToggleShortcut =
    typeof parsed.globalToggleShortcut === 'string' && parsed.globalToggleShortcut.trim()
      ? parsed.globalToggleShortcut.trim()
      : d.globalToggleShortcut

  const rawWh = parsed.workingHours && typeof parsed.workingHours === 'object' ? parsed.workingHours : d.workingHours
  const startMin =
    typeof rawWh.startMin === 'number' && Number.isFinite(rawWh.startMin) ? Math.max(0, Math.min(1440, Math.round(rawWh.startMin))) : d.workingHours.startMin
  const endMin =
    typeof rawWh.endMin === 'number' && Number.isFinite(rawWh.endMin) ? Math.max(0, Math.min(1440, Math.round(rawWh.endMin))) : d.workingHours.endMin
  const workingHours = startMin === endMin ? d.workingHours : { startMin, endMin }

  return {
    ...d,
    ...parsed,
    defaultFocusMinutes,
    durationPresets: presets,
    alwaysOnTop: typeof parsed.alwaysOnTop === 'boolean' ? parsed.alwaysOnTop : d.alwaysOnTop,
    pinWindow: typeof parsed.pinWindow === 'boolean' ? parsed.pinWindow : d.pinWindow,
    rememberWindowBounds:
      typeof parsed.rememberWindowBounds === 'boolean' ? parsed.rememberWindowBounds : d.rememberWindowBounds,
    windowBounds: validBounds(parsed.windowBounds) ? parsed.windowBounds : null,
    openAtLogin: typeof parsed.openAtLogin === 'boolean' ? parsed.openAtLogin : d.openAtLogin,
    showDockIcon: typeof parsed.showDockIcon === 'boolean' ? parsed.showDockIcon : d.showDockIcon,
    globalToggleShortcut,
    notifyOnTimerEnd:
      typeof parsed.notifyOnTimerEnd === 'boolean' ? parsed.notifyOnTimerEnd : d.notifyOnTimerEnd,
    playSoundOnTimerEnd:
      typeof parsed.playSoundOnTimerEnd === 'boolean' ? parsed.playSoundOnTimerEnd : d.playSoundOnTimerEnd,
    colorScheme,
    workingHours,
    typesafeEnabled:
      typeof parsed.typesafeEnabled === 'boolean' ? parsed.typesafeEnabled : d.typesafeEnabled,
    typesafeApiKey:
      typeof parsed.typesafeApiKey === 'string' ? parsed.typesafeApiKey.trim() : d.typesafeApiKey,
    typesafeBaseUrl:
      typeof parsed.typesafeBaseUrl === 'string' && parsed.typesafeBaseUrl.trim()
        ? parsed.typesafeBaseUrl.trim().replace(/\/+$/, '')
        : d.typesafeBaseUrl,
    ollamaEnabled:
      typeof parsed.ollamaEnabled === 'boolean' ? parsed.ollamaEnabled : d.ollamaEnabled,
    ollamaBaseUrl:
      typeof parsed.ollamaBaseUrl === 'string' && parsed.ollamaBaseUrl.trim()
        ? parsed.ollamaBaseUrl.trim().replace(/\/+$/, '')
        : d.ollamaBaseUrl,
    ollamaDefaultModel:
      typeof parsed.ollamaDefaultModel === 'string'
        ? parsed.ollamaDefaultModel.trim()
        : d.ollamaDefaultModel,
    openaiEnabled:
      typeof parsed.openaiEnabled === 'boolean' ? parsed.openaiEnabled : d.openaiEnabled,
    openaiApiKey:
      typeof parsed.openaiApiKey === 'string' ? parsed.openaiApiKey.trim() : d.openaiApiKey,
    openaiBaseUrl:
      typeof parsed.openaiBaseUrl === 'string' && parsed.openaiBaseUrl.trim()
        ? parsed.openaiBaseUrl.trim().replace(/\/+$/, '')
        : d.openaiBaseUrl,
    openaiDefaultModel:
      typeof parsed.openaiDefaultModel === 'string'
        ? parsed.openaiDefaultModel.trim()
        : d.openaiDefaultModel,
    geminiEnabled:
      typeof parsed.geminiEnabled === 'boolean' ? parsed.geminiEnabled : d.geminiEnabled,
    geminiApiKey:
      typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : d.geminiApiKey,
    geminiDefaultModel:
      typeof parsed.geminiDefaultModel === 'string'
        ? parsed.geminiDefaultModel.trim()
        : d.geminiDefaultModel,
    activeAiProvider:
      ['ollama', 'openai', 'gemini'].includes(parsed.activeAiProvider)
        ? parsed.activeAiProvider
        : d.activeAiProvider,
  }
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

async function loadSettingsFromDisk() {
  try {
    const raw = await fs.readFile(getSettingsPath(), 'utf8')
    appSettings = mergeSettings(JSON.parse(raw))
  } catch {
    appSettings = mergeSettings(null)
  }
}

async function saveSettingsToDisk() {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(getSettingsPath(), JSON.stringify(appSettings, null, 2), 'utf8')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

function applyLoginItem() {
  // macOS returns EPERM for the unpackaged `electron` CLI; login items only apply to the shipped .app.
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: appSettings.openAtLogin })
  } catch {}
}

function applyDockIcon() {
  if (!app.dock) return
  try {
    const iconPath = path.join(__dirname, '../electron-assets/icon.png')
    if (fsSync.existsSync(iconPath)) {
      app.dock.setIcon(iconPath)
    }
    if (appSettings.showDockIcon) {
      app.dock.show()
    } else {
      app.dock.hide()
    }
  } catch {}
}

function applyAlwaysOnTop() {
  try {
    mainWindow?.setAlwaysOnTop(appSettings.alwaysOnTop)
  } catch {}
}

let boundsSaveTimer = null
function scheduleSaveBounds() {
  if (!appSettings.rememberWindowBounds || !mainWindow) return
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer)
  boundsSaveTimer = setTimeout(() => {
    boundsSaveTimer = null
    const b = mainWindow.getBounds()
    appSettings.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height }
    saveSettingsToDisk().catch(() => {})
  }, 400)
}

function registerToggleShortcut() {
  globalShortcut.unregisterAll()
  try {
    const ok = globalShortcut.register(appSettings.globalToggleShortcut, toggleWindow)
    return { ok, error: ok ? undefined : 'Could not register shortcut (invalid or reserved).' }
  } catch (e) {
    return { ok: false, error: e.message || 'Shortcut registration failed.' }
  }
}

function createTrayIcon() {
  const trayPath = path.join(__dirname, '../electron-assets/trayTemplate.png')
  if (fsSync.existsSync(trayPath)) {
    const icon = nativeImage.createFromPath(trayPath)
    icon.setTemplateImage(true)
    return icon
  }

  // Fallback: procedural 2-tone focus target buffer (18x18)
  const size = 18
  const canvas = Buffer.alloc(size * size * 4, 0)
  const cx = size / 2.0
  const cy = size / 2.0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d <= 1.8) {
        // Center dot: solid
        canvas[idx + 3] = 255
      } else if (Math.abs(d - 3.8) <= 0.6) {
        // Inner ring: solid
        canvas[idx + 3] = 255
      } else if (d >= 4.8 && d <= 6.8) {
        // 2-tone middle band: 45% opacity
        canvas[idx + 3] = 115
      } else if (Math.abs(d - 7.8) <= 0.6) {
        // Outer ring: solid
        canvas[idx + 3] = 255
      }
    }
  }

  const icon = nativeImage.createFromBuffer(canvas, { width: size, height: size })
  icon.setTemplateImage(true)
  return icon
}

function centerWindow() {
  if (!mainWindow) return

  const { width, height } = mainWindow.getBounds()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2)

  mainWindow.setPosition(x, y, true)
}

function animateOpacity(from, to, duration, onDone) {
  const steps = Math.ceil(duration / 16)
  const delta = (to - from) / steps
  let step = 0
  let current = from

  animating = true
  const interval = setInterval(() => {
    step++
    current += delta
    if (step >= steps) {
      current = to
      clearInterval(interval)
      animating = false
      onDone?.()
    }
    try { mainWindow?.setOpacity(current) } catch {}
  }, 16)
}

function showWindow() {
  if (!mainWindow || animating) return
  centerWindow()
  mainWindow.setOpacity(0)
  mainWindow.show()
  mainWindow.focus()
  animateOpacity(0, 1, 150)
}

function hideWindow() {
  if (!mainWindow || !mainWindow.isVisible() || animating) return
  animateOpacity(1, 0, 120, () => {
    mainWindow?.hide()
    try { mainWindow?.setOpacity(1) } catch {}
  })
}

function toggleWindow() {
  if (!mainWindow || animating) return

  if (mainWindow.isVisible()) {
    hideWindow()
  } else {
    showWindow()
  }
}

function attachWindowBoundsListeners() {
  if (!mainWindow) return
  mainWindow.removeAllListeners('moved')
  mainWindow.removeAllListeners('resized')
  if (!appSettings.rememberWindowBounds) return
  mainWindow.on('moved', scheduleSaveBounds)
  mainWindow.on('resized', scheduleSaveBounds)
}

function attachBlurHandler() {
  if (!mainWindow) return
  mainWindow.removeAllListeners('blur')
  mainWindow.on('blur', () => {
    if (appSettings.pinWindow) return
    if (!mainWindow.webContents.isDevToolsOpened()) {
      hideWindow()
    }
  })
}

function createWindow() {
  const appIconPath = path.join(__dirname, '../electron-assets/icon.png')
  const opts = {
    title: 'Foqz',
    width: 980,
    height: 720,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#00000000',
    icon: fsSync.existsSync(appIconPath) ? appIconPath : undefined,
    alwaysOnTop: appSettings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }

  if (appSettings.rememberWindowBounds && validBounds(appSettings.windowBounds)) {
    const b = appSettings.windowBounds
    opts.x = b.x
    opts.y = b.y
    opts.width = b.width
    opts.height = b.height
  }

  mainWindow = new BrowserWindow(opts)

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (typeof event === 'object' && event && 'message' in event) {
      console.log(`[RENDERER:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`)
    } else {
      console.log(`[RENDERER:${level}] ${message} (${sourceId}:${line})`)
    }
  })

  attachBlurHandler()
  attachWindowBoundsListeners()
}

function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('Foqz')
  tray.on('click', toggleWindow)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Toggle Foqz', click: toggleWindow },
    { type: 'separator' },
    {
      label: 'Check for Updates...',
      click: () => {
        void checkForUpdates(true)
      },
    },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ])

  tray.setContextMenu(contextMenu)
}

function getSnapshotPath() {
  return path.join(app.getPath('userData'), SNAPSHOT_FILE)
}

ipcMain.handle('snapshot:load', async () => {
  try {
    const data = await fs.readFile(getSnapshotPath(), 'utf8')
    return JSON.parse(data)
  } catch {
    return null
  }
})

ipcMain.handle('snapshot:save', async (_event, snapshot) => {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(getSnapshotPath(), JSON.stringify(snapshot), 'utf8')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('snapshot:clear', async () => {
  try {
    await fs.unlink(getSnapshotPath())
    return { ok: true }
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: true }
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('snapshot:exportToFile', async (_event, snapshot) => {
  if (!mainWindow) return { ok: false, error: 'No window' }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Foqz board',
    defaultPath: 'foqz-board.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }
  try {
    await fs.writeFile(result.filePath, JSON.stringify(snapshot), 'utf8')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('snapshot:importFromFile', async () => {
  if (!mainWindow) return { ok: false, error: 'No window' }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Foqz board',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true }
  try {
    const data = await fs.readFile(result.filePaths[0], 'utf8')
    const snapshot = JSON.parse(data)
    return { ok: true, snapshot }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('tray:setTooltip', (_event, text) => {
  try {
    if (tray && typeof text === 'string') {
      tray.setToolTip(text.slice(0, 120))
    }
  } catch {}
})

ipcMain.handle('settings:get', async () => {
  return appSettings
})

ipcMain.handle('updater:check', async () => {
  return checkForUpdates(false)
})

ipcMain.handle('updater:getState', () => {
  return {
    ...updaterState,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  }
})

ipcMain.handle('updater:quitAndInstall', () => {
  if (autoUpdaterInstance) {
    autoUpdaterInstance.quitAndInstall()
    return { ok: true }
  }
  return { ok: false, error: 'Updater not initialized' }
})

ipcMain.handle('app:getVersion', () => {
  return { version: app.getVersion(), isPackaged: app.isPackaged }
})

ipcMain.on('focus:shutdown-ready', () => {
  if (shutdownTimeout) {
    clearTimeout(shutdownTimeout)
    shutdownTimeout = null
  }
  appQuitting = true
  app.quit()
})

ipcMain.handle('settings:set', async (_event, partial) => {
  const prevShortcut = appSettings.globalToggleShortcut
  appSettings = mergeSettings({ ...appSettings, ...partial })
  const shortcutResult = registerToggleShortcut()
  if (!shortcutResult.ok) {
    appSettings = mergeSettings({ ...appSettings, globalToggleShortcut: prevShortcut })
    registerToggleShortcut()
    await saveSettingsToDisk()
    return { ok: false, error: shortcutResult.error, settings: appSettings }
  }
  applyAlwaysOnTop()
  applyLoginItem()
  applyDockIcon()
  attachBlurHandler()
  attachWindowBoundsListeners()
  const save = await saveSettingsToDisk()
  if (!save.ok) return { ok: false, error: save.error, settings: appSettings }
  return { ok: true, settings: appSettings }
})

// --- MCP IPC Handlers ---

ipcMain.handle('mcp:getConfig', async () => {
  return loadMcpConfig(app.getPath('userData'))
})

ipcMain.handle('mcp:saveConfig', async (_event, config) => {
  return mcpManager.updateConfig(config)
})

ipcMain.handle('mcp:getConfigPath', async () => {
  return getMcpConfigPath(app.getPath('userData'))
})

ipcMain.handle('mcp:listServers', async () => {
  return mcpManager.listServers()
})

ipcMain.handle('mcp:listTools', async (_event, serverName) => {
  return mcpManager.listTools(serverName)
})

ipcMain.handle('mcp:callTool', async (_event, { serverName, toolName, args }) => {
  return mcpManager.callTool(serverName, toolName, args)
})

ipcMain.handle('mcp:restartServer', async (_event, serverName) => {
  return mcpManager.restartServer(serverName)
})

ipcMain.handle('jev:evaluate', async (_event, { req, options }) => {
  const apiKey = (
    options?.apiKey ||
    appSettings.typesafeApiKey ||
    process.env.TYPESAFE_API_KEY ||
    ''
  ).trim()
  const baseUrl = (
    options?.baseUrl ||
    appSettings.typesafeBaseUrl ||
    'https://api.typesafe.ai'
  ).trim()
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/systemone`

  if (!apiKey) {
    throw new Error('TypeSafe API Key is missing. Please configure it in Foqz Settings.')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      state: req.state,
      model: req.model || 'jev-latest',
      questions: req.questions,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      if (parsed?.detail?.message) message = parsed.detail.message
      else if (parsed?.message) message = parsed.message
      else if (Array.isArray(parsed?.detail)) {
        message = parsed.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
      }
    } catch {}
    throw new Error(`TypeSafe API error (${response.status}): ${message || response.statusText}`)
  }

  return response.json()
})

app.on('before-quit', (e) => {
  mcpManager.disconnectAll().catch(() => {})
  if (appQuitting) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  e.preventDefault()
  shutdownTimeout = setTimeout(() => {
    shutdownTimeout = null
    appQuitting = true
    app.quit()
  }, 8000)
  try {
    mainWindow.webContents.send('focus:prepare-shutdown')
  } catch {
    appQuitting = true
    app.quit()
  }
})

function setupAppMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac
      ? [
          {
            label: 'Foqz',
            submenu: [
              { label: 'About Foqz', role: 'about' },
              { type: 'separator' },
              {
                label: 'Check for Updates...',
                click: () => {
                  void checkForUpdates(true)
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { label: 'Hide Foqz', role: 'hide' },
              { label: 'Hide Others', role: 'hideOthers' },
              { label: 'Show All', role: 'unhide' },
              { type: 'separator' },
              { label: 'Quit Foqz', role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        ...(!isMac
          ? [
              {
                label: 'Check for Updates...',
                click: () => {
                  void checkForUpdates(true)
                },
              },
              { type: 'separator' },
            ]
          : []),
        {
          label: 'GitHub Repository',
          click: () => {
            void shell.openExternal('https://github.com/yhauxell/foqz')
          },
        },
        {
          label: 'Release Notes',
          click: () => {
            void shell.openExternal('https://github.com/yhauxell/foqz/releases')
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  if (session && session.defaultSession) {
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://api.typesafe.ai/*'] },
      (details, callback) => {
        delete details.requestHeaders['Origin']
        delete details.requestHeaders['origin']
        delete details.requestHeaders['Referer']
        delete details.requestHeaders['referer']
        callback({ cancel: false, requestHeaders: details.requestHeaders })
      },
    )

    session.defaultSession.webRequest.onHeadersReceived(
      { urls: ['https://api.typesafe.ai/*'] },
      (details, callback) => {
        const responseHeaders = { ...details.responseHeaders }
        responseHeaders['access-control-allow-origin'] = ['*']
        responseHeaders['access-control-allow-methods'] = ['GET, POST, OPTIONS, PUT, PATCH, DELETE']
        responseHeaders['access-control-allow-headers'] = ['*']
        callback({ cancel: false, responseHeaders })
      },
    )
  }

  setupAppMenu()
  await loadSettingsFromDisk()
  applyDockIcon()
  applyLoginItem()
  createWindow()
  createTray()

  const reg = registerToggleShortcut()
  if (!reg.ok) {
    appSettings = mergeSettings({
      ...appSettings,
      globalToggleShortcut: DEFAULT_SETTINGS.globalToggleShortcut,
    })
    registerToggleShortcut()
    saveSettingsToDisk().catch(() => {})
  }

  showWindow()

  mcpManager.init(app.getPath('userData')).catch((err) => {
    console.error('[mcpManager] initialization error:', err)
  })

  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  mcpManager.disconnectAll().catch(() => {})
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})

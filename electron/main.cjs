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
} = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

let mainWindow
let tray
let animating = false

/** Auto-update via electron-updater (publish config baked at build time, or FOCUS_UPDATE_URL). Dev / unpackaged: no-op. */
function setupAutoUpdater() {
  if (!app.isPackaged) return
  if (process.env.FOCUS_SKIP_UPDATER === '1') return
  const genericUrl = process.env.FOCUS_UPDATE_URL
  const bakedConfigPath = path.join(process.resourcesPath, 'app-update.yml')
  const hasBakedFeed = fsSync.existsSync(bakedConfigPath)
  if (!genericUrl && !hasBakedFeed) return
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    if (genericUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: genericUrl })
    }
    autoUpdater.on('error', (err) => {
      console.error('[updater]', err?.message || err)
    })
    void autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.error('[updater] init failed', e)
  }
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
  try {
    app.setLoginItemSettings({ openAtLogin: appSettings.openAtLogin })
  } catch {}
}

function applyDockIcon() {
  if (!app.dock) return
  try {
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
  const size = 16
  const canvas = Buffer.alloc(size * size * 4, 0)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const inBounds = x >= 1 && x <= 14 && y >= 1 && y <= 14
      const isLine1 = y >= 4 && y <= 5 && x >= 3 && x <= 12
      const isLine2 = y >= 7 && y <= 8 && x >= 3 && x <= 12
      const isLine3 = y >= 10 && y <= 11 && x >= 3 && x <= 9

      if (isLine1 || isLine2 || isLine3) {
        canvas[idx] = 255; canvas[idx + 1] = 255; canvas[idx + 2] = 255; canvas[idx + 3] = 255
      } else if (inBounds) {
        canvas[idx] = 0; canvas[idx + 1] = 0; canvas[idx + 2] = 0; canvas[idx + 3] = 255
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
  const opts = {
    width: 980,
    height: 720,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#00000000',
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

app.on('before-quit', (e) => {
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

app.whenReady().then(async () => {
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

  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})

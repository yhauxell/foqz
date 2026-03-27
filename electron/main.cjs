const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, globalShortcut } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

let mainWindow
let tray
let animating = false

const SNAPSHOT_FILE = 'board-snapshot.json'

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }

  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      hideWindow()
    }
  })
}

function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('Focus Mini App')
  tray.on('click', toggleWindow)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Toggle Canvas', click: toggleWindow },
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

app.whenReady().then(() => {
  if (app.dock) app.dock.hide()

  createWindow()
  createTray()

  globalShortcut.register('CommandOrControl+Shift+F', toggleWindow)

  showWindow()

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

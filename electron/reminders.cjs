const { Notification } = require('electron')

const CHECK_INTERVAL_MS = 15_000

/**
 * Fires desktop notifications for element reminders. Lives in main because the renderer's
 * timers are throttled while the window is hidden in the tray. The renderer pushes the list of
 * pending reminders whenever it changes and marks each one fired when told so.
 */
class ReminderScheduler {
  /**
   * @param {{ ipcMain: Electron.IpcMain, getWindow: () => Electron.BrowserWindow | null, showWindow: () => void }} opts
   */
  constructor({ ipcMain, getWindow, showWindow }) {
    this.getWindow = getWindow
    this.showWindow = showWindow
    /** @type {{ nodeId: string, at: number, title: string }[]} */
    this.reminders = []
    // Fired here but not yet cleared by the renderer; keeps one reminder from ringing twice.
    this.fired = new Set()
    this.timer = null
    // Kept alive until clicked or closed, or macOS drops the click handler.
    this.shown = new Set()

    ipcMain.on('reminders:set', (_event, list) => {
      this.reminders = Array.isArray(list)
        ? list.filter((r) => r && typeof r.nodeId === 'string' && Number.isFinite(r.at))
        : []
      const pendingIds = new Set(this.reminders.map((r) => `${r.nodeId}@${r.at}`))
      for (const key of this.fired) if (!pendingIds.has(key)) this.fired.delete(key)
      this.check()
    })

    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS)
  }

  check() {
    const now = Date.now()
    for (const r of this.reminders) {
      const key = `${r.nodeId}@${r.at}`
      if (r.at > now || this.fired.has(key)) continue
      this.fired.add(key)
      this.notify(r)
      this.getWindow()?.webContents.send('reminders:fired', r.nodeId)
    }
  }

  notify(r) {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: 'Reminder', body: r.title || 'Something on your canvas', silent: false })
    this.shown.add(n)
    n.on('click', () => {
      this.shown.delete(n)
      this.showWindow()
      this.getWindow()?.webContents.send('reminders:open', r.nodeId)
    })
    n.on('close', () => this.shown.delete(n))
    n.show()
  }

  dispose() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

module.exports = { ReminderScheduler }

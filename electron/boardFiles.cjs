const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

/**
 * Boards on disk, under `<userData>/boards`:
 *
 *   catalog.json                    board list (ids, names)
 *   <boardId>.json                  latest snapshot of each board
 *   backups/<boardId>/<ms>.json     earlier versions, rotated
 *   unreadable/<boardId>-<ms>.json  data that could not be read, kept for recovery
 *
 * Every write goes to a temp file, is fsynced, then renamed over the target, so a crash or power
 * loss leaves either the old or the new file, never a torn one. Writes to the same file are
 * serialized so an older save can't land after a newer one.
 */

/** A new backup is taken before overwriting a board when the newest backup is older than this. */
const BACKUP_INTERVAL_MS = 5 * 60 * 1000
/** Most recent backups always kept. */
const KEEP_RECENT = 20
/** Beyond those, the newest backup of each day is kept for this many days. */
const KEEP_DAILY_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const BACKUP_PATTERN = /^\d{13,16}\.json$/

function assertId(boardId) {
  if (typeof boardId !== 'string' || !ID_PATTERN.test(boardId)) {
    throw new Error(`Invalid board id: ${String(boardId)}`)
  }
}

const boardsDir = (root) => path.join(root, 'boards')
const boardPath = (root, id) => path.join(boardsDir(root), `${id}.json`)
const catalogPath = (root) => path.join(boardsDir(root), 'catalog.json')
const backupDir = (root, id) => path.join(boardsDir(root), 'backups', id)
const unreadableDir = (root) => path.join(boardsDir(root), 'unreadable')
const backupName = (ms) => `${String(ms).padStart(13, '0')}.json`

let tmpCounter = 0

async function writeAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${++tmpCounter}`
  const handle = await fs.open(tmp, 'w')
  try {
    await handle.writeFile(data, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(tmp, filePath)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
}

/** Per-file promise chains: each write starts after the previous one to that file settles. */
const chains = new Map()

function serialized(key, task) {
  const run = (chains.get(key) || Promise.resolve()).then(task, task)
  const tail = run.catch(() => {})
  chains.set(key, tail)
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key)
  })
  return run
}

function readSyncOrNull(filePath) {
  try {
    return fsSync.readFileSync(filePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

function readBoardSync(root, boardId) {
  assertId(boardId)
  return readSyncOrNull(boardPath(root, boardId))
}

function readCatalogSync(root) {
  return readSyncOrNull(catalogPath(root))
}

async function listBackupFiles(root, boardId) {
  try {
    const names = await fs.readdir(backupDir(root, boardId))
    return names.filter((n) => BACKUP_PATTERN.test(n)).sort()
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

/** Names of backups to delete: keep the newest KEEP_RECENT, plus the newest per day for KEEP_DAILY_DAYS. */
function backupsToPrune(names, now) {
  const newestFirst = [...names].sort().reverse()
  const keep = new Set(newestFirst.slice(0, KEEP_RECENT))
  const seenDays = new Set()
  for (const name of newestFirst) {
    const at = Number(name.slice(0, -5))
    if (now - at > KEEP_DAILY_DAYS * DAY_MS) continue
    const day = Math.floor(at / DAY_MS)
    if (seenDays.has(day)) continue
    seenDays.add(day)
    keep.add(name)
  }
  return newestFirst.filter((n) => !keep.has(n))
}

async function backupCurrent(root, boardId, now) {
  const current = await fs.readFile(boardPath(root, boardId), 'utf8').catch((err) => {
    if (err.code === 'ENOENT') return null
    throw err
  })
  if (current === null) return
  await writeAtomic(path.join(backupDir(root, boardId), backupName(now)), current)
  for (const name of backupsToPrune(await listBackupFiles(root, boardId), now)) {
    await fs.rm(path.join(backupDir(root, boardId), name), { force: true })
  }
}

/**
 * Replace a board's file. The version being replaced is kept as a backup when the newest backup is
 * older than BACKUP_INTERVAL_MS, or always with `forceBackup`.
 */
function writeBoard(root, boardId, json, { forceBackup = false, now = Date.now() } = {}) {
  assertId(boardId)
  return serialized(boardPath(root, boardId), async () => {
    const backups = await listBackupFiles(root, boardId)
    const newest = backups.length ? Number(backups[backups.length - 1].slice(0, -5)) : 0
    if (forceBackup || now - newest >= BACKUP_INTERVAL_MS) await backupCurrent(root, boardId, now)
    await writeAtomic(boardPath(root, boardId), json)
  })
}

function writeCatalog(root, json) {
  return serialized(catalogPath(root), () => writeAtomic(catalogPath(root), json))
}

/** Delete a board's file. Its last version is kept as a backup. */
function deleteBoard(root, boardId, { now = Date.now() } = {}) {
  assertId(boardId)
  return serialized(boardPath(root, boardId), async () => {
    await backupCurrent(root, boardId, now)
    await fs.rm(boardPath(root, boardId), { force: true })
  })
}

async function listBackups(root, boardId) {
  assertId(boardId)
  const names = await listBackupFiles(root, boardId)
  const result = []
  for (const name of names.reverse()) {
    const stat = await fs.stat(path.join(backupDir(root, boardId), name)).catch(() => null)
    if (stat) result.push({ id: name, at: Number(name.slice(0, -5)), bytes: stat.size })
  }
  return result
}

async function readBackup(root, boardId, backupId) {
  assertId(boardId)
  if (typeof backupId !== 'string' || !BACKUP_PATTERN.test(backupId)) {
    throw new Error(`Invalid backup id: ${String(backupId)}`)
  }
  return fs.readFile(path.join(backupDir(root, boardId), backupId), 'utf8')
}

/** Keep data that could not be read, so replacing the board never destroys it. Returns its path. */
async function keepUnreadable(root, boardId, raw, { now = Date.now() } = {}) {
  assertId(boardId)
  const filePath = path.join(unreadableDir(root), `${boardId}-${now}.json`)
  await writeAtomic(filePath, String(raw))
  return filePath
}

/** Wait for every queued write to finish. */
async function whenIdle() {
  while (chains.size > 0) await Promise.all([...chains.values()])
}

module.exports = {
  BACKUP_INTERVAL_MS,
  KEEP_RECENT,
  KEEP_DAILY_DAYS,
  boardsDir,
  readBoardSync,
  readCatalogSync,
  writeBoard,
  writeCatalog,
  deleteBoard,
  listBackups,
  readBackup,
  keepUnreadable,
  backupsToPrune,
  whenIdle,
}

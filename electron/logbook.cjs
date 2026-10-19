const fs = require('node:fs/promises')
const path = require('node:path')

function getLogbookDir(userDataPath) {
  return path.join(userDataPath, 'logbook')
}

function getMonthFilePath(userDataPath, month) {
  return path.join(getLogbookDir(userDataPath), `${month}.json`)
}

async function readMonthFile(userDataPath, month) {
  const filePath = getMonthFilePath(userDataPath, month)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    // Support either { days: Record<string, LogbookDay> } or LogbookDay[]
    if (Array.isArray(parsed)) {
      const days = {}
      for (const d of parsed) {
        if (d && d.workdayId) days[d.workdayId] = d
      }
      return { days }
    }
    if (parsed && typeof parsed.days === 'object') {
      return parsed
    }
    return { days: {} }
  } catch (e) {
    if (e.code === 'ENOENT') return { days: {} }
    console.error(`[logbook] Failed to read ${filePath}:`, e)
    return { days: {} }
  }
}

async function writeMonthFile(userDataPath, month, data) {
  const logbookDir = getLogbookDir(userDataPath)
  await fs.mkdir(logbookDir, { recursive: true })
  const filePath = getMonthFilePath(userDataPath, month)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

async function appendLogbookEntries(userDataPath, { workdayId, window, entries = [], summary }) {
  if (!workdayId) throw new Error('workdayId is required')
  const month = workdayId.slice(0, 7)
  const monthData = await readMonthFile(userDataPath, month)
  if (!monthData.days) monthData.days = {}

  const existingDay = monthData.days[workdayId] || {
    workdayId,
    window: window || { startMin: 540, endMin: 1020 },
    sweptAt: Date.now(),
    entries: [],
  }

  if (window) existingDay.window = window
  if (summary) existingDay.summary = summary
  existingDay.sweptAt = Date.now()

  // Merge entries by ID
  const entryMap = new Map()
  for (const item of existingDay.entries) {
    if (item && item.id) entryMap.set(item.id, item)
  }
  for (const item of entries) {
    if (item && item.id) entryMap.set(item.id, item)
  }
  existingDay.entries = Array.from(entryMap.values())

  monthData.days[workdayId] = existingDay
  await writeMonthFile(userDataPath, month, monthData)

  return { ok: true, sweptCount: entries.length, workdayId }
}

async function listLogbookDays(userDataPath, { limitMonths = 12 } = {}) {
  const logbookDir = getLogbookDir(userDataPath)
  let files = []
  try {
    files = await fs.readdir(logbookDir)
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }

  const monthFiles = files
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, limitMonths)

  const allDays = []
  for (const file of monthFiles) {
    const month = file.replace('.json', '')
    const monthData = await readMonthFile(userDataPath, month)
    if (monthData.days) {
      for (const day of Object.values(monthData.days)) {
        if (day && day.workdayId) {
          allDays.push(day)
        }
      }
    }
  }

  // Sort days descending by workdayId
  allDays.sort((a, b) => b.workdayId.localeCompare(a.workdayId))
  return allDays
}

async function getLogbookEntriesByIds(userDataPath, ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const idSet = new Set(ids)
  const days = await listLogbookDays(userDataPath)
  const results = []

  for (const day of days) {
    if (!day.entries) continue
    for (const entry of day.entries) {
      if (idSet.has(entry.id)) {
        results.push(entry)
      }
    }
  }
  return results
}

async function removeLogbookEntry(userDataPath, entryId) {
  if (!entryId) return { ok: false, error: 'entryId is required' }
  const logbookDir = getLogbookDir(userDataPath)
  let files = []
  try {
    files = await fs.readdir(logbookDir)
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, error: 'Logbook empty' }
    throw e
  }

  const monthFiles = files.filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
  for (const file of monthFiles) {
    const month = file.replace('.json', '')
    const monthData = await readMonthFile(userDataPath, month)
    let modified = false
    let removedEntry = null

    if (monthData.days) {
      for (const day of Object.values(monthData.days)) {
        const idx = day.entries.findIndex((e) => e.id === entryId)
        if (idx !== -1) {
          removedEntry = day.entries[idx]
          day.entries.splice(idx, 1)
          modified = true
          break
        }
      }
    }

    if (modified) {
      await writeMonthFile(userDataPath, month, monthData)
      return { ok: true, removedEntry }
    }
  }

  return { ok: false, error: 'Entry not found' }
}

async function searchLogbook(userDataPath, query) {
  if (!query || typeof query !== 'string') return []
  const q = query.toLowerCase().trim()
  const days = await listLogbookDays(userDataPath)
  const matches = []

  for (const day of days) {
    if (!day.entries) continue
    for (const entry of day.entries) {
      const matchTitle = entry.title?.toLowerCase().includes(q)
      const matchNotes = entry.notes?.toLowerCase().includes(q)
      const matchProject = entry.projectTitle?.toLowerCase().includes(q)
      if (matchTitle || matchNotes || matchProject) {
        matches.push({
          ...entry,
          workdayId: day.workdayId,
        })
      }
    }
  }
  return matches
}

module.exports = {
  getLogbookDir,
  readMonthFile,
  writeMonthFile,
  appendLogbookEntries,
  listLogbookDays,
  getLogbookEntriesByIds,
  removeLogbookEntry,
  searchLogbook,
}

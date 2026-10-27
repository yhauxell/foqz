// Run with: node --test electron/
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const boards = require('./boardFiles.cjs')

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foqz-boards-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('writes a board atomically and reads it back', async (t) => {
  const root = tempRoot(t)
  await boards.writeBoard(root, 'board-1', '{"a":1}')
  assert.equal(boards.readBoardSync(root, 'board-1'), '{"a":1}')
  assert.equal(boards.readBoardSync(root, 'board-missing'), null)
  const leftovers = fs.readdirSync(boards.boardsDir(root)).filter((n) => n.includes('.tmp-'))
  assert.deepEqual(leftovers, [])
})

test('rejects ids that could escape the boards folder', async (t) => {
  const root = tempRoot(t)
  assert.throws(() => boards.readBoardSync(root, '../settings'))
  await assert.rejects(() => boards.readBackup(root, 'board-1', '../../x.json'))
})

test('concurrent writes land in call order', async (t) => {
  const root = tempRoot(t)
  await Promise.all(Array.from({ length: 20 }, (_, i) => boards.writeBoard(root, 'b', String(i), { now: 1e12 })))
  assert.equal(boards.readBoardSync(root, 'b'), '19')
})

test('backs up the replaced version at most every interval, or when forced', async (t) => {
  const root = tempRoot(t)
  const t0 = 1_700_000_000_000
  await boards.writeBoard(root, 'b', 'v1', { now: t0 }) // nothing to back up yet
  await boards.writeBoard(root, 'b', 'v2', { now: t0 + 1000 }) // first backup: v1
  await boards.writeBoard(root, 'b', 'v3', { now: t0 + 2000 }) // within interval: none
  await boards.writeBoard(root, 'b', 'v4', { now: t0 + 2000 + boards.BACKUP_INTERVAL_MS + 1000 }) // v3
  await boards.writeBoard(root, 'b', 'v5', { now: t0 + 2000 + boards.BACKUP_INTERVAL_MS + 2000, forceBackup: true }) // v4

  const list = await boards.listBackups(root, 'b')
  const contents = await Promise.all(list.map((b) => boards.readBackup(root, 'b', b.id)))
  assert.deepEqual(contents, ['v4', 'v3', 'v1'])
  assert.ok(list[0].at > list[1].at)
  assert.equal(boards.readBoardSync(root, 'b'), 'v5')
})

test('keeps the recent backups and one per day for two weeks', () => {
  const now = 100 * DAY
  const names = []
  // 3 backups a day for 30 days.
  for (let d = 0; d < 30; d++) for (let h = 0; h < 3; h++) names.push(`${String(now - d * DAY - h * 60 * MIN).padStart(13, '0')}.json`)
  const pruned = new Set(boards.backupsToPrune(names, now))
  const kept = names.filter((n) => !pruned.has(n))

  const newest = [...names].sort().reverse()
  for (const n of newest.slice(0, boards.KEEP_RECENT)) assert.ok(kept.includes(n), 'recent backups kept')
  const keptDays = new Set(kept.map((n) => Math.floor(Number(n.slice(0, -5)) / DAY)))
  assert.ok(keptDays.size >= boards.KEEP_DAILY_DAYS, 'one backup per day kept')
  for (const n of kept) assert.ok(now - Number(n.slice(0, -5)) <= boards.KEEP_DAILY_DAYS * DAY + DAY)
  assert.ok(kept.length < names.length)
})

test('deleting a board keeps its last version as a backup', async (t) => {
  const root = tempRoot(t)
  await boards.writeBoard(root, 'b', 'last words')
  await boards.deleteBoard(root, 'b')
  assert.equal(boards.readBoardSync(root, 'b'), null)
  const [backup] = await boards.listBackups(root, 'b')
  assert.equal(await boards.readBackup(root, 'b', backup.id), 'last words')
})

test('keeps unreadable data and the catalog', async (t) => {
  const root = tempRoot(t)
  const kept = await boards.keepUnreadable(root, 'b', '{not json', { now: 5 })
  assert.equal(fs.readFileSync(kept, 'utf8'), '{not json')
  await boards.writeCatalog(root, '[{"id":"b"}]')
  assert.equal(boards.readCatalogSync(root), '[{"id":"b"}]')
  await boards.whenIdle()
})

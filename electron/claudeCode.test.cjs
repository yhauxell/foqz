// Run with: node --test electron/
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buildRunArgs, resolveCwd } = require('./claudeCode.cjs')

const HOST_OFF = { enabled: false, running: false, url: '', token: '' }
const HOST_ON = { enabled: true, running: true, url: 'http://127.0.0.1:1234/mcp', token: 't' }

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foqz-claude-code-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function optionValue(args, flag) {
  const i = args.indexOf(flag)
  return i < 0 ? undefined : args[i + 1]
}

test('blocks the read-only file tools on every canvas run', () => {
  for (const host of [HOST_OFF, HOST_ON]) {
    const args = buildRunArgs({ settings: {}, host })
    assert.deepEqual(optionValue(args, '--disallowedTools').split(','), ['Read', 'Glob', 'Grep'])
    assert.ok(args.includes('--restricted'))
    assert.equal(optionValue(args, '--permission-mode'), 'dontAsk')
  }
})

test('pre-approves only the Foqz canvas tools when the MCP host is running', () => {
  const args = buildRunArgs({ settings: {}, host: HOST_ON })
  assert.equal(optionValue(args, '--allowedTools'), 'mcp__foqz')
  assert.ok(args.includes('--strict-mcp-config'))
  const config = JSON.parse(optionValue(args, '--mcp-config'))
  assert.deepEqual(Object.keys(config.mcpServers), ['foqz'])

  const offArgs = buildRunArgs({ settings: {}, host: HOST_OFF })
  assert.ok(!offArgs.includes('--allowedTools'))
  assert.ok(offArgs.includes('--strict-mcp-config'))
})

test('passes the model and system prompt through', () => {
  const args = buildRunArgs({ settings: { claudeCodeModel: 'sonnet' }, systemPrompt: 'Be brief.', host: HOST_OFF })
  assert.equal(optionValue(args, '--model'), 'sonnet')
  assert.equal(optionValue(args, '--append-system-prompt'), 'Be brief.')
})

test('with no folder set, runs in the Foqz-owned default folder, never the home folder', (t) => {
  const defaultCwd = path.join(tempRoot(t), 'claude-code')
  assert.equal(resolveCwd('', defaultCwd), defaultCwd)
  assert.ok(fs.statSync(defaultCwd).isDirectory())
  assert.notEqual(resolveCwd(undefined, defaultCwd), os.homedir())
})

test('uses a configured folder and rejects a missing one', (t) => {
  const root = tempRoot(t)
  assert.equal(resolveCwd(root, path.join(root, 'default')), root)
  assert.equal(resolveCwd(path.join(root, 'missing'), path.join(root, 'default')), null)
})

const {
  ClaudeCodeRunner,
  normalizeFolders,
  normalizeBashAllowlist,
  folderAccess,
  findClone,
} = require('./claudeCode.cjs')

const SESSION = '11111111-2222-4333-8444-555555555555'

test('canvas-only runs ignore sessions and keep --no-session-persistence', () => {
  const args = buildRunArgs({ settings: {}, host: HOST_ON, profile: 'canvas', session: { id: SESSION, resume: true } })
  assert.ok(args.includes('--no-session-persistence'))
  assert.ok(!args.includes('--resume'))
  assert.ok(!args.includes('--tools'))
  assert.equal(optionValue(args, '--allowedTools'), 'mcp__foqz')
})

test('the read profile exposes only the read tools', () => {
  const args = buildRunArgs({ settings: {}, host: HOST_ON, profile: 'read' })
  assert.equal(optionValue(args, '--tools'), 'Read,Glob,Grep,ToolSearch')
  assert.equal(optionValue(args, '--allowedTools'), 'Read,Glob,Grep,mcp__foqz')
  assert.ok(!args.includes('--disallowedTools'))
  assert.ok(args.includes('--restricted'))
  assert.equal(optionValue(args, '--permission-mode'), 'dontAsk')
})

test('the workspace profile adds edits and only the allowlisted shell commands', () => {
  const args = buildRunArgs({
    settings: {},
    host: HOST_OFF,
    profile: 'workspace',
    bashAllowlist: ['npm test', 'git status', 'rm -rf (x)'],
  })
  assert.equal(optionValue(args, '--tools'), 'Read,Glob,Grep,Edit,Write,Bash,ToolSearch')
  assert.equal(optionValue(args, '--allowedTools'), 'Read,Glob,Grep,Edit,Write,Bash(npm test:*),Bash(git status:*)')
  assert.ok(!args.includes('bypassPermissions'))

  const noShell = buildRunArgs({ settings: {}, host: HOST_OFF, profile: 'workspace' })
  assert.equal(optionValue(noShell, '--tools'), 'Read,Glob,Grep,Edit,Write,ToolSearch')
})

test('non-canvas runs start or resume the given session', () => {
  const start = buildRunArgs({ settings: {}, host: HOST_OFF, profile: 'read', session: { id: SESSION, resume: false } })
  assert.equal(optionValue(start, '--session-id'), SESSION)
  assert.ok(!start.includes('--no-session-persistence'))
  const resume = buildRunArgs({ settings: {}, host: HOST_OFF, profile: 'read', session: { id: SESSION, resume: true } })
  assert.equal(optionValue(resume, '--resume'), SESSION)
  const bad = buildRunArgs({ settings: {}, host: HOST_OFF, profile: 'read', session: { id: 'not-a-uuid', resume: true } })
  assert.ok(bad.includes('--no-session-persistence'))
  assert.ok(!bad.includes('--resume'))
})

test('folder access comes from Settings, and unknown folders stay canvas-only', (t) => {
  const root = tempRoot(t)
  const folders = normalizeFolders([
    { path: `${root}/`, profile: 'workspace', bashAllowlist: ['npm test', ''] },
    { path: root, profile: 'read' },
    { path: '', profile: 'read' },
    { path: path.join(root, 'b'), profile: 'root' },
  ])
  assert.deepEqual(folders, [
    { path: root, profile: 'workspace', bashAllowlist: ['npm test'] },
    { path: path.join(root, 'b'), profile: 'canvas', bashAllowlist: [] },
  ])
  assert.deepEqual(folderAccess({ claudeCodeFolders: folders }, root), { profile: 'workspace', bashAllowlist: ['npm test'] })
  assert.deepEqual(folderAccess({ claudeCodeFolders: folders }, path.join(root, 'other')), { profile: 'canvas', bashAllowlist: [] })
  assert.deepEqual(normalizeBashAllowlist(['git  diff', 'a:b', 'x*', 'git diff']), ['git diff'])
})

test('finds a local clone by its GitHub origin', (t) => {
  const root = tempRoot(t)
  const clone = path.join(root, 'group', 'renamed-checkout')
  fs.mkdirSync(path.join(clone, '.git'), { recursive: true })
  fs.writeFileSync(path.join(clone, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:Acme/Widget.git\n')
  fs.mkdirSync(path.join(root, 'widget', '.git'), { recursive: true })
  fs.writeFileSync(path.join(root, 'widget', '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/other/widget\n')
  assert.equal(findClone('acme/widget', [root]), clone)
  assert.equal(findClone('acme/missing', [root]), null)
  assert.equal(findClone('../etc', [root]), null)
})

// A stand-in for `claude`: prints its argv and cwd as an init line, then behaves as STUB_MODE says.
const STUB = `#!/usr/bin/env node
const mode = process.env.STUB_MODE || 'ok'
const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
line({ type: 'system', subtype: 'init', session_id: 's', tools: [], argv: process.argv.slice(2), cwd: process.cwd() })
if (mode === 'ok') { line({ type: 'result', is_error: false, result: 'done' }); process.exit(0) }
if (mode === 'stubborn') process.on('SIGTERM', () => {})
setInterval(() => {}, 1000)
`

function stubRunner(t, settings) {
  const root = tempRoot(t)
  const bin = path.join(root, 'claude')
  fs.writeFileSync(bin, STUB, { mode: 0o755 })
  const handlers = {}
  const runner = new ClaudeCodeRunner({
    ipcMain: { handle: (name, fn) => (handlers[name] = fn) },
    getSettings: () => ({ claudeCodeEnabled: true, claudeCodePath: bin, ...settings(root) }),
    getMcpHost: () => HOST_OFF,
    getDefaultCwd: () => path.join(root, 'default'),
  })
  t.after(() => runner.dispose())
  const events = []
  const sender = { isDestroyed: () => false, send: (channel, payload) => events.push({ channel, ...payload }) }
  const exited = (requestId) =>
    new Promise((resolve) => {
      const check = () => {
        const e = events.find((x) => x.channel === 'claudeCode:exit' && x.requestId === requestId)
        if (e) resolve(e)
        else setTimeout(check, 20)
      }
      check()
    })
  return { root, runner, sender, events, exited, handlers }
}

test('runs in the item folder with the access Settings grants it', async (t) => {
  const { root, runner, sender, events, exited } = stubRunner(t, (r) => ({
    claudeCodeFolders: [{ path: path.join(r, 'repo'), profile: 'workspace', bashAllowlist: ['npm test'] }],
  }))
  fs.mkdirSync(path.join(root, 'repo'))
  process.env.STUB_MODE = 'ok'
  const res = runner.run(sender, { requestId: 'r1', prompt: 'hi', folder: path.join(root, 'repo'), sessionId: SESSION })
  assert.equal(res.ok, true)
  assert.equal(res.profile, 'workspace')
  assert.equal(res.persistent, true)
  await exited('r1')
  const init = JSON.parse(events.find((e) => e.channel === 'claudeCode:line').line)
  assert.equal(fs.realpathSync(init.cwd), fs.realpathSync(path.join(root, 'repo')))
  assert.equal(optionValue(init.argv, '--session-id'), SESSION)
  assert.ok(optionValue(init.argv, '--allowedTools').includes('Bash(npm test:*)'))

  const missing = runner.run(sender, { requestId: 'r2', prompt: 'hi', folder: path.join(root, 'nope') })
  assert.equal(missing.ok, false)
  assert.match(missing.error, /does not exist/)
})

test('limits runs: one per item and a configurable cap', async (t) => {
  const { runner, sender, exited } = stubRunner(t, () => ({ claudeCodeMaxRuns: 2 }))
  process.env.STUB_MODE = 'hang'
  assert.equal(runner.run(sender, { requestId: 'a', prompt: 'x', nodeId: 'n1' }).ok, true)
  const same = runner.run(sender, { requestId: 'b', prompt: 'x', nodeId: 'n1' })
  assert.equal(same.ok, false)
  assert.match(same.error, /already has a Claude Code run/)
  assert.equal(runner.run(sender, { requestId: 'c', prompt: 'x', nodeId: 'n2' }).ok, true)
  const over = runner.run(sender, { requestId: 'd', prompt: 'x', nodeId: 'n3' })
  assert.equal(over.ok, false)
  assert.match(over.error, /the limit is 2/)
  runner.cancel('a')
  runner.cancel('c')
  await Promise.all([exited('a'), exited('c')])
})

test('cancel kills a run that ignores SIGTERM within the grace period', async (t) => {
  const { runner, sender, exited } = stubRunner(t, () => ({}))
  process.env.STUB_MODE = 'stubborn'
  assert.equal(runner.run(sender, { requestId: 's', prompt: 'x' }).ok, true)
  await new Promise((r) => setTimeout(r, 300))
  const started = Date.now()
  assert.equal(runner.cancel('s'), true)
  const exit = await exited('s')
  assert.equal(exit.signal, 'SIGKILL')
  assert.ok(Date.now() - started < 5_000)
})

test('dispose leaves no process behind', async (t) => {
  const { runner, sender } = stubRunner(t, () => ({}))
  process.env.STUB_MODE = 'stubborn'
  runner.run(sender, { requestId: 'q', prompt: 'x' })
  await new Promise((r) => setTimeout(r, 300))
  const child = runner.running.get('q').child
  runner.dispose()
  await new Promise((r) => child.once('close', r))
  assert.equal(child.signalCode, 'SIGKILL')
})

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

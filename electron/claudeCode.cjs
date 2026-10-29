const childProcess = require('node:child_process')
const fsSync = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DETECT_TIMEOUT_MS = 8_000
// A turn that edits the canvas many times can take a while; this only stops a hung process.
const RUN_TIMEOUT_MS = 15 * 60_000
const MAX_STDERR = 8_000

/** Where installers put `claude` when it is not on the PATH a GUI app inherits. */
function candidateBinaries() {
  const home = os.homedir()
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude']
  const dirs = [
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean),
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name)))
}

function isExecutable(file) {
  try {
    fsSync.accessSync(file, fsSync.constants.X_OK)
    return fsSync.statSync(file).isFile()
  } catch {
    return false
  }
}

/** The configured binary, or the first `claude` found; null when there is none. */
function resolveBinary(configuredPath) {
  const configured = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  if (configured) {
    const expanded = configured.startsWith('~') ? path.join(os.homedir(), configured.slice(1)) : configured
    return isExecutable(expanded) ? expanded : null
  }
  return candidateBinaries().find(isExecutable) || null
}

/**
 * The configured folder, or `defaultCwd` (created on demand) when none is set; null when the
 * configured folder does not exist. The default is an empty folder Foqz owns, never the home folder.
 */
function resolveCwd(configuredCwd, defaultCwd) {
  const configured = typeof configuredCwd === 'string' ? configuredCwd.trim() : ''
  if (!configured) {
    try {
      fsSync.mkdirSync(defaultCwd, { recursive: true })
      return defaultCwd
    } catch {
      return null
    }
  }
  const expanded = configured.startsWith('~') ? path.join(os.homedir(), configured.slice(1)) : configured
  try {
    if (fsSync.statSync(expanded).isDirectory()) return expanded
  } catch {}
  return null
}

// Read-only file tools run without approval even under --restricted and dontAsk, so canvas text
// (imported GitHub issues included) could otherwise get files read and echoed onto the canvas.
const BLOCKED_FILE_TOOLS = ['Read', 'Glob', 'Grep']

/**
 * The CLI arguments for one canvas run. The prompt itself goes over stdin.
 * @param {{ settings: Record<string, any>, systemPrompt?: string, host: { enabled: boolean, running: boolean, url: string, token: string } }} opts
 */
function buildRunArgs({ settings, systemPrompt, host }) {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    // Canvas text (imported GitHub issues included) lands in the prompt, so the run is locked down
    // whatever the user's own Claude Code settings say: no shell or code-running tools, no file
    // tools, user and project settings ignored, and anything not pre-approved below refused
    // instead of prompted for.
    '--restricted',
    '--permission-mode',
    'dontAsk',
    '--disallowedTools',
    BLOCKED_FILE_TOOLS.join(','),
  ]
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    args.push('--append-system-prompt', systemPrompt)
  }
  if (settings.claudeCodeModel) args.push('--model', settings.claudeCodeModel)

  // Canvas tools come from the embedded Foqz MCP server, and only its tools are pre-approved.
  if (host.enabled && host.running) {
    const mcpConfig = {
      mcpServers: {
        foqz: { type: 'http', url: host.url, headers: { Authorization: `Bearer ${host.token}` } },
      },
    }
    args.push('--mcp-config', JSON.stringify(mcpConfig), '--strict-mcp-config', '--allowedTools', 'mcp__foqz')
  } else {
    args.push('--strict-mcp-config')
  }
  return args
}

/**
 * Runs the local Claude Code CLI for the canvas chat. Main owns the binary, argv and working
 * folder; the renderer only sends the prompt. Output is forwarded as raw stream-json lines,
 * which the renderer parses (src/lib/claudeCode.ts).
 */
class ClaudeCodeRunner {
  /**
   * @param {{ ipcMain: Electron.IpcMain, getSettings: () => Record<string, any>, getMcpHost: () => { enabled: boolean, running: boolean, url: string, token: string }, getDefaultCwd: () => string }} opts
   */
  constructor({ ipcMain, getSettings, getMcpHost, getDefaultCwd }) {
    this.getSettings = getSettings
    this.getMcpHost = getMcpHost
    this.getDefaultCwd = getDefaultCwd
    /** @type {Map<string, import('node:child_process').ChildProcess>} */
    this.running = new Map()

    ipcMain.handle('claudeCode:detect', () => this.detect())
    ipcMain.handle('claudeCode:run', (event, req) => this.run(event.sender, req))
    ipcMain.handle('claudeCode:cancel', (_event, requestId) => this.cancel(requestId))
  }

  async detect() {
    const settings = this.getSettings()
    const bin = resolveBinary(settings.claudeCodePath)
    const host = this.getMcpHost()
    const canvasTools = host.enabled && host.running
    if (!bin) {
      return {
        ok: false,
        canvasTools,
        error: settings.claudeCodePath
          ? `No executable at ${settings.claudeCodePath}.`
          : 'Claude Code was not found. Install it, or set the path to the claude binary.',
      }
    }
    return new Promise((resolve) => {
      childProcess.execFile(bin, ['--version'], { timeout: DETECT_TIMEOUT_MS }, (err, stdout) => {
        if (err) resolve({ ok: false, path: bin, canvasTools, error: err.message })
        else resolve({ ok: true, path: bin, version: String(stdout).trim(), canvasTools })
      })
    })
  }

  /**
   * @param {Electron.WebContents} sender
   * @param {{ requestId: string, prompt: string, systemPrompt?: string }} req
   */
  run(sender, req) {
    const requestId = String(req?.requestId || '')
    const prompt = typeof req?.prompt === 'string' ? req.prompt : ''
    if (!requestId || !prompt.trim()) return { ok: false, error: 'Empty prompt.' }
    if (this.running.has(requestId)) return { ok: false, error: 'Request already running.' }

    const settings = this.getSettings()
    if (settings.claudeCodeEnabled !== true) {
      return { ok: false, error: 'Claude Code is turned off in Settings → Intelligence.' }
    }
    const bin = resolveBinary(settings.claudeCodePath)
    if (!bin) return { ok: false, error: 'Claude Code was not found. Set its path in Settings → Intelligence.' }
    const defaultCwd = this.getDefaultCwd()
    const cwd = resolveCwd(settings.claudeCodeCwd, defaultCwd)
    if (!cwd) {
      return {
        ok: false,
        error: settings.claudeCodeCwd
          ? `Working folder ${settings.claudeCodeCwd} does not exist.`
          : `Could not create the working folder ${defaultCwd}.`,
      }
    }

    const args = buildRunArgs({ settings, systemPrompt: req.systemPrompt, host: this.getMcpHost() })

    let child
    try {
      child = childProcess.spawn(bin, args, { cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      return { ok: false, error: err.message }
    }
    this.running.set(requestId, child)

    const send = (channel, payload) => {
      if (!sender.isDestroyed()) sender.send(channel, { requestId, ...payload })
    }
    const timeout = setTimeout(() => child.kill('SIGTERM'), RUN_TIMEOUT_MS)

    let buffered = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffered += chunk
      let nl
      while ((nl = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, nl).trim()
        buffered = buffered.slice(nl + 1)
        if (line) send('claudeCode:line', { line })
      }
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-MAX_STDERR)
    })
    child.on('error', (err) => {
      stderr = (stderr + '\n' + err.message).slice(-MAX_STDERR)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      this.running.delete(requestId)
      if (buffered.trim()) send('claudeCode:line', { line: buffered.trim() })
      send('claudeCode:exit', { code, signal, stderr: stderr.trim() })
    })

    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
    return { ok: true }
  }

  cancel(requestId) {
    const child = this.running.get(String(requestId))
    if (!child) return false
    child.kill('SIGTERM')
    return true
  }

  dispose() {
    for (const child of this.running.values()) child.kill('SIGTERM')
    this.running.clear()
  }
}

module.exports = { ClaudeCodeRunner, resolveBinary, resolveCwd, buildRunArgs }

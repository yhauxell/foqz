const childProcess = require('node:child_process')
const fsSync = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DETECT_TIMEOUT_MS = 8_000
// A turn that edits the canvas many times can take a while; this only stops a hung process.
const DEFAULT_TIMEOUT_MINUTES = 15
const DEFAULT_MAX_RUNS = 3
// How long a cancelled run gets to exit on SIGTERM before it is killed outright.
const KILL_GRACE_MS = 2_000
const MAX_STDERR = 8_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What a run may touch, chosen per folder in Settings. Canvas text (imported GitHub issues
 * included) lands in the prompt, so anything beyond the canvas is an explicit opt-in.
 */
const PROFILES = ['canvas', 'read', 'workspace']

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

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

/** Absolute, `~`-expanded, without a trailing slash, so folders compare equal however they were typed. */
function normalizeFolderPath(p) {
  const trimmed = typeof p === 'string' ? p.trim() : ''
  if (!trimmed) return ''
  return path.resolve(expandHome(trimmed))
}

/** The configured binary, or the first `claude` found; null when there is none. */
function resolveBinary(configuredPath) {
  const configured = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  if (configured) {
    const expanded = expandHome(configured)
    return isExecutable(expanded) ? expanded : null
  }
  return candidateBinaries().find(isExecutable) || null
}

/**
 * The configured folder, or `defaultCwd` (created on demand) when none is set; null when the
 * configured folder does not exist. The default is an empty folder Foqz owns, never the home folder.
 */
function resolveCwd(configuredCwd, defaultCwd) {
  const configured = normalizeFolderPath(configuredCwd)
  if (!configured) {
    try {
      fsSync.mkdirSync(defaultCwd, { recursive: true })
      return defaultCwd
    } catch {
      return null
    }
  }
  try {
    if (fsSync.statSync(configured).isDirectory()) return configured
  } catch {}
  return null
}

/** A Bash allowlist entry is a command prefix such as `npm test`; anything that could break the rule syntax is dropped. */
function normalizeBashAllowlist(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const raw of list) {
    const cmd = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
    if (!cmd || /[(),:*]/.test(cmd) || out.includes(cmd)) continue
    out.push(cmd)
  }
  return out
}

/** Settings → Claude Code folders, cleaned: one entry per folder, known profiles only. */
function normalizeFolders(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const folderPath = normalizeFolderPath(raw.path)
    if (!folderPath || out.some((f) => f.path === folderPath)) continue
    out.push({
      path: folderPath,
      profile: PROFILES.includes(raw.profile) ? raw.profile : 'canvas',
      bashAllowlist: normalizeBashAllowlist(raw.bashAllowlist),
    })
  }
  return out
}

/** The access granted to `cwd` in Settings; folders nobody granted anything stay canvas-only. */
function folderAccess(settings, cwd) {
  const match = normalizeFolders(settings.claudeCodeFolders).find((f) => f.path === cwd)
  return match ? { profile: match.profile, bashAllowlist: match.bashAllowlist } : { profile: 'canvas', bashAllowlist: [] }
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

// Read-only file tools run without approval even under --restricted and dontAsk, so canvas text
// (imported GitHub issues included) could otherwise get files read and echoed onto the canvas.
const BLOCKED_FILE_TOOLS = ['Read', 'Glob', 'Grep']
const READ_TOOLS = ['Read', 'Glob', 'Grep']
const EDIT_TOOLS = ['Edit', 'Write']

/**
 * The CLI arguments for one run. The prompt itself goes over stdin.
 * @param {{
 *   settings: Record<string, any>,
 *   systemPrompt?: string,
 *   host: { enabled: boolean, running: boolean, url: string, token: string },
 *   profile?: 'canvas' | 'read' | 'workspace',
 *   bashAllowlist?: string[],
 *   session?: { id: string, resume: boolean } | null,
 * }} opts
 */
function buildRunArgs({ settings, systemPrompt, host, profile = 'canvas', bashAllowlist = [], session = null }) {
  const canvasOnly = !PROFILES.includes(profile) || profile === 'canvas'
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
  // Whatever the user's own Claude Code settings say: no shell or code-running tools unless named
  // below, user and project settings ignored, and anything not pre-approved refused instead of
  // prompted for.
  args.push('--restricted', '--permission-mode', 'dontAsk')

  const allowed = []
  if (canvasOnly) {
    // Canvas runs stay one-shot and see no files at all.
    args.push('--no-session-persistence', '--disallowedTools', BLOCKED_FILE_TOOLS.join(','))
  } else {
    const bash = profile === 'workspace' ? normalizeBashAllowlist(bashAllowlist) : []
    const tools = [...READ_TOOLS, ...(profile === 'workspace' ? EDIT_TOOLS : []), ...(bash.length ? ['Bash'] : [])]
    // ToolSearch loads the canvas tools' schemas on demand.
    args.push('--tools', [...tools, 'ToolSearch'].join(','))
    allowed.push(...READ_TOOLS, ...(profile === 'workspace' ? EDIT_TOOLS : []), ...bash.map((cmd) => `Bash(${cmd}:*)`))
    if (session && UUID_RE.test(session.id)) {
      args.push(session.resume ? '--resume' : '--session-id', session.id)
    } else {
      args.push('--no-session-persistence')
    }
  }

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    args.push('--append-system-prompt', systemPrompt)
  }
  if (settings.claudeCodeModel) args.push('--model', settings.claudeCodeModel)

  // Canvas tools come from the embedded Foqz MCP server; only its tools and the profile's are pre-approved.
  if (host.enabled && host.running) {
    const mcpConfig = {
      mcpServers: {
        foqz: { type: 'http', url: host.url, headers: { Authorization: `Bearer ${host.token}` } },
      },
    }
    args.push('--mcp-config', JSON.stringify(mcpConfig), '--strict-mcp-config')
    allowed.push('mcp__foqz')
  } else {
    args.push('--strict-mcp-config')
  }
  if (allowed.length) args.push('--allowedTools', allowed.join(','))
  return args
}

/** Folders people commonly keep clones in, searched two levels deep for a matching repository. */
function cloneSearchRoots() {
  const home = os.homedir()
  return ['projects', 'Projects', 'code', 'Code', 'src', 'dev', 'Developer', 'GitHub', 'github', 'repos', 'workspace', 'work'].map(
    (d) => path.join(home, d),
  )
}

function originMatches(dir, ownerRepo) {
  let config
  try {
    config = fsSync.readFileSync(path.join(dir, '.git', 'config'), 'utf8')
  } catch {
    return false
  }
  const [owner, repo] = ownerRepo.toLowerCase().split('/')
  const re = /^\s*url\s*=\s*(.+)$/gm
  let m
  while ((m = re.exec(config))) {
    const url = m[1].trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
    if (url.endsWith(`github.com/${owner}/${repo}`) || url.endsWith(`github.com:${owner}/${repo}`)) return true
  }
  return false
}

/** The first local clone of `owner/repo` under `roots`, or null. */
function findClone(ownerRepo, roots = cloneSearchRoots()) {
  if (typeof ownerRepo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(ownerRepo)) return null
  const subdirs = (dir) => {
    try {
      return fsSync
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => path.join(dir, e.name))
    } catch {
      return []
    }
  }
  const repoName = ownerRepo.split('/')[1].toLowerCase()
  for (const root of roots) {
    const level1 = subdirs(root)
    // Folders named like the repo first: the usual case, and cheap.
    const ordered = [...level1.filter((d) => path.basename(d).toLowerCase() === repoName), ...level1]
    for (const dir of ordered) if (originMatches(dir, ownerRepo)) return dir
    for (const dir of level1) for (const sub of subdirs(dir)) if (originMatches(sub, ownerRepo)) return sub
  }
  return null
}

function isAlive(child) {
  return child.exitCode === null && child.signalCode === null
}

/**
 * Runs the local Claude Code CLI for the canvas chat. Main owns the binary, argv, working folder
 * and access profile; the renderer only sends the prompt, the folder it wants and a session id.
 * Output is forwarded as raw stream-json lines, which the renderer parses (src/lib/claudeCode.ts).
 */
class ClaudeCodeRunner {
  /**
   * @param {{
   *   ipcMain: Electron.IpcMain,
   *   getSettings: () => Record<string, any>,
   *   getMcpHost: () => { enabled: boolean, running: boolean, url: string, token: string },
   *   getDefaultCwd: () => string,
   *   pickFolder?: (sender: Electron.WebContents) => Promise<string | null>,
   * }} opts
   */
  constructor({ ipcMain, getSettings, getMcpHost, getDefaultCwd, pickFolder }) {
    this.getSettings = getSettings
    this.getMcpHost = getMcpHost
    this.getDefaultCwd = getDefaultCwd
    /** @type {Map<string, { child: import('node:child_process').ChildProcess, nodeId: string | null }>} */
    this.running = new Map()

    ipcMain.handle('claudeCode:detect', () => this.detect())
    ipcMain.handle('claudeCode:resolve', (_event, req) => this.resolve(req))
    ipcMain.handle('claudeCode:run', (event, req) => this.run(event.sender, req))
    ipcMain.handle('claudeCode:cancel', (_event, requestId) => this.cancel(requestId))
    ipcMain.handle('claudeCode:findClone', (_event, repo) => findClone(repo))
    ipcMain.handle('claudeCode:pickFolder', (event) => (pickFolder ? pickFolder(event.sender) : null))
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
   * Where a run for `folder` would start and what it may do there. An empty folder means the
   * global setting, then the Foqz-owned default.
   * @param {{ folder?: string }} [req]
   */
  resolve(req) {
    const settings = this.getSettings()
    const requested = normalizeFolderPath(req?.folder) || normalizeFolderPath(settings.claudeCodeCwd)
    const defaultCwd = this.getDefaultCwd()
    const cwd = resolveCwd(requested, defaultCwd)
    if (!cwd) {
      return {
        ok: false,
        error: requested ? `Working folder ${requested} does not exist.` : `Could not create the working folder ${defaultCwd}.`,
      }
    }
    const access = folderAccess(settings, cwd)
    return { ok: true, cwd, isDefault: !requested, profile: access.profile, bashAllowlist: access.bashAllowlist }
  }

  /**
   * @param {Electron.WebContents} sender
   * @param {{ requestId: string, prompt: string, systemPrompt?: string, folder?: string, nodeId?: string, sessionId?: string, resume?: boolean }} req
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
    const nodeId = typeof req.nodeId === 'string' && req.nodeId ? req.nodeId : null
    if (nodeId && [...this.running.values()].some((r) => r.nodeId === nodeId)) {
      return { ok: false, error: 'This item already has a Claude Code run going. Stop it or wait for it to finish.' }
    }
    const maxRuns = clampInt(settings.claudeCodeMaxRuns, 1, 10, DEFAULT_MAX_RUNS)
    if (this.running.size >= maxRuns) {
      return {
        ok: false,
        error: `${this.running.size} Claude Code runs are already going (the limit is ${maxRuns}). Wait for one to finish, or raise the limit in Settings → Intelligence.`,
      }
    }
    const bin = resolveBinary(settings.claudeCodePath)
    if (!bin) return { ok: false, error: 'Claude Code was not found. Set its path in Settings → Intelligence.' }
    const where = this.resolve({ folder: req.folder })
    if (!where.ok) return where

    const persistent = where.profile !== 'canvas'
    const session =
      persistent && typeof req.sessionId === 'string' && UUID_RE.test(req.sessionId)
        ? { id: req.sessionId, resume: req.resume === true }
        : null
    const args = buildRunArgs({
      settings,
      systemPrompt: req.systemPrompt,
      host: this.getMcpHost(),
      profile: where.profile,
      bashAllowlist: where.bashAllowlist,
      session,
    })

    let child
    try {
      child = childProcess.spawn(bin, args, { cwd: where.cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      return { ok: false, error: err.message }
    }
    this.running.set(requestId, { child, nodeId })

    const send = (channel, payload) => {
      if (!sender.isDestroyed()) sender.send(channel, { requestId, ...payload })
    }
    const timeoutMs = clampInt(settings.claudeCodeTimeoutMinutes, 1, 240, DEFAULT_TIMEOUT_MINUTES) * 60_000
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      this.stop(child)
    }, timeoutMs)

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
      if (timedOut) stderr = `${stderr}\nStopped after ${timeoutMs / 60_000} minutes (Settings → Intelligence → Timeout).`.trim()
      send('claudeCode:exit', { code, signal, stderr: stderr.trim() })
    })

    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
    return { ok: true, profile: where.profile, cwd: where.cwd, persistent }
  }

  /** SIGTERM, then SIGKILL if the process is still there after the grace period. */
  stop(child) {
    if (!isAlive(child)) return
    child.kill('SIGTERM')
    const timer = setTimeout(() => {
      if (isAlive(child)) child.kill('SIGKILL')
    }, KILL_GRACE_MS)
    timer.unref?.()
  }

  cancel(requestId) {
    const run = this.running.get(String(requestId))
    if (!run) return false
    this.stop(run.child)
    return true
  }

  /** On quit there is no time for a grace period: ask nicely, wait briefly, then kill what is left. */
  dispose() {
    const children = [...this.running.values()].map((r) => r.child)
    this.running.clear()
    for (const child of children) if (isAlive(child)) child.kill('SIGTERM')
    if (!children.some(isAlive)) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
    for (const child of children) if (isAlive(child)) child.kill('SIGKILL')
  }
}

module.exports = {
  ClaudeCodeRunner,
  PROFILES,
  resolveBinary,
  resolveCwd,
  buildRunArgs,
  normalizeFolders,
  normalizeBashAllowlist,
  normalizeFolderPath,
  folderAccess,
  findClone,
}

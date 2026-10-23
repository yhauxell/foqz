const http = require('node:http')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js')

const CONFIG_FILE = 'foqz-mcp-host.json'
const DEFAULT_PORT = 7337
const MCP_PATH = '/mcp'
const MAX_BODY_BYTES = 4 * 1024 * 1024
const DEFAULT_CALL_TIMEOUT_MS = 30_000
// Tools that create many nodes or call GitHub can take longer than a single canvas edit.
const SLOW_TOOL_TIMEOUT_MS = 180_000
const SLOW_TOOLS = new Set(['expand_task', 'create_github_issue'])

function generateToken() {
  return crypto.randomBytes(24).toString('base64url')
}

function normalizeConfig(raw) {
  const port = Number(raw?.port)
  return {
    enabled: raw?.enabled === true,
    port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_PORT,
    token: typeof raw?.token === 'string' && raw.token.length >= 16 ? raw.token : generateToken(),
  }
}

function errorResult(text) {
  return { isError: true, content: [{ type: 'text', text }] }
}

/**
 * Embedded MCP server that lets external agents (Claude Code, Claude Desktop, Cursor, ...)
 * drive the Foqz canvas. Tool definitions and execution live in the renderer (they are bound
 * to the React Flow store), so every request is bridged over IPC to the main window.
 */
class FoqzMcpHost {
  constructor() {
    this.userDataPath = ''
    this.config = normalizeConfig(null)
    this.httpServer = null
    this.status = 'stopped'
    this.error = null
    this.getWindow = () => null
    this.tools = []
    this.pending = new Map()
    this.ipcMain = null
  }

  /**
   * @param {{ userDataPath: string, ipcMain: Electron.IpcMain, getWindow: () => Electron.BrowserWindow | null }} opts
   */
  async init({ userDataPath, ipcMain, getWindow }) {
    this.userDataPath = userDataPath
    this.getWindow = getWindow
    this.ipcMain = ipcMain

    ipcMain.on('mcpHost:registerTools', (_event, tools) => {
      this.tools = Array.isArray(tools) ? tools : []
    })
    ipcMain.on('mcpHost:result', (_event, payload) => {
      const entry = payload && this.pending.get(payload.requestId)
      if (!entry) return
      clearTimeout(entry.timer)
      this.pending.delete(payload.requestId)
      entry.resolve(payload.result || errorResult('Foqz returned an empty tool result.'))
    })

    this.config = await this.loadConfig()
    // Persist so a freshly generated token stays stable across restarts.
    await this.saveConfig()
    if (this.config.enabled) await this.start()
  }

  get configPath() {
    return path.join(this.userDataPath, CONFIG_FILE)
  }

  async loadConfig() {
    try {
      return normalizeConfig(JSON.parse(await fs.readFile(this.configPath, 'utf8')))
    } catch {
      return normalizeConfig(null)
    }
  }

  async saveConfig() {
    await fs.mkdir(this.userDataPath, { recursive: true })
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), { encoding: 'utf8', mode: 0o600 })
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      port: this.config.port,
      token: this.config.token,
      url: `http://127.0.0.1:${this.config.port}${MCP_PATH}`,
      status: this.status,
      error: this.error,
      toolCount: this.tools.length,
    }
  }

  /** @param {{ enabled?: boolean, port?: number }} partial */
  async updateConfig(partial) {
    const next = normalizeConfig({ ...this.config, ...partial })
    const needsRestart = next.port !== this.config.port || next.enabled !== this.config.enabled
    this.config = next
    await this.saveConfig()
    if (needsRestart) {
      await this.stop()
      if (this.config.enabled) await this.start()
    }
    return this.getStatus()
  }

  async regenerateToken() {
    this.config = { ...this.config, token: generateToken() }
    await this.saveConfig()
    return this.getStatus()
  }

  async start() {
    if (this.httpServer) return
    const server = http.createServer((req, res) => {
      this.handleHttp(req, res).catch((err) => {
        console.error('[FoqzMcpHost] request failed:', err)
        if (!res.headersSent) sendJsonError(res, 500, 'Internal server error')
      })
    })
    this.status = 'starting'
    this.error = null
    await new Promise((resolve) => {
      server.once('error', (err) => {
        this.status = 'error'
        this.error =
          err.code === 'EADDRINUSE' ? `Port ${this.config.port} is already in use.` : err.message
        console.error('[FoqzMcpHost] failed to start:', err)
        resolve()
      })
      server.listen(this.config.port, '127.0.0.1', () => {
        this.httpServer = server
        this.status = 'running'
        console.log(`[FoqzMcpHost] listening on http://127.0.0.1:${this.config.port}${MCP_PATH}`)
        resolve()
      })
    })
  }

  async stop() {
    const server = this.httpServer
    this.httpServer = null
    this.status = 'stopped'
    this.error = null
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.resolve(errorResult('Foqz MCP server stopped before the tool finished.'))
      this.pending.delete(id)
    }
    if (!server) return
    await new Promise((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
  }

  isAllowedHost(hostHeader) {
    const port = this.config.port
    return hostHeader === `127.0.0.1:${port}` || hostHeader === `localhost:${port}`
  }

  async handleHttp(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname !== MCP_PATH) return sendJsonError(res, 404, 'Not found')

    // DNS-rebinding guard: only loopback Host headers are accepted.
    if (!this.isAllowedHost(req.headers.host)) return sendJsonError(res, 403, 'Forbidden host')
    // Browsers always send Origin; native MCP clients don't. Refuse web pages outright.
    if (req.headers.origin) return sendJsonError(res, 403, 'Browser origins are not allowed')

    const auth = req.headers.authorization || ''
    const presented = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!safeEqual(presented, this.config.token)) {
      res.setHeader('WWW-Authenticate', 'Bearer')
      return sendJsonError(res, 401, 'Missing or invalid bearer token')
    }

    if (req.method !== 'POST') {
      // Stateless server: no standalone SSE stream and no sessions to delete.
      res.setHeader('Allow', 'POST')
      return sendJsonError(res, 405, 'Method not allowed')
    }

    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (err) {
      return sendJsonError(res, 400, err.message === 'too_large' ? 'Request body too large' : 'Invalid JSON body')
    }

    // A Server instance binds to exactly one transport, so build a fresh pair per request.
    const mcpServer = this.createMcpServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close().catch(() => {})
      mcpServer.close().catch(() => {})
    })
    await mcpServer.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  createMcpServer() {
    const server = new Server(
      { name: 'foqz', version: require('electron').app.getVersion() },
      {
        capabilities: { tools: {} },
        instructions:
          'Foqz is a spatial focus canvas. Call get_canvas_summary first to see the board, ' +
          'then create or update tasks, notes, and focus sessions with the other tools.',
      },
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools.map((t) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema && t.inputSchema.type === 'object' ? t.inputSchema : { type: 'object', properties: {} },
      })),
    }))

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      return this.callRendererTool(name, args || {})
    })

    return server
  }

  /** Forward a tool call to the renderer, which owns the canvas store. */
  callRendererTool(name, args) {
    const win = this.getWindow()
    if (!win || win.isDestroyed() || win.webContents.isLoading()) {
      return Promise.resolve(errorResult('The Foqz window is not ready. Open Foqz and try again.'))
    }
    if (this.tools.length === 0) {
      return Promise.resolve(errorResult('The Foqz canvas has not finished loading yet. Try again in a moment.'))
    }

    const requestId = crypto.randomUUID()
    const timeoutMs = SLOW_TOOLS.has(name.replace(/^foqz[_:]+/, '')) ? SLOW_TOOL_TIMEOUT_MS : DEFAULT_CALL_TIMEOUT_MS
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve(errorResult(`Foqz did not finish "${name}" within ${Math.round(timeoutMs / 1000)}s.`))
      }, timeoutMs)
      this.pending.set(requestId, { resolve, timer })
      win.webContents.send('mcpHost:call', { requestId, name, args })
    })
  }
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJsonError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
}

module.exports = { FoqzMcpHost }

const { Client } = require('@modelcontextprotocol/sdk/client')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js')
const { loadMcpConfig, saveMcpConfig, normalizeServerConfig } = require('./mcpConfig.cjs')

class McpClientManager {
  constructor() {
    this.userDataPath = ''
    this.servers = new Map()
    this.initialized = false
  }

  /**
   * Initializes the MCP manager with the user's application data path
   * and connects to all enabled servers.
   * @param {string} userDataPath
   */
  async init(userDataPath) {
    this.userDataPath = userDataPath
    this.initialized = true

    const config = await loadMcpConfig(userDataPath)
    const entries = Object.entries(config.mcpServers || {})

    for (const [name, rawConfig] of entries) {
      await this.connectServer(name, rawConfig).catch((err) => {
        console.error(`[McpManager] Error auto-connecting ${name}:`, err)
      })
    }
  }

  /**
   * Connects to a single MCP server given its name and configuration.
   * @param {string} name
   * @param {any} rawConfig
   */
  async connectServer(name, rawConfig) {
    const config = normalizeServerConfig(name, rawConfig)
    if (!config) {
      this.servers.set(name, {
        name,
        config: { name, transport: 'stdio', enabled: false },
        client: null,
        transport: null,
        status: 'error',
        error: 'Invalid server configuration format',
        tools: [],
      })
      return
    }

    // Disconnect existing session if running
    await this.disconnectServer(name)

    if (!config.enabled) {
      this.servers.set(name, {
        name,
        config,
        client: null,
        transport: null,
        status: 'disabled',
        error: null,
        tools: [],
      })
      return
    }

    this.servers.set(name, {
      name,
      config,
      client: null,
      transport: null,
      status: 'connecting',
      error: null,
      tools: [],
    })

    try {
      let transport
      if (config.transport === 'sse') {
        transport = new SSEClientTransport(new URL(config.url))
      } else {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: {
            ...process.env,
            ...config.env,
          },
          stderr: 'pipe',
        })

        if (transport.stderr) {
          transport.stderr.on('data', (data) => {
            const str = data.toString().trim()
            if (str) {
              console.warn(`[mcp:${name}:stderr]`, str)
            }
          })
        }
      }

      const client = new Client(
        {
          name: 'foqz',
          version: '0.1.0',
        },
        {
          capabilities: {},
        },
      )

      // Connect with timeout guard (10 seconds)
      const connectPromise = client.connect(transport)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out after 10000ms')), 10000),
      )

      await Promise.race([connectPromise, timeoutPromise])

      // Fetch initial tools list
      let tools = []
      try {
        const toolsRes = await client.listTools()
        tools = toolsRes?.tools || []
      } catch (toolErr) {
        console.warn(`[McpManager] Could not fetch tools for ${name}:`, toolErr.message)
      }

      this.servers.set(name, {
        name,
        config,
        client,
        transport,
        status: 'connected',
        error: null,
        tools,
      })

      console.log(`[McpManager] Connected server "${name}" with ${tools.length} tools.`)
    } catch (err) {
      console.error(`[McpManager] Failed to connect to server "${name}":`, err.message)
      this.servers.set(name, {
        name,
        config,
        client: null,
        transport: null,
        status: 'error',
        error: err.message || String(err),
        tools: [],
      })
    }
  }

  /**
   * Disconnects and cleans up a specific MCP server.
   * @param {string} name
   */
  async disconnectServer(name) {
    const existing = this.servers.get(name)
    if (!existing) return

    try {
      if (existing.client) {
        await existing.client.close().catch(() => {})
      }
    } catch {
      // ignore
    }

    try {
      if (existing.transport) {
        await existing.transport.close().catch(() => {})
      }
    } catch {
      // ignore
    }

    existing.client = null
    existing.transport = null
    existing.tools = []
    existing.status = existing.config?.enabled ? 'disconnected' : 'disabled'
  }

  /**
   * Closes all active MCP clients and subprocess transports cleanly.
   */
  async disconnectAll() {
    const names = Array.from(this.servers.keys())
    for (const name of names) {
      await this.disconnectServer(name)
    }
    this.servers.clear()
  }

  /**
   * Returns list of configured servers and their current runtime status.
   */
  listServers() {
    const result = []
    for (const entry of this.servers.values()) {
      result.push({
        name: entry.name,
        transport: entry.config.transport,
        enabled: entry.config.enabled,
        status: entry.status,
        error: entry.error,
        toolCount: entry.tools.length,
      })
    }
    return result
  }

  /**
   * Returns all available tools across connected servers or for a single server.
   * @param {string} [serverName]
   */
  listTools(serverName) {
    if (serverName) {
      const entry = this.servers.get(serverName)
      if (!entry || entry.status !== 'connected') return []
      return entry.tools.map((t) => ({
        ...t,
        serverName,
      }))
    }

    const aggregated = []
    for (const [sName, entry] of this.servers.entries()) {
      if (entry.status === 'connected') {
        for (const tool of entry.tools) {
          aggregated.push({
            ...tool,
            serverName: sName,
          })
        }
      }
    }
    return aggregated
  }

  /**
   * Calls a tool on a connected server.
   * @param {string} serverName
   * @param {string} toolName
   * @param {any} args
   */
  async callTool(serverName, toolName, args) {
    const entry = this.servers.get(serverName)
    if (!entry) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Server "${serverName}" is not registered.` }],
      }
    }

    if (entry.status !== 'connected' || !entry.client) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Server "${serverName}" is not connected (status: ${entry.status}).` }],
      }
    }

    try {
      const res = await entry.client.callTool({
        name: toolName,
        arguments: args || {},
      })
      return {
        isError: Boolean(res.isError),
        content: res.content || [],
      }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `MCP Tool execution failed: ${err.message || String(err)}` }],
      }
    }
  }

  /**
   * Restarts a single server by re-reading config and connecting.
   * @param {string} serverName
   */
  async restartServer(serverName) {
    const config = await loadMcpConfig(this.userDataPath)
    const serverConf = config.mcpServers?.[serverName]
    if (!serverConf) {
      await this.disconnectServer(serverName)
      this.servers.delete(serverName)
      return { ok: false, error: `Server "${serverName}" not found in config` }
    }
    await this.connectServer(serverName, serverConf)
    const entry = this.servers.get(serverName)
    return {
      ok: entry?.status === 'connected',
      status: entry?.status,
      error: entry?.error,
    }
  }

  /**
   * Replaces configuration on disk and reconciles running server processes.
   * @param {any} newConfig
   */
  async updateConfig(newConfig) {
    const saveRes = await saveMcpConfig(this.userDataPath, newConfig)
    if (!saveRes.ok) return saveRes

    const currentNames = new Set(this.servers.keys())
    const newServers = newConfig.mcpServers || {}
    const newNames = new Set(Object.keys(newServers))

    // Disconnect servers removed from config
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.disconnectServer(name)
        this.servers.delete(name)
      }
    }

    // Connect or update servers in new config
    for (const [name, rawConfig] of Object.entries(newServers)) {
      await this.connectServer(name, rawConfig).catch(() => {})
    }

    return { ok: true }
  }
}

module.exports = { McpClientManager }

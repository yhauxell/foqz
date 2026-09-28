const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

const MCP_CONFIG_FILE = 'foqz-mcp.json'

const DEFAULT_MCP_CONFIG = {
  mcpServers: {},
}

/**
 * Returns the path to the foqz-mcp.json config file.
 * @param {string} userDataPath
 * @returns {string}
 */
function getMcpConfigPath(userDataPath) {
  return path.join(userDataPath, MCP_CONFIG_FILE)
}

/**
 * Validates and normalizes a server configuration object.
 * @param {string} name
 * @param {any} raw
 */
function normalizeServerConfig(name, raw) {
  if (!raw || typeof raw !== 'object') return null
  const enabled = raw.enabled !== false

  // SSE Transport
  if (raw.transport === 'sse' || (typeof raw.url === 'string' && raw.url.trim())) {
    const url = String(raw.url || '').trim()
    if (!url) return null
    return {
      name,
      transport: 'sse',
      url,
      enabled,
    }
  }

  // Stdio Transport
  const command = typeof raw.command === 'string' ? raw.command.trim() : ''
  if (!command) return null

  const args = Array.isArray(raw.args) ? raw.args.map(String) : []
  const env = raw.env && typeof raw.env === 'object' ? { ...raw.env } : {}

  return {
    name,
    transport: 'stdio',
    command,
    args,
    env,
    enabled,
  }
}

/**
 * Loads foqz-mcp.json from disk, creating a default file if none exists.
 * @param {string} userDataPath
 * @returns {Promise<{ mcpServers: Record<string, any> }>}
 */
async function loadMcpConfig(userDataPath) {
  const configPath = getMcpConfigPath(userDataPath)
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.mcpServers === 'object') {
      return parsed
    }
    return { ...DEFAULT_MCP_CONFIG }
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Create empty config file
      const initial = {
        mcpServers: {},
      }
      try {
        await fs.mkdir(userDataPath, { recursive: true })
        await fs.writeFile(configPath, JSON.stringify(initial, null, 2), 'utf8')
      } catch (writeErr) {
        console.error('[mcpConfig] Failed to write initial config file:', writeErr)
      }
      return initial
    }
    console.error('[mcpConfig] Failed to load config:', err)
    return { ...DEFAULT_MCP_CONFIG }
  }
}

/**
 * Saves MCP configuration to foqz-mcp.json.
 * @param {string} userDataPath
 * @param {any} config
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function saveMcpConfig(userDataPath, config) {
  const configPath = getMcpConfigPath(userDataPath)
  try {
    if (!config || typeof config !== 'object' || typeof config.mcpServers !== 'object') {
      return { ok: false, error: 'Invalid MCP configuration format' }
    }
    await fs.mkdir(userDataPath, { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
    return { ok: true }
  } catch (err) {
    console.error('[mcpConfig] Failed to save config:', err)
    return { ok: false, error: err.message || String(err) }
  }
}

module.exports = {
  MCP_CONFIG_FILE,
  getMcpConfigPath,
  normalizeServerConfig,
  loadMcpConfig,
  saveMcpConfig,
}

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  transport?: 'stdio' | 'sse'
  enabled?: boolean
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
}

export interface McpServerStatus {
  name: string
  transport: 'stdio' | 'sse'
  enabled: boolean
  status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'disabled'
  error?: string | null
  toolCount: number
}

export interface McpTool {
  serverName: string
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, any>
    required?: string[]
    [key: string]: any
  }
}

export interface McpToolCallResult {
  isError: boolean
  content: Array<{
    type: string
    text?: string
    [key: string]: any
  }>
}

export interface McpHostStatus {
  enabled: boolean
  port: number
  token: string
  url: string
  status: 'stopped' | 'starting' | 'running' | 'error'
  error: string | null
  toolCount: number
}

/** Embedded Foqz MCP server that external agents (Claude, Cursor, ...) connect to. */
export interface McpHostApi {
  getStatus: () => Promise<McpHostStatus>
  updateConfig: (partial: { enabled?: boolean; port?: number }) => Promise<McpHostStatus>
  regenerateToken: () => Promise<McpHostStatus>
  registerTools: (tools: Array<Pick<McpTool, 'name' | 'description' | 'inputSchema'>>) => void
  onToolCall: (
    handler: (name: string, args: Record<string, any>) => Promise<McpToolCallResult>,
  ) => () => void
}

export interface McpStoreApi {
  getConfig: () => Promise<McpConfigFile>
  saveConfig: (config: McpConfigFile) => Promise<{ ok: boolean; error?: string }>
  getConfigPath: () => Promise<string>
  listServers: () => Promise<McpServerStatus[]>
  listTools: (serverName?: string) => Promise<McpTool[]>
  callTool: (serverName: string, toolName: string, args?: Record<string, any>) => Promise<McpToolCallResult>
  restartServer: (serverName: string) => Promise<{ ok: boolean; status?: string; error?: string }>
}

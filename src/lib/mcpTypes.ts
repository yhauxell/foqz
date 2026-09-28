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

export interface McpStoreApi {
  getConfig: () => Promise<McpConfigFile>
  saveConfig: (config: McpConfigFile) => Promise<{ ok: boolean; error?: string }>
  getConfigPath: () => Promise<string>
  listServers: () => Promise<McpServerStatus[]>
  listTools: (serverName?: string) => Promise<McpTool[]>
  callTool: (serverName: string, toolName: string, args?: Record<string, any>) => Promise<McpToolCallResult>
  restartServer: (serverName: string) => Promise<{ ok: boolean; status?: string; error?: string }>
}

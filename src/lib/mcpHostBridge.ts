import { useEffect } from 'react'
import { NATIVE_FOQZ_TOOLS, createFlowCanvasToolExecutor } from './canvasTools'

/**
 * Serves the embedded Foqz MCP server (Electron main) from the renderer: publishes the native
 * canvas tool definitions and executes calls from external agents against the live canvas store.
 */
export function useMcpHostBridge() {
  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.focusStore?.mcpHost : undefined
    if (!host) return

    const seen = new Set<string>()
    const tools = NATIVE_FOQZ_TOOLS.filter((t) => {
      if (seen.has(t.name)) return false
      seen.add(t.name)
      return true
    }).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
    host.registerTools(tools)

    const execute = createFlowCanvasToolExecutor()
    return host.onToolCall((name, args) => execute(name, args ?? {}, 'foqz'))
  }, [])
}

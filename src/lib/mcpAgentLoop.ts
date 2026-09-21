import type { McpTool, McpToolCallResult } from './mcpTypes'
import {
  streamOllamaChat,
  type OllamaChatMessage,
  type OllamaToolCall,
  type OllamaToolDefinition,
  type StreamOllamaChatResult,
} from './ollama'

export interface AgentToolCallEvent {
  id: string
  serverName?: string
  toolName: string
  rawName: string
  args: Record<string, any>
  result?: McpToolCallResult
  isError?: boolean
  durationMs?: number
}

export interface AgentStepEvent {
  stepIndex: number
  role: string
  content: string
  toolCalls?: OllamaToolCall[]
}

export interface RunAgentLoopOptions {
  model: string
  userPrompt: string
  systemPrompt?: string
  canvasContext?: string
  tools?: McpTool[]
  maxSteps?: number
  baseUrl?: string
  signal?: AbortSignal
  onChunk?: (delta: string) => void
  onToolCallStart?: (event: AgentToolCallEvent) => void
  onToolCallEnd?: (event: AgentToolCallEvent) => void
  onStep?: (event: AgentStepEvent) => void
  localToolExecutor?: (
    toolName: string,
    args: Record<string, any>,
  ) => Promise<McpToolCallResult>
}

export interface AgentLoopResult {
  success: boolean
  finalText: string
  steps: number
  history: OllamaChatMessage[]
  executedTools: AgentToolCallEvent[]
  fallbackUsed?: boolean
  error?: string
}

/**
 * Parses raw tool name into serverName and toolName.
 * Format: "serverName__toolName" or "toolName".
 */
export function parseToolName(rawName: string): {
  serverName?: string
  toolName: string
} {
  if (rawName.includes('__')) {
    const parts = rawName.split('__')
    return {
      serverName: parts[0],
      toolName: parts.slice(1).join('__'),
    }
  }
  return {
    serverName: undefined,
    toolName: rawName,
  }
}

/**
 * Encodes serverName and toolName into unique Ollama function name.
 */
export function encodeToolName(serverName: string | undefined, toolName: string): string {
  if (!serverName) return toolName
  return `${serverName}__${toolName}`
}

/**
 * Converts McpTool list to Ollama function definitions.
 */
export function formatMcpToolsForOllama(tools: McpTool[]): OllamaToolDefinition[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: encodeToolName(t.serverName, t.name),
      description: t.description || '',
      parameters: t.inputSchema || {
        type: 'object',
        properties: {},
      },
    },
  }))
}

/**
 * Determines if an error returned by Ollama is caused by lack of tools support.
 */
function isToolUnsupportedError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  return (
    msg.includes('does not support tools') ||
    msg.includes('unknown field: tools') ||
    msg.includes('tool calling is not supported') ||
    msg.includes('tools are not supported') ||
    msg.includes('bad request')
  )
}

/**
 * Runs the multi-turn agent execution loop with Ollama and MCP tools.
 */
export async function runAgentLoop(options: RunAgentLoopOptions): Promise<AgentLoopResult> {
  const maxSteps = options.maxSteps ?? 5
  const messages: OllamaChatMessage[] = []
  const executedTools: AgentToolCallEvent[] = []

  const toolsList = options.tools || []
  const ollamaTools = formatMcpToolsForOllama(toolsList)

  if (options.systemPrompt) {
    let sys = options.systemPrompt
    if (ollamaTools.length > 0) {
      sys += `\n\nWhen tools are provided, call the relevant functions to inspect data or update the canvas. When you receive tool execution results, summarize them naturally for the user. Do not output raw tool invocation JSON objects in your final text response.`
    }
    messages.push({ role: 'system', content: sys })
  }

  const userContent = options.canvasContext
    ? `${options.canvasContext}\n\nUser request: ${options.userPrompt}`
    : options.userPrompt

  messages.push({ role: 'user', content: userContent })

  let steps = 0

  while (steps < maxSteps) {
    if (options.signal?.aborted) {
      throw new DOMException('Agent loop aborted by user', 'AbortError')
    }

    let chatResult: StreamOllamaChatResult
    try {
      chatResult = await streamOllamaChat({
        baseUrl: options.baseUrl,
        model: options.model,
        messages,
        tools: ollamaTools.length > 0 ? ollamaTools : undefined,
        onChunk: options.onChunk,
        signal: options.signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err

      // Automatic fallback: if model doesn't support tools, retry without tools
      if (ollamaTools.length > 0 && isToolUnsupportedError(err)) {
        console.warn(
          '[mcpAgentLoop] Model does not support tools parameter, falling back to prompt mode:',
          err.message,
        )
        const fallback = await streamOllamaChat({
          baseUrl: options.baseUrl,
          model: options.model,
          messages,
          onChunk: options.onChunk,
          signal: options.signal,
        })
        messages.push({ role: 'assistant', content: fallback.content })
        return {
          success: true,
          finalText: fallback.content,
          steps: 1,
          history: messages,
          executedTools,
          fallbackUsed: true,
        }
      }
      throw err
    }

    // Check if any tools were called
    if (chatResult.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: chatResult.content })
      options.onStep?.({
        stepIndex: steps,
        role: 'assistant',
        content: chatResult.content,
      })
      return {
        success: true,
        finalText: chatResult.content,
        steps: steps + 1,
        history: messages,
        executedTools,
      }
    }

    // Tools were called: record assistant response with tool calls.
    // If the assistant emitted raw JSON or tool tags as content, normalize content to empty string
    // so subsequent conversation turns recognize this as a pure function-calling turn.
    const isRawToolCallString =
      chatResult.content.trim().startsWith('{') ||
      chatResult.content.trim().startsWith('[') ||
      chatResult.content.trim().startsWith('```') ||
      chatResult.content.trim().startsWith('<tool_call>')

    messages.push({
      role: 'assistant',
      content: isRawToolCallString ? '' : chatResult.content,
      tool_calls: chatResult.toolCalls,
    })

    options.onStep?.({
      stepIndex: steps,
      role: 'assistant',
      content: chatResult.content,
      toolCalls: chatResult.toolCalls,
    })

    // Execute each requested tool call
    for (const tc of chatResult.toolCalls) {
      if (options.signal?.aborted) {
        throw new DOMException('Agent loop aborted by user', 'AbortError')
      }

      const rawName = tc.function.name
      const { serverName, toolName } = parseToolName(rawName)
      const callEvent: AgentToolCallEvent = {
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        serverName,
        toolName,
        rawName,
        args: tc.function.arguments || {},
      }

      options.onToolCallStart?.(callEvent)
      const startTime = Date.now()

      let toolResult: McpToolCallResult
      try {
        if (
          options.localToolExecutor &&
          (rawName.startsWith('foqz_') ||
            !serverName ||
            typeof window === 'undefined' ||
            !window.focusStore?.mcp?.callTool)
        ) {
          toolResult = await options.localToolExecutor(
            toolName,
            callEvent.args,
            serverName,
          )
        } else if (
          typeof window !== 'undefined' &&
          window.focusStore?.mcp?.callTool &&
          serverName
        ) {
          toolResult = await window.focusStore.mcp.callTool(
            serverName,
            toolName,
            callEvent.args,
          )
        } else {
          toolResult = {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Tool executor not found for tool "${rawName}" on server "${serverName || 'local'}".`,
              },
            ],
          }
        }
      } catch (execErr: any) {
        toolResult = {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Tool execution failed: ${execErr.message || String(execErr)}`,
            },
          ],
        }
      }

      const durationMs = Date.now() - startTime
      callEvent.result = toolResult
      callEvent.isError = toolResult.isError
      callEvent.durationMs = durationMs
      executedTools.push(callEvent)

      options.onToolCallEnd?.(callEvent)

      // Format result content for the follow-up message
      const formattedContent =
        toolResult.content
          ?.map((c) => (typeof c.text === 'string' ? c.text : JSON.stringify(c)))
          .join('\n') || JSON.stringify(toolResult)

      messages.push({
        role: 'tool',
        content: formattedContent,
        name: rawName,
      })
    }

    steps++
  }

  // Max steps reached
  const finalMsg =
    messages[messages.length - 1]?.role === 'assistant'
      ? messages[messages.length - 1].content
      : 'Agent reached maximum iteration limit.'

  return {
    success: true,
    finalText: finalMsg,
    steps,
    history: messages,
    executedTools,
  }
}

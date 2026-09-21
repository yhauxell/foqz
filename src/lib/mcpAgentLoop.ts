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
    serverName?: string,
  ) => Promise<McpToolCallResult>
  conversationHistory?: OllamaChatMessage[]
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
 * Normalizes tool arguments against schema definitions to handle common LLM alias discrepancies
 * (e.g. `query` vs `q`, stringified numbers, missing repo syntax).
 */
export function normalizeToolArgs(
  toolDef?: McpTool,
  rawArgs?: Record<string, any>,
): Record<string, any> {
  const args = { ...(rawArgs || {}) }
  const schema = toolDef?.inputSchema || {}
  const properties = schema.properties || {}
  const required = schema.required || []

  const aliasMap: Record<string, string[]> = {
    q: ['query', 'search', 'term', 'keyword', 'text', 'prompt'],
    query: ['q', 'search', 'term', 'keyword', 'text', 'prompt'],
    repo: ['repository', 'repo_name', 'name'],
    owner: ['user', 'username', 'org', 'organization'],
    issue_number: ['issueNumber', 'issue', 'number', 'id'],
    pull_number: ['pullNumber', 'pull', 'pr', 'number', 'id'],
    path: ['file_path', 'filePath', 'file', 'filename'],
    content: ['body', 'text', 'code'],
    message: ['commit_message', 'commitMessage', 'msg'],
    branch: ['ref', 'branch_name', 'branchName'],
  }

  for (const [propName, propDef] of Object.entries(properties)) {
    if (args[propName] === undefined || args[propName] === null) {
      const aliases = aliasMap[propName] || []
      for (const alias of aliases) {
        if (args[alias] !== undefined && args[alias] !== null) {
          args[propName] = args[alias]
          break
        }
      }
    }

    const val = args[propName]
    if (val !== undefined && val !== null) {
      const pType = (propDef as any).type
      if (pType === 'number' || pType === 'integer') {
        if (typeof val === 'string') {
          const parsed = Number(val)
          if (!isNaN(parsed)) {
            args[propName] = pType === 'integer' ? Math.round(parsed) : parsed
          }
        }
      } else if (pType === 'string') {
        if (typeof val !== 'string') {
          args[propName] = String(val)
        }
      } else if (pType === 'boolean') {
        if (typeof val === 'string') {
          args[propName] = val.toLowerCase() === 'true' || val === '1'
        }
      }
    }
  }

  // GitHub MCP search tools require 'q' (e.g. search_issues, search_code, search_users)
  const isQRequiredTool =
    toolDef?.name === 'search_issues' ||
    toolDef?.name === 'search_code' ||
    toolDef?.name === 'search_users' ||
    required.includes('q')

  if (isQRequiredTool) {
    if (!args.q) {
      const qParts: string[] = []
      const textPart =
        args.query || args.search || args.term || args.keyword || args.text || args.prompt
      if (textPart) qParts.push(textPart)

      if (args.owner && args.repo) {
        qParts.push(`repo:${args.owner}/${args.repo}`)
      } else if (args.repo) {
        qParts.push(`repo:${args.repo}`)
      }

      if (toolDef?.name === 'search_issues') {
        if (args.state && (args.state === 'open' || args.state === 'closed')) {
          qParts.push(`is:${args.state}`)
        }
        if (qParts.length === 0) {
          qParts.push('is:issue is:open')
        }
      }

      args.q = qParts.join(' ').trim() || '*'
    } else {
      if (args.owner && args.repo && !args.q.includes('repo:')) {
        args.q = `${args.q} repo:${args.owner}/${args.repo}`
      } else if (args.repo && !args.q.includes('repo:')) {
        args.q = `${args.q} repo:${args.repo}`
      }
    }
  }

  // search_repositories requires 'query'
  if (toolDef?.name === 'search_repositories' || (required.includes('query') && !properties.q)) {
    if (!args.query) {
      args.query = args.q || args.search || args.name || args.repo || '*'
    }
  }

  return args
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
      sys += `\n\nWhen tools are provided, call the relevant functions to inspect data or update the canvas.
Tool argument guidelines:
- For search tools (e.g. search_issues, search_code, search_users), the search query parameter MUST be named "q" (e.g. {"q": "is:issue repo:owner/repo"}).
- For repository inspection (e.g. list_issues, get_issue), provide "owner" and "repo".
- Pass issue_number and pull_number as integer numbers (e.g. 11, not "11").
When you receive tool execution results, summarize them naturally for the user in clear markdown. Do not output raw tool invocation JSON objects in your final text response.`
    }
    messages.push({ role: 'system', content: sys })
  }

  if (options.conversationHistory && options.conversationHistory.length > 0) {
    for (const msg of options.conversationHistory) {
      if (msg.role !== 'system') {
        messages.push(msg)
      }
    }
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
      const matchingTool = toolsList.find((t) => {
        if (t.serverName && serverName) {
          return (
            (t.serverName === serverName && t.name === toolName) ||
            encodeToolName(t.serverName, t.name) === rawName
          )
        }
        return t.name === toolName
      })
      const normalizedArgs = normalizeToolArgs(matchingTool, tc.function.arguments || {})

      const callEvent: AgentToolCallEvent = {
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        serverName,
        toolName,
        rawName,
        args: normalizedArgs,
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
      let formattedContent =
        toolResult.content
          ?.map((c) => (typeof c.text === 'string' ? c.text : JSON.stringify(c)))
          .join('\n') || JSON.stringify(toolResult)

      if (toolResult.isError) {
        formattedContent = `[Tool Execution Failed]: ${formattedContent}\nPlease explain this error to the user in conversational markdown and suggest how to resolve it.`
      }

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

import type { McpTool } from './mcpTypes'
import {
  streamOllamaChat,
  parseToolCallsFromContent,
  type OllamaChatMessage,
  type OllamaToolCall,
  type OllamaToolDefinition,
} from './ollama'
import { encodeToolName } from './mcpAgentLoop'

export type AiProviderName = 'ollama' | 'openai'

export interface AiChatMessage extends OllamaChatMessage {
  tool_call_id?: string
}

export interface StreamAiChatOptions {
  provider: AiProviderName
  model: string
  apiKey?: string
  baseUrl?: string
  messages: AiChatMessage[]
  tools?: McpTool[]
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
}

export interface StreamAiChatResult {
  content: string
  toolCalls: OllamaToolCall[]
}

export interface OpenAiToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, any>
  }
}

/**
 * Format MCP tools into OpenAI standard function calling schema.
 */
export function formatMcpToolsForOpenAi(tools: McpTool[]): OpenAiToolDefinition[] {
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
 * Normalizes an error to determine if it indicates a lack of function calling capability.
 */
export function isToolCallingUnsupported(err: any): boolean {
  if (!err) return false
  const msg = (err.message || String(err)).toLowerCase()
  return (
    msg.includes('does not support tools') ||
    msg.includes('tool calling is not supported') ||
    msg.includes('tools are not supported') ||
    msg.includes('unknown field: tools') ||
    msg.includes('function calling is not supported') ||
    msg.includes('unsupported parameter') ||
    msg.includes('unknown parameter: tools')
  )
}

/**
 * Streams chat completion from OpenAI or OpenAI-compatible endpoints with full tool calling support.
 */
export async function streamOpenAiChatWithTools(
  opts: StreamAiChatOptions,
): Promise<StreamAiChatResult> {
  const baseUrl = (opts.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const apiKey = opts.apiKey?.trim() || ''

  const openAiTools = opts.tools && opts.tools.length > 0 ? formatMcpToolsForOpenAi(opts.tools) : undefined

  // Format messages into OpenAI format
  const formattedMessages: any[] = opts.messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.tool_call_id || (m.name ? `call_${m.name}` : `call_${Date.now()}`),
        content: m.content,
      }
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments:
              typeof tc.function.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments || {}),
          },
        })),
      }
    }
    return {
      role: m.role,
      content: m.content,
    }
  })

  const payload: Record<string, any> = {
    model: opts.model,
    messages: formattedMessages,
    stream: true,
  }

  if (openAiTools && openAiTools.length > 0) {
    payload.tools = openAiTools
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: opts.signal,
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText)
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      if (parsed?.error?.message) message = parsed.error.message
      else if (parsed?.message) message = parsed.message
    } catch {}
    throw new Error(`OpenAI error (${res.status}): ${message}`)
  }

  if (!res.body) {
    throw new Error('ReadableStream not supported by OpenAI response.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let accumulatedContent = ''
  const toolCallMap: Record<
    number,
    { id: string; name: string; argsStr: string }
  > = {}

  const processLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data:')) return
    const dataStr = trimmed.slice(5).trim()
    if (dataStr === '[DONE]') return

    try {
      const json = JSON.parse(dataStr)
      const choice = json.choices?.[0]
      if (!choice) return

      const delta = choice.delta
      if (delta?.content) {
        accumulatedContent += delta.content
        opts.onChunk?.(delta.content)
      }

      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === 'number' ? tc.index : 0
          if (!toolCallMap[idx]) {
            toolCallMap[idx] = {
              id: tc.id || `call_${Date.now()}_${idx}`,
              name: tc.function?.name || '',
              argsStr: tc.function?.arguments || '',
            }
          } else {
            if (tc.id) toolCallMap[idx].id = tc.id
            if (tc.function?.name) toolCallMap[idx].name += tc.function.name
            if (tc.function?.arguments) toolCallMap[idx].argsStr += tc.function.arguments
          }
        }
      }
    } catch {
      // ignore chunk json parse errors
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      processLine(line)
    }
  }

  if (buffer.trim()) {
    processLine(buffer)
  }

  const toolCalls: OllamaToolCall[] = []
  for (const item of Object.values(toolCallMap)) {
    if (item.name) {
      let args: Record<string, any> = {}
      try {
        args = JSON.parse(item.argsStr.trim() || '{}')
      } catch {
        args = {}
      }
      toolCalls.push({
        id: item.id,
        function: {
          name: item.name,
          arguments: args,
        },
      })
    }
  }

  // Fallback: If model emitted tool JSON in content text instead of structured tool_calls
  if (toolCalls.length === 0 && openAiTools && openAiTools.length > 0 && accumulatedContent.trim()) {
    const extracted = parseToolCallsFromContent(
      accumulatedContent,
      openAiTools as unknown as OllamaToolDefinition[],
    )
    if (extracted.length > 0) {
      toolCalls.push(...extracted)
    }
  }

  return {
    content: accumulatedContent,
    toolCalls,
  }
}

/**
 * Universal chat streaming dispatcher with tool calling for Ollama and OpenAI-compatible endpoints.
 */
export async function streamAiChatWithTools(
  opts: StreamAiChatOptions,
): Promise<StreamAiChatResult> {
  const provider = opts.provider || 'ollama'

  try {
    if (provider === 'openai') {
      return await streamOpenAiChatWithTools(opts)
    }

    // Default: Ollama
    const ollamaTools = opts.tools ? formatMcpToolsForOpenAi(opts.tools) as unknown as OllamaToolDefinition[] : undefined
    return await streamOllamaChat({
      baseUrl: opts.baseUrl,
      model: opts.model,
      messages: opts.messages,
      tools: ollamaTools,
      onChunk: opts.onChunk,
      signal: opts.signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err

    // Graceful automatic fallback if the model doesn't support the tools parameter
    if (opts.tools && opts.tools.length > 0 && isToolCallingUnsupported(err)) {
      console.warn(`[aiProvider] Provider "${provider}" model "${opts.model}" does not support tools. Retrying without tools:`, err.message)
      const noToolsOpts: StreamAiChatOptions = {
        ...opts,
        tools: undefined,
      }
      if (provider === 'openai') {
        return await streamOpenAiChatWithTools(noToolsOpts)
      }
      return await streamOllamaChat({
        baseUrl: opts.baseUrl,
        model: opts.model,
        messages: opts.messages,
        onChunk: opts.onChunk,
        signal: opts.signal,
      })
    }

    throw err
  }
}

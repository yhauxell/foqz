import type { McpTool } from './mcpTypes'
import {
  streamOllamaChat,
  parseToolCallsFromContent,
  type OllamaChatMessage,
  type OllamaToolCall,
  type OllamaToolDefinition,
} from './ollama'
import { encodeToolName } from './mcpAgentLoop'

export type AiProviderName = 'ollama' | 'openai' | 'gemini'

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

export interface GeminiFunctionDeclaration {
  name: string
  description?: string
  parameters?: Record<string, any>
}

/**
 * Strips JSON Schema keywords not supported or restricted by Google Gemini v1beta function declarations
 * (e.g. $schema, additionalProperties, default, title).
 */
export function sanitizeGeminiParameters(schema?: Record<string, any>): Record<string, any> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} }
  }

  const clean: Record<string, any> = {}

  if (schema.type) {
    clean.type = typeof schema.type === 'string' ? schema.type.toLowerCase() : 'object'
  } else {
    clean.type = 'object'
  }

  if (typeof schema.description === 'string') {
    clean.description = schema.description
  }

  if (Array.isArray(schema.enum)) {
    clean.enum = schema.enum
  }

  if (Array.isArray(schema.required) && schema.required.length > 0) {
    clean.required = schema.required
  }

  if (schema.properties && typeof schema.properties === 'object') {
    clean.properties = {}
    for (const [key, propDef] of Object.entries(schema.properties)) {
      if (propDef && typeof propDef === 'object') {
        clean.properties[key] = sanitizeGeminiParameters(propDef as Record<string, any>)
      }
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    clean.items = sanitizeGeminiParameters(schema.items as Record<string, any>)
  }

  return clean
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
 * Format MCP tools into Google Gemini function declarations.
 */
export function formatMcpToolsForGemini(tools: McpTool[]): GeminiFunctionDeclaration[] {
  return tools.map((t) => ({
    name: encodeToolName(t.serverName, t.name),
    description: t.description || '',
    parameters: sanitizeGeminiParameters(t.inputSchema),
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
 * Streams chat completion from Google Gemini API with native function declarations.
 */
export async function streamGeminiChatWithTools(
  opts: StreamAiChatOptions,
): Promise<StreamAiChatResult> {
  const apiKey = opts.apiKey?.trim() || ''
  if (!apiKey) {
    throw new Error('Gemini API key is required.')
  }

  const model = opts.model || 'gemini-1.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`

  // Extract system prompt if present
  const systemMsgs = opts.messages.filter((m) => m.role === 'system')
  const systemInstruction =
    systemMsgs.length > 0
      ? { parts: [{ text: systemMsgs.map((m) => m.content).join('\n\n') }] }
      : undefined

  // Convert conversation turns into Gemini contents
  const contents: any[] = []
  for (const msg of opts.messages) {
    if (msg.role === 'system') continue

    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content || ' ' }],
      })
    } else if (msg.role === 'assistant') {
      const parts: any[] = []
      if (msg.content && msg.content.trim()) {
        parts.push({ text: msg.content })
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: tc.function.arguments || {},
            },
          })
        }
      }
      if (parts.length === 0) {
        parts.push({ text: ' ' })
      }
      contents.push({ role: 'model', parts })
    } else if (msg.role === 'tool') {
      let outputObj: any = { content: msg.content }
      try {
        outputObj = JSON.parse(msg.content)
      } catch {}

      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.name || 'tool_result',
              response: typeof outputObj === 'object' && outputObj !== null ? outputObj : { content: msg.content },
            },
          },
        ],
      })
    }
  }

  const geminiFunctions = opts.tools && opts.tools.length > 0 ? formatMcpToolsForGemini(opts.tools) : []
  const tools = geminiFunctions.length > 0 ? [{ functionDeclarations: geminiFunctions }] : undefined

  const payload: Record<string, any> = {
    contents,
    systemInstruction,
  }
  if (tools) {
    payload.tools = tools
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    throw new Error(`Gemini error (${res.status}): ${message}`)
  }

  if (!res.body) {
    throw new Error('ReadableStream not supported by Gemini response.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let accumulatedContent = ''
  const toolCalls: OllamaToolCall[] = []

  const processLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data:')) return
    const dataStr = trimmed.slice(5).trim()

    try {
      const json = JSON.parse(dataStr)
      const candidate = json.candidates?.[0]
      if (!candidate?.content?.parts) return

      for (const part of candidate.content.parts) {
        if (part.text) {
          accumulatedContent += part.text
          opts.onChunk?.(part.text)
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_gemini_${Date.now()}_${toolCalls.length}`,
            function: {
              name: part.functionCall.name,
              arguments: part.functionCall.args || {},
            },
          })
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

  // Fallback: If model emitted tool JSON in content text instead of functionCall
  if (toolCalls.length === 0 && opts.tools && opts.tools.length > 0 && accumulatedContent.trim()) {
    const extracted = parseToolCallsFromContent(
      accumulatedContent,
      formatMcpToolsForOpenAi(opts.tools) as unknown as OllamaToolDefinition[],
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
 * Universal chat streaming dispatcher with full tool calling for Ollama, OpenAI, and Gemini.
 */
export async function streamAiChatWithTools(
  opts: StreamAiChatOptions,
): Promise<StreamAiChatResult> {
  const provider = opts.provider || 'ollama'

  try {
    if (provider === 'openai') {
      return await streamOpenAiChatWithTools(opts)
    }

    if (provider === 'gemini') {
      return await streamGeminiChatWithTools(opts)
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
      if (provider === 'gemini') {
        return await streamGeminiChatWithTools(noToolsOpts)
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

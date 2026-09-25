import { useState, useEffect, useCallback } from 'react'

export interface OllamaModelInfo {
  name: string
  model: string
  size: number
  parameterSize?: string
  capabilities?: string[]
}

export interface OllamaToolCall {
  id?: string
  function: {
    name: string
    arguments: Record<string, any>
  }
}

export interface OllamaToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, any>
  }
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: OllamaToolCall[]
  name?: string
}

export interface StreamOllamaChatResult {
  content: string
  toolCalls: OllamaToolCall[]
}

export interface StreamOllamaChatOptions {
  baseUrl?: string
  model: string
  messages?: OllamaChatMessage[]
  prompt?: string
  system?: string
  tools?: OllamaToolDefinition[]
  onChunk?: (chunk: string) => void
  onToolCalls?: (calls: OllamaToolCall[]) => void
  onDone?: (fullText: string, toolCalls: OllamaToolCall[]) => void
  onError?: (err: Error) => void
  signal?: AbortSignal
}

export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

export function getEffectiveOllamaBaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('foqz_ollama_base_url')
      if (stored && stored.trim()) return stored.trim()
    } catch {}
  }
  return OLLAMA_BASE_URL
}

/**
 * Check if local Ollama daemon is reachable and return available models and capabilities.
 */
export async function getOllamaStatus(baseUrl: string = getEffectiveOllamaBaseUrl()): Promise<{
  online: boolean
  models: string[]
  modelDetails?: OllamaModelInfo[]
}> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!res.ok) {
      return { online: false, models: [] }
    }
    const data = (await res.json()) as {
      models?: Array<{
        name: string
        model?: string
        size?: number
        capabilities?: string[]
        details?: { parameter_size?: string }
      }>
    }
    const models = (data.models ?? []).map((m) => m.name)
    const modelDetails = (data.models ?? []).map((m) => ({
      name: m.name,
      model: m.model || m.name,
      size: m.size || 0,
      parameterSize: m.details?.parameter_size,
      capabilities: m.capabilities || [],
    }))
    return { online: true, models, modelDetails }
  } catch {
    return { online: false, models: [] }
  }
}

/**
 * Pick the best default model for coding/tasks from the available list.
 */
export function pickDefaultOllamaModel(models: string[]): string {
  if (!models.length) return ''
  const priorityPatterns = [
    /qwen2\.5-coder/i,
    /qwen.*coder/i,
    /deepseek-coder/i,
    /coder/i,
    /qwen/i,
    /llama3/i,
    /gemma/i,
  ]
  for (const pattern of priorityPatterns) {
    const found = models.find((m) => pattern.test(m))
    if (found) return found
  }
  return models[0]
}

/**
/**
 * Matches a declared tool by exact name, colon notation, or suffix.
 */
function findDeclaredTool(
  name: string,
  declaredTools: OllamaToolDefinition[],
): OllamaToolDefinition | null {
  // 1. Exact match (e.g. "github__list_issues" === "github__list_issues")
  let match = declaredTools.find((t) => t.function.name === name)
  if (match) return match

  // 2. Normalized colon vs double-underscore (e.g. "github:list_issues" -> "github__list_issues")
  const normalized = name.replace(':', '__')
  match = declaredTools.find((t) => t.function.name === normalized)
  if (match) return match

  // 3. Suffix match (e.g. "list_issues" matches "github__list_issues")
  const suffixMatches = declaredTools.filter(
    (t) => t.function.name.endsWith(`__${name}`) || t.function.name === name,
  )
  if (suffixMatches.length === 1) return suffixMatches[0]

  return null
}

/**
 * Extracts balanced JSON objects or arrays from arbitrary content text.
 */
function extractJsonObjects(text: string): any[] {
  const objects: any[] = []
  let depth = 0
  let startIdx = -1
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{' || ch === '[') {
      if (depth === 0) startIdx = i
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0 && startIdx !== -1) {
        const candidate = text.slice(startIdx, i + 1)
        try {
          const parsed = JSON.parse(candidate)
          if (Array.isArray(parsed)) {
            objects.push(...parsed)
          } else {
            objects.push(parsed)
          }
        } catch {}
        startIdx = -1
      }
    }
  }
  return objects
}

/**
 * Resiliently parses tool calls from content string if a model emitted JSON directly.
 */
export function parseToolCallsFromContent(
  content: string,
  declaredTools: OllamaToolDefinition[],
): OllamaToolCall[] {
  const toolCalls: OllamaToolCall[] = []
  if (!content || !content.trim()) return toolCalls

  const candidates = extractJsonObjects(content)

  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue
    let toolName = ''
    let toolArgs: any = {}

    if (typeof item.name === 'string') {
      toolName = item.name
      toolArgs = item.arguments || {}
    } else if (item.function && typeof item.function.name === 'string') {
      toolName = item.function.name
      toolArgs = item.function.arguments || {}
    }

    if (!toolName) continue

    if (typeof toolArgs === 'string') {
      try {
        toolArgs = JSON.parse(toolArgs)
      } catch {}
    }

    const matchedTool = findDeclaredTool(toolName, declaredTools)
    if (matchedTool) {
      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        function: {
          name: matchedTool.function.name,
          arguments: typeof toolArgs === 'object' && toolArgs !== null ? toolArgs : {},
        },
      })
    }
  }
  return toolCalls
}

/**
 * Stream chat completion from local Ollama with native tool calling support.
 * Supports both object options and legacy positional callback signatures.
 */
export async function streamOllamaChat(
  optsOrModel: StreamOllamaChatOptions | string,
  legacyMessagesOrChunk?: OllamaChatMessage[] | ((chunk: string) => void),
  legacyOnChunkOrSignal?: ((chunk: string) => void) | AbortSignal,
  legacySignalArg?: AbortSignal,
): Promise<StreamOllamaChatResult> {
  let baseUrl = OLLAMA_BASE_URL
  let model = ''
  let onChunk: (chunk: string) => void = () => {}
  let onDone: ((fullText: string, toolCalls: OllamaToolCall[]) => void) | undefined
  let onToolCalls: ((calls: OllamaToolCall[]) => void) | undefined
  let onError: ((err: Error) => void) | undefined
  let signal: AbortSignal | undefined
  let messages: OllamaChatMessage[] = []
  let tools: OllamaToolDefinition[] | undefined

  if (typeof optsOrModel === 'string') {
    // Positional signature: streamOllamaChat(model, messages, onChunk, signal)
    model = optsOrModel
    if (Array.isArray(legacyMessagesOrChunk)) {
      messages = [...legacyMessagesOrChunk]
      if (typeof legacyOnChunkOrSignal === 'function') {
        onChunk = legacyOnChunkOrSignal
        signal = legacySignalArg instanceof AbortSignal ? legacySignalArg : undefined
      } else if (legacyOnChunkOrSignal instanceof AbortSignal) {
        signal = legacyOnChunkOrSignal
      }
    } else if (typeof legacyMessagesOrChunk === 'function') {
      onChunk = legacyMessagesOrChunk
      if (legacyOnChunkOrSignal instanceof AbortSignal) {
        signal = legacyOnChunkOrSignal
      }
    }
  } else {
    // Object signature: streamOllamaChat({ model, messages, ... })
    const opts = optsOrModel
    baseUrl = opts.baseUrl || getEffectiveOllamaBaseUrl()
    model = opts.model
    messages = opts.messages ? [...opts.messages] : []
    if (messages.length === 0 && opts.prompt) {
      if (opts.system) {
        messages.push({ role: 'system', content: opts.system })
      }
      messages.push({ role: 'user', content: opts.prompt })
    }
    tools = opts.tools
    onChunk = opts.onChunk || (typeof legacyMessagesOrChunk === 'function' ? legacyMessagesOrChunk : () => {})
    onDone = opts.onDone
    onToolCalls = opts.onToolCalls
    onError = opts.onError
    signal =
      opts.signal instanceof AbortSignal
        ? opts.signal
        : legacyOnChunkOrSignal instanceof AbortSignal
        ? legacyOnChunkOrSignal
        : undefined
  }

  const payload: Record<string, any> = {
    model,
    messages,
    stream: true,
  }

  if (tools && tools.length > 0) {
    payload.tools = tools
  }

  let accumulated = ''
  const toolCalls: OllamaToolCall[] = []

  try {
    const fetchInit: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
    if (signal instanceof AbortSignal) {
      fetchInit.signal = signal
    }

    const res = await fetch(`${baseUrl}/api/chat`, fetchInit)

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      throw new Error(`Ollama error (${res.status}): ${errText}`)
    }

    if (!res.body) {
      throw new Error('ReadableStream not supported by response')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    const processJsonLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const parsed = JSON.parse(trimmed) as {
          message?: {
            content?: string
            tool_calls?: Array<{
              id?: string
              function?: { name?: string; arguments?: any }
            }>
          }
          done?: boolean
        }

        const content = parsed.message?.content ?? ''
        if (content) {
          accumulated += content
          onChunk(content)
        }

        const rawToolCalls = parsed.message?.tool_calls
        if (Array.isArray(rawToolCalls)) {
          for (const tc of rawToolCalls) {
            if (tc?.function?.name) {
              let args = tc.function.arguments || {}
              if (typeof args === 'string') {
                try {
                  args = JSON.parse(args)
                } catch {}
              }
              toolCalls.push({
                id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                function: {
                  name: tc.function.name,
                  arguments: args,
                },
              })
            }
          }
        }
      } catch {
        // ignore chunk parse errors
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        processJsonLine(line)
      }
    }

    if (buffer.trim()) {
      processJsonLine(buffer)
    }

    // Check if model emitted JSON tool call in content
    if (toolCalls.length === 0 && tools && tools.length > 0 && accumulated.trim()) {
      const extracted = parseToolCallsFromContent(accumulated, tools)
      if (extracted.length > 0) {
        toolCalls.push(...extracted)
      }
    }

    if (toolCalls.length > 0) {
      onToolCalls?.(toolCalls)
    }

    onDone?.(accumulated, toolCalls)
    return { content: accumulated, toolCalls }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      onDone?.(accumulated, toolCalls)
      return { content: accumulated, toolCalls }
    }
    onError?.(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}

let cachedStatus: {
  online: boolean
  models: string[]
  modelDetails?: OllamaModelInfo[]
} = { online: false, models: [] }
let statusListeners: Array<() => void> = []

function notifyStatusListeners() {
  for (const listener of statusListeners) {
    listener()
  }
}

/**
 * React hook to observe Ollama daemon state and current selected model.
 */
export function useOllama() {
  const [status, setStatus] = useState(cachedStatus)
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    try {
      return localStorage.getItem('foqz_ollama_model') || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    const handler = () => setStatus({ ...cachedStatus })
    statusListeners.push(handler)
    return () => {
      statusListeners = statusListeners.filter((l) => l !== handler)
    }
  }, [])

  const refresh = useCallback(async () => {
    const res = await getOllamaStatus()
    cachedStatus = res
    notifyStatusListeners()
    try {
      const stored = localStorage.getItem('foqz_ollama_model')
      if (!stored && res.models.length > 0) {
        const def = pickDefaultOllamaModel(res.models)
        setSelectedModelState(def)
        localStorage.setItem('foqz_ollama_model', def)
      }
    } catch {
      // ignore storage access errors
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 8000)
    return () => clearInterval(timer)
  }, [refresh])

  const setSelectedModel = useCallback((model: string) => {
    setSelectedModelState(model)
    try {
      localStorage.setItem('foqz_ollama_model', model)
    } catch {
      // ignore
    }
  }, [])

  const effectiveModel = selectedModel || pickDefaultOllamaModel(status.models)

  return {
    online: status.online,
    models: status.models,
    modelDetails: status.modelDetails,
    selectedModel: effectiveModel,
    setSelectedModel,
    refresh,
  }
}

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

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

/**
 * Check if local Ollama daemon is reachable and return available models and capabilities.
 */
export async function getOllamaStatus(baseUrl: string = OLLAMA_BASE_URL): Promise<{
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
 * Resiliently parses a tool call from content string if a model emitted JSON directly.
 */
function tryParseToolCallFromContent(
  content: string,
  declaredTools: OllamaToolDefinition[],
): OllamaToolCall | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  try {
    const parsed = JSON.parse(trimmed)
    // Format A: { "name": "...", "arguments": { ... } }
    if (typeof parsed.name === 'string') {
      const toolMatch = declaredTools.find((t) => t.function.name === parsed.name)
      if (toolMatch) {
        return {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          function: {
            name: parsed.name,
            arguments:
              typeof parsed.arguments === 'object' && parsed.arguments !== null
                ? parsed.arguments
                : {},
          },
        }
      }
    }
    // Format B: { "type": "function", "function": { "name": "...", "arguments": { ... } } }
    if (parsed.function && typeof parsed.function.name === 'string') {
      const name = parsed.function.name
      const toolMatch = declaredTools.find((t) => t.function.name === name)
      if (toolMatch) {
        let args = parsed.function.arguments || {}
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {}
        }
        return {
          id: parsed.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          function: { name, arguments: args },
        }
      }
    }
  } catch {
    // ignore parse failure
  }
  return null
}

/**
 * Stream chat completion from local Ollama with native tool calling support.
 * Supports both object options and legacy positional callback signatures.
 */
export async function streamOllamaChat(
  opts: StreamOllamaChatOptions,
  legacyOnChunk?: (chunk: string) => void,
  legacySignal?: AbortSignal,
): Promise<StreamOllamaChatResult> {
  const baseUrl = opts.baseUrl || OLLAMA_BASE_URL
  const model = opts.model
  const onChunk = opts.onChunk || legacyOnChunk || (() => {})
  const onDone = opts.onDone
  const onToolCalls = opts.onToolCalls
  const onError = opts.onError
  const signal = opts.signal || legacySignal

  // Build messages array
  const messages: OllamaChatMessage[] = opts.messages ? [...opts.messages] : []
  if (messages.length === 0 && opts.prompt) {
    if (opts.system) {
      messages.push({ role: 'system', content: opts.system })
    }
    messages.push({ role: 'user', content: opts.prompt })
  }

  const payload: Record<string, any> = {
    model,
    messages,
    stream: true,
  }

  if (opts.tools && opts.tools.length > 0) {
    payload.tools = opts.tools
  }

  let accumulated = ''
  const toolCalls: OllamaToolCall[] = []

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })

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
    if (toolCalls.length === 0 && opts.tools && opts.tools.length > 0 && accumulated.trim()) {
      const extracted = tryParseToolCallFromContent(accumulated, opts.tools)
      if (extracted) {
        toolCalls.push(extracted)
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

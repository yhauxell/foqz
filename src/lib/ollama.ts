import { useState, useEffect, useCallback } from 'react'

export interface OllamaModelInfo {
  name: string
  model: string
  size: number
  parameterSize?: string
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

/**
 * Check if local Ollama daemon is reachable and return available models.
 */
export async function getOllamaStatus(baseUrl: string = OLLAMA_BASE_URL): Promise<{
  online: boolean
  models: string[]
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
    const data = (await res.json()) as { models?: Array<{ name: string }> }
    const models = (data.models ?? []).map((m) => m.name)
    return { online: true, models }
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

export interface StreamOllamaChatOptions {
  baseUrl?: string
  model: string
  messages?: OllamaChatMessage[]
  prompt?: string
  system?: string
  onChunk?: (chunk: string) => void
  onDone?: (fullText: string) => void
  onError?: (err: Error) => void
  signal?: AbortSignal
}

/**
 * Stream chat completion from local Ollama.
 * Supports both object options and legacy positional callback signatures.
 */
export async function streamOllamaChat(
  opts: StreamOllamaChatOptions,
  legacyOnChunk?: (chunk: string) => void,
  legacySignal?: AbortSignal,
): Promise<string> {
  const baseUrl = opts.baseUrl || OLLAMA_BASE_URL
  const model = opts.model
  const onChunk = opts.onChunk || legacyOnChunk || (() => {})
  const onDone = opts.onDone
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

  let accumulated = ''
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
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

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content?: string }
            done?: boolean
          }
          const content = parsed.message?.content ?? ''
          if (content) {
            accumulated += content
            onChunk(content)
          }
          if (parsed.done) {
            onDone?.(accumulated)
            return accumulated
          }
        } catch {
          // ignore chunk parse errors
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as {
          message?: { content?: string }
          done?: boolean
        }
        const content = parsed.message?.content ?? ''
        if (content) {
          accumulated += content
          onChunk(content)
        }
      } catch {
        // ignore
      }
    }

    onDone?.(accumulated)
    return accumulated
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      onDone?.(accumulated)
      return accumulated
    }
    onError?.(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}

let cachedStatus: { online: boolean; models: string[] } = { online: false, models: [] }
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
    selectedModel: effectiveModel,
    setSelectedModel,
    refresh,
  }
}

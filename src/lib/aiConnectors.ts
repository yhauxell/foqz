import { getOllamaStatus } from './ollama'
import { evaluateJev } from './jev'

export interface ConnectorTestResult {
  ok: boolean
  message: string
  details?: Record<string, any>
}

export const OPENAI_DEFAULT_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'o3-mini',
  'o1-mini',
]

export const GEMINI_DEFAULT_MODELS = [
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.0-pro',
]

/**
 * Test connectivity and API key validity against OpenAI API or compatible endpoint.
 */
export async function testOpenAiConnection(
  apiKey: string,
  baseUrl: string = 'https://api.openai.com/v1',
): Promise<ConnectorTestResult> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'API key is required.' }
  }

  const cleanUrl = baseUrl.trim().replace(/\/+$/, '')
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)

    const res = await fetch(`${cleanUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      let message = errorText
      try {
        const parsed = JSON.parse(errorText)
        if (parsed?.error?.message) message = parsed.error.message
        else if (parsed?.message) message = parsed.message
      } catch {}
      return { ok: false, message: `OpenAI error (${res.status}): ${message || res.statusText}` }
    }

    const data = await res.json()
    const count = Array.isArray(data?.data) ? data.data.length : undefined
    return {
      ok: true,
      message: `Connected successfully! (${count ? `${count} models available` : 'Valid API credentials'})`,
      details: { modelsCount: count },
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, message: 'Connection timed out (6s). Check your Base URL and internet.' }
    }
    return { ok: false, message: err.message || 'Connection failed' }
  }
}

/**
 * Test connectivity and API key validity against Google Gemini API.
 */
export async function testGeminiConnection(
  apiKey: string,
): Promise<ConnectorTestResult> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'API key is required.' }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'GET',
        signal: controller.signal,
      },
    )
    clearTimeout(timer)

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      let message = errorText
      try {
        const parsed = JSON.parse(errorText)
        if (parsed?.error?.message) message = parsed.error.message
      } catch {}
      return { ok: false, message: `Gemini error (${res.status}): ${message || res.statusText}` }
    }

    const data = await res.json()
    const models = Array.isArray(data?.models) ? data.models : []
    return {
      ok: true,
      message: `Connected successfully! (${models.length > 0 ? `${models.length} models available` : 'Valid API key'})`,
      details: { modelsCount: models.length },
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, message: 'Connection timed out (6s). Check your internet connection.' }
    }
    return { ok: false, message: err.message || 'Connection failed' }
  }
}

/**
 * Test connectivity to local Ollama server.
 */
export async function testOllamaConnection(
  baseUrl: string = 'http://127.0.0.1:11434',
): Promise<ConnectorTestResult> {
  try {
    const status = await getOllamaStatus(baseUrl)
    if (status.online) {
      return {
        ok: true,
        message: `Online! Found ${status.models.length} model(s): ${status.models.slice(0, 3).join(', ')}${status.models.length > 3 ? '...' : ''}`,
        details: { models: status.models },
      }
    }
    return {
      ok: false,
      message: 'Ollama is offline. Start the daemon with `ollama serve` in your terminal.',
    }
  } catch (err: any) {
    return { ok: false, message: err.message || 'Connection failed' }
  }
}

/**
 * Test TypeSafe System One (Jev).
 */
export async function testJevConnection(
  apiKey: string,
  baseUrl: string = 'https://api.typesafe.ai',
): Promise<ConnectorTestResult> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'TypeSafe API key is required.' }
  }

  try {
    const res = await evaluateJev(
      {
        state: 'Foqz System One sanity check',
        questions: {
          ping: {
            type: 'noul',
            instructions: 'Is the TypeSafe connection active?',
          },
        },
      },
      { apiKey: apiKey.trim(), baseUrl: baseUrl.trim() },
    )
    if (res?.model) {
      return { ok: true, message: `Connected successfully! Model: ${res.model}` }
    }
    return { ok: true, message: 'Connection succeeded.' }
  } catch (err: any) {
    return { ok: false, message: `Connection failed: ${err.message || String(err)}` }
  }
}

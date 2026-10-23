import { getOllamaStatus } from './ollama'

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

/**
 * v0.14 settings migration for the main process. Mirrors `migrateLegacyAiSettings` in
 * src/lib/appSettings.ts; kept free of Electron imports so it can be tested with plain Node.
 */

/** Google's OpenAI-compatible endpoint; Gemini settings migrate onto the OpenAI-compatible provider. */
const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
/** Settings keys removed in v0.14 (Gemini provider, TypeSafe/Jev, image generation, agent profiles). */
const REMOVED_SETTINGS_KEYS = [
  'typesafeEnabled',
  'typesafeApiKey',
  'typesafeBaseUrl',
  'geminiEnabled',
  'geminiApiKey',
  'geminiDefaultModel',
  'imageProvider',
  'imageModel',
  'agentProfiles',
  'customSkills',
  'activeAgentProfileId',
]

/** v0.14: move a configured Gemini provider onto the OpenAI-compatible provider. */
function migrateGeminiSettings(parsed) {
  const key = typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : ''
  const geminiActive = parsed.activeAiProvider === 'gemini'
  const openaiKey = typeof parsed.openaiApiKey === 'string' ? parsed.openaiApiKey.trim() : ''
  if (!key || (!geminiActive && openaiKey)) {
    return geminiActive ? { ...parsed, activeAiProvider: undefined } : parsed
  }
  const model = typeof parsed.geminiDefaultModel === 'string' ? parsed.geminiDefaultModel.trim() : ''
  return {
    ...parsed,
    openaiEnabled: true,
    openaiApiKey: key,
    openaiBaseUrl: GEMINI_OPENAI_BASE_URL,
    openaiDefaultModel: !model || model.startsWith('gemini-1.') ? 'gemini-2.5-flash' : model,
    activeAiProvider: geminiActive ? 'openai' : parsed.activeAiProvider,
  }
}

module.exports = { GEMINI_OPENAI_BASE_URL, REMOVED_SETTINGS_KEYS, migrateGeminiSettings }

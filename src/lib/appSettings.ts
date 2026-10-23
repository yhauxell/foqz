/** Persisted app preferences (mirrors `app-settings.json` in Electron userData). */

export type AppWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkingHoursRange = {
  /** Minutes since local midnight, 0..1440 */
  startMin: number;
  /** Minutes since local midnight, 0..1440 */
  endMin: number;
};

export type AppSettings = {
  defaultFocusMinutes: number;
  durationPresets: number[];
  alwaysOnTop: boolean;
  pinWindow: boolean;
  rememberWindowBounds: boolean;
  windowBounds: AppWindowBounds | null;
  openAtLogin: boolean;
  /** macOS: show the app in the Dock; when false, tray-only (default). */
  showDockIcon: boolean;
  globalToggleShortcut: string;
  notifyOnTimerEnd: boolean;
  playSoundOnTimerEnd: boolean;
  colorScheme: "light" | "dark" | "system";
  workingHours: WorkingHoursRange;
  ollamaEnabled?: boolean;
  ollamaBaseUrl?: string;
  ollamaDefaultModel?: string;
  openaiEnabled?: boolean;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiDefaultModel?: string;
  githubToken?: string;
  activeAiProvider?: "ollama" | "openai";
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultFocusMinutes: 25,
  durationPresets: [15, 25, 50],
  alwaysOnTop: true,
  pinWindow: false,
  rememberWindowBounds: true,
  windowBounds: null,
  openAtLogin: false,
  showDockIcon: false,
  globalToggleShortcut: "CommandOrControl+Shift+F",
  notifyOnTimerEnd: true,
  playSoundOnTimerEnd: false,
  colorScheme: "light",
  // 9am..5pm
  workingHours: { startMin: 9 * 60, endMin: 17 * 60 },
  ollamaEnabled: true,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaDefaultModel: "",
  openaiEnabled: false,
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiDefaultModel: "gpt-4o-mini",
  githubToken: "",
};

function isValidBounds(b: unknown): b is AppWindowBounds {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    typeof o.width === "number" &&
    typeof o.height === "number" &&
    o.width >= 200 &&
    o.height >= 200
  );
}

function normalizePresets(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_APP_SETTINGS.durationPresets];
  }
  const nums = raw
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 480);
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  return uniq.length ? uniq : [...DEFAULT_APP_SETTINGS.durationPresets];
}

function clampMinOfDay(n: unknown, fallback: number): number {
  const v =
    typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(24 * 60, Math.max(0, v));
}

function normalizeWorkingHours(raw: unknown): WorkingHoursRange {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_APP_SETTINGS.workingHours };
  const o = raw as Record<string, unknown>;
  const startMin = clampMinOfDay(o.startMin, DEFAULT_APP_SETTINGS.workingHours.startMin);
  const endMin = clampMinOfDay(o.endMin, DEFAULT_APP_SETTINGS.workingHours.endMin);
  // Allow overnight spans; but avoid degenerate 0-length windows.
  if (startMin === endMin) return { ...DEFAULT_APP_SETTINGS.workingHours };
  return { startMin, endMin };
}

/** Google's OpenAI-compatible endpoint; Gemini settings migrate onto the OpenAI-compatible provider. */
export const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/** Settings keys removed in v0.14 (Gemini provider, TypeSafe/Jev, image generation, agent profiles). */
const REMOVED_SETTINGS_KEYS = [
  "typesafeEnabled",
  "typesafeApiKey",
  "typesafeBaseUrl",
  "geminiEnabled",
  "geminiApiKey",
  "geminiDefaultModel",
  "imageProvider",
  "imageModel",
  "agentProfiles",
  "customSkills",
  "activeAgentProfileId",
] as const;

/**
 * v0.14: a configured Gemini provider becomes the OpenAI-compatible provider pointed at
 * Google's OpenAI endpoint, so nobody loses a working setup. Mirrored in electron/main.cjs.
 */
export function migrateLegacyAiSettings(raw: Record<string, any>): Record<string, any> {
  const key = typeof raw.geminiApiKey === "string" ? raw.geminiApiKey.trim() : "";
  const geminiActive = raw.activeAiProvider === "gemini";
  const openaiKey = typeof raw.openaiApiKey === "string" ? raw.openaiApiKey.trim() : "";
  if (!key || (!geminiActive && openaiKey)) {
    return geminiActive ? { ...raw, activeAiProvider: undefined } : raw;
  }
  const model = typeof raw.geminiDefaultModel === "string" ? raw.geminiDefaultModel.trim() : "";
  return {
    ...raw,
    openaiEnabled: true,
    openaiApiKey: key,
    openaiBaseUrl: GEMINI_OPENAI_BASE_URL,
    openaiDefaultModel: !model || model.startsWith("gemini-1.") ? "gemini-2.5-flash" : model,
    activeAiProvider: geminiActive ? "openai" : raw.activeAiProvider,
  };
}

export function mergeAppSettings(
  input: Partial<AppSettings> | null | undefined,
): AppSettings {
  const base = { ...DEFAULT_APP_SETTINGS };
  if (!input || typeof input !== "object") return base;
  const parsed = migrateLegacyAiSettings(input as Record<string, any>) as Partial<AppSettings>;

  const durationPresets = normalizePresets(parsed.durationPresets);
  let defaultFocusMinutes =
    typeof parsed.defaultFocusMinutes === "number" &&
    Number.isFinite(parsed.defaultFocusMinutes)
      ? Math.round(parsed.defaultFocusMinutes)
      : base.defaultFocusMinutes;
  defaultFocusMinutes = Math.min(480, Math.max(1, defaultFocusMinutes));
  if (!durationPresets.includes(defaultFocusMinutes)) {
    defaultFocusMinutes =
      durationPresets.reduce((prev, cur) =>
        Math.abs(cur - defaultFocusMinutes) < Math.abs(prev - defaultFocusMinutes)
          ? cur
          : prev,
      ) ?? durationPresets[0]!;
  }

  const globalToggleShortcut =
    typeof parsed.globalToggleShortcut === "string" &&
    parsed.globalToggleShortcut.trim()
      ? parsed.globalToggleShortcut.trim()
      : base.globalToggleShortcut;

  const colorScheme =
    parsed.colorScheme === "light" ||
    parsed.colorScheme === "dark" ||
    parsed.colorScheme === "system"
      ? parsed.colorScheme
      : base.colorScheme;

  const merged: AppSettings = {
    ...base,
    ...parsed,
    defaultFocusMinutes,
    durationPresets,
    alwaysOnTop:
      typeof parsed.alwaysOnTop === "boolean"
        ? parsed.alwaysOnTop
        : base.alwaysOnTop,
    pinWindow:
      typeof parsed.pinWindow === "boolean" ? parsed.pinWindow : base.pinWindow,
    rememberWindowBounds:
      typeof parsed.rememberWindowBounds === "boolean"
        ? parsed.rememberWindowBounds
        : base.rememberWindowBounds,
    windowBounds: isValidBounds(parsed.windowBounds)
      ? parsed.windowBounds
      : null,
    openAtLogin:
      typeof parsed.openAtLogin === "boolean"
        ? parsed.openAtLogin
        : base.openAtLogin,
    showDockIcon:
      typeof parsed.showDockIcon === "boolean"
        ? parsed.showDockIcon
        : base.showDockIcon,
    globalToggleShortcut,
    notifyOnTimerEnd:
      typeof parsed.notifyOnTimerEnd === "boolean"
        ? parsed.notifyOnTimerEnd
        : base.notifyOnTimerEnd,
    playSoundOnTimerEnd:
      typeof parsed.playSoundOnTimerEnd === "boolean"
        ? parsed.playSoundOnTimerEnd
        : base.playSoundOnTimerEnd,
    colorScheme,
    workingHours: normalizeWorkingHours(parsed.workingHours),
    ollamaEnabled:
      typeof parsed.ollamaEnabled === "boolean"
        ? parsed.ollamaEnabled
        : base.ollamaEnabled,
    ollamaBaseUrl:
      typeof parsed.ollamaBaseUrl === "string" && parsed.ollamaBaseUrl.trim()
        ? parsed.ollamaBaseUrl.trim().replace(/\/+$/, "")
        : base.ollamaBaseUrl,
    ollamaDefaultModel:
      typeof parsed.ollamaDefaultModel === "string"
        ? parsed.ollamaDefaultModel.trim()
        : base.ollamaDefaultModel,
    openaiEnabled:
      typeof parsed.openaiEnabled === "boolean"
        ? parsed.openaiEnabled
        : base.openaiEnabled,
    openaiApiKey:
      typeof parsed.openaiApiKey === "string"
        ? parsed.openaiApiKey.trim()
        : base.openaiApiKey,
    openaiBaseUrl:
      typeof parsed.openaiBaseUrl === "string" && parsed.openaiBaseUrl.trim()
        ? parsed.openaiBaseUrl.trim().replace(/\/+$/, "")
        : base.openaiBaseUrl,
    openaiDefaultModel:
      typeof parsed.openaiDefaultModel === "string"
        ? parsed.openaiDefaultModel.trim()
        : base.openaiDefaultModel,
    githubToken:
      typeof parsed.githubToken === "string"
        ? parsed.githubToken.trim()
        : base.githubToken,
    activeAiProvider:
      parsed.activeAiProvider === "openai" || parsed.activeAiProvider === "ollama"
        ? parsed.activeAiProvider
        : base.activeAiProvider,
  };
  for (const key of REMOVED_SETTINGS_KEYS) delete (merged as Record<string, unknown>)[key];
  return merged;
}

export interface ActiveAiConfig {
  provider: "ollama" | "openai";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  isConfigured: boolean;
}

/**
 * Resolves the effective active AI provider, model, and credentials.
 * Automatically chooses the best enabled provider if user selection is not set or disabled.
 */
export function resolveActiveAiConfig(
  settings: Partial<AppSettings> | null | undefined,
): ActiveAiConfig {
  const merged = mergeAppSettings(settings);

  // If user explicitly chose a provider:
  if (merged.activeAiProvider === "openai") {
    return {
      provider: "openai",
      model: merged.openaiDefaultModel || "gpt-4o-mini",
      apiKey: merged.openaiApiKey || "",
      baseUrl: merged.openaiBaseUrl || "https://api.openai.com/v1",
      isConfigured: Boolean(merged.openaiApiKey?.trim()),
    };
  }

  if (merged.activeAiProvider === "ollama") {
    return {
      provider: "ollama",
      model: merged.ollamaDefaultModel || "",
      baseUrl: merged.ollamaBaseUrl || "http://127.0.0.1:11434",
      isConfigured: Boolean(merged.ollamaEnabled !== false),
    };
  }

  // Fallback / Auto-detection:
  if (merged.openaiEnabled && merged.openaiApiKey?.trim()) {
    return {
      provider: "openai",
      model: merged.openaiDefaultModel || "gpt-4o-mini",
      apiKey: merged.openaiApiKey,
      baseUrl: merged.openaiBaseUrl || "https://api.openai.com/v1",
      isConfigured: true,
    };
  }

  return {
    provider: "ollama",
    model: merged.ollamaDefaultModel || "",
    baseUrl: merged.ollamaBaseUrl || "http://127.0.0.1:11434",
    isConfigured: Boolean(merged.ollamaEnabled !== false),
  };
}


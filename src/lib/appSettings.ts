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
  /** Global quick capture: summons the command bar ready to write. Empty turns it off. */
  globalCaptureShortcut: string;
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
  /** Run the local Claude Code CLI as the canvas AI (it reaches the canvas through the Foqz MCP host). */
  claudeCodeEnabled?: boolean;
  /** Path to the `claude` binary; empty finds it on PATH and the usual install folders. */
  claudeCodePath?: string;
  /** Folder Claude Code runs in when the item has no folder of its own; empty uses an empty folder Foqz owns. */
  claudeCodeCwd?: string;
  /** Model alias or name passed to `--model`; empty uses Claude Code's default. */
  claudeCodeModel?: string;
  /** What Claude Code may do in each folder; folders not listed are canvas-only. */
  claudeCodeFolders?: ClaudeCodeFolder[];
  /** Claude Code runs allowed at once (one per item). */
  claudeCodeMaxRuns?: number;
  /** A run still going after this many minutes is stopped. */
  claudeCodeTimeoutMinutes?: number;
  activeAiProvider?: AiProviderId;
};

/**
 * - `canvas`: canvas tools only, no files.
 * - `read`: read and search files in the folder, plus canvas tools.
 * - `workspace`: also edit files and run the allowlisted shell commands.
 */
export type ClaudeCodeProfile = "canvas" | "read" | "workspace";
export const CLAUDE_CODE_PROFILES: ClaudeCodeProfile[] = ["canvas", "read", "workspace"];

export interface ClaudeCodeFolder {
  path: string;
  profile: ClaudeCodeProfile;
  /** Command prefixes such as `npm test`; only used by the workspace profile. */
  bashAllowlist: string[];
}

export type AiProviderId = "ollama" | "openai" | "claude-code";
const AI_PROVIDER_IDS: AiProviderId[] = ["ollama", "openai", "claude-code"];

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
  globalCaptureShortcut: "CommandOrControl+Shift+Space",
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
  claudeCodeEnabled: false,
  claudeCodePath: "",
  claudeCodeCwd: "",
  claudeCodeModel: "",
  claudeCodeFolders: [],
  claudeCodeMaxRuns: 3,
  claudeCodeTimeoutMinutes: 15,
};

/** Mirrors normalizeBashAllowlist in electron/claudeCode.cjs. */
export function normalizeBashAllowlist(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const cmd = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (!cmd || /[(),:*]/.test(cmd) || out.includes(cmd)) continue;
    out.push(cmd);
  }
  return out;
}

/** Trimmed, without a trailing slash; main resolves `~` and relative paths (electron/claudeCode.cjs). */
export function normalizeFolderPathInput(p: unknown): string {
  const trimmed = typeof p === "string" ? p.trim() : "";
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

function normalizeClaudeCodeFolders(list: unknown): ClaudeCodeFolder[] {
  if (!Array.isArray(list)) return [];
  const out: ClaudeCodeFolder[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const path = normalizeFolderPathInput(r.path);
    if (!path || out.some((f) => f.path === path)) continue;
    out.push({
      path,
      profile: CLAUDE_CODE_PROFILES.includes(r.profile as ClaudeCodeProfile) ? (r.profile as ClaudeCodeProfile) : "canvas",
      bashAllowlist: normalizeBashAllowlist(r.bashAllowlist),
    });
  }
  return out;
}

function clampSetting(value: unknown, min: number, max: number, fallback: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

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

  const globalCaptureShortcut =
    typeof parsed.globalCaptureShortcut === "string"
      ? parsed.globalCaptureShortcut.trim()
      : base.globalCaptureShortcut;

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
    globalCaptureShortcut,
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
    claudeCodeEnabled:
      typeof parsed.claudeCodeEnabled === "boolean"
        ? parsed.claudeCodeEnabled
        : base.claudeCodeEnabled,
    claudeCodePath:
      typeof parsed.claudeCodePath === "string" ? parsed.claudeCodePath.trim() : base.claudeCodePath,
    claudeCodeCwd:
      typeof parsed.claudeCodeCwd === "string" ? parsed.claudeCodeCwd.trim() : base.claudeCodeCwd,
    claudeCodeModel:
      typeof parsed.claudeCodeModel === "string" ? parsed.claudeCodeModel.trim() : base.claudeCodeModel,
    claudeCodeFolders: Array.isArray(parsed.claudeCodeFolders)
      ? normalizeClaudeCodeFolders(parsed.claudeCodeFolders)
      : base.claudeCodeFolders,
    claudeCodeMaxRuns: clampSetting(parsed.claudeCodeMaxRuns, 1, 10, base.claudeCodeMaxRuns),
    claudeCodeTimeoutMinutes: clampSetting(parsed.claudeCodeTimeoutMinutes, 1, 240, base.claudeCodeTimeoutMinutes),
    activeAiProvider: AI_PROVIDER_IDS.includes(parsed.activeAiProvider as AiProviderId)
      ? (parsed.activeAiProvider as AiProviderId)
      : base.activeAiProvider,
  };
  for (const key of REMOVED_SETTINGS_KEYS) delete (merged as Record<string, unknown>)[key];
  return merged;
}

export interface ActiveAiConfig {
  provider: AiProviderId;
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
  if (merged.activeAiProvider === "claude-code") {
    return {
      provider: "claude-code",
      model: merged.claudeCodeModel || "",
      isConfigured: merged.claudeCodeEnabled === true,
    };
  }

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


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFocusAppSettings } from "@/context/FocusAppSettingsContext";
import { mergeAppSettings } from "@/lib/appSettings";
import { ensureNotificationPermission } from "@/lib/focusSessionFeedback";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import { McpSettingsTab } from "@/components/McpSettingsTab";
import {
  OPENAI_DEFAULT_MODELS,
  GEMINI_DEFAULT_MODELS,
  testOllamaConnection,
  testOpenAiConnection,
  testGeminiConnection,
  testJevConnection,
} from "@/lib/aiConnectors";
import { useCallback, useEffect, useState } from "react";
import type { TLShapeId } from "tldraw";
import { getSnapshot, loadSnapshot, useEditor, useValue } from "tldraw";

function AiConnectorCard({
  icon: Icon,
  title,
  badge,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        enabled
          ? "border-border/90 bg-card/60 shadow-xs"
          : "border-border/50 bg-muted/20 opacity-85"
      }`}
    >
      <div className="flex items-center justify-between p-4 bg-muted/10 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2 rounded-xl shrink-0 ${
              enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">{title}</span>
              {badge && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-3">
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
            {enabled ? "Active" : "Disabled"}
          </span>
          <Toggle checked={enabled} onCheckedChange={onToggle} />
        </div>
      </div>
      {enabled ? (
        <div className="p-4 space-y-3.5 bg-background/50">{children}</div>
      ) : (
        <div className="px-4 py-3 text-xs text-muted-foreground italic bg-muted/5">
          Connector disabled. Toggle switch to enable and configure.
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-5">
      <div className="min-w-0 sm:max-w-[min(100%,260px)] sm:shrink-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-stretch sm:items-end">
        {children}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="size-4 shrink-0 rounded border-border accent-primary disabled:opacity-50"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  );
}

/** Aligns checkbox to the end of the row on wide layouts. */
function ToggleRowControl(
  props: Parameters<typeof Toggle>[0],
) {
  return (
    <div className="flex w-full justify-end sm:pt-0.5">
      <Toggle {...props} />
    </div>
  );
}

export function FocusColorSchemeSync() {
  const editor = useEditor();
  const { settings } = useFocusAppSettings();
  const isDark = useValue("isDark", () => editor.user.getIsDarkMode(), [editor]);

  useEffect(() => {
    editor.user.updateUserPreferences({ colorScheme: settings.colorScheme });
  }, [editor, settings.colorScheme]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark", isDark);
  }, [isDark]);

  return null;
}

function parsePresetsText(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 480);
}

type SettingsTab = "general" | "workingHours" | "ai" | "mcp" | "data";

function formatTime(min: number): string {
  const m = Math.min(24 * 60, Math.max(0, Math.round(min)));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseTimeToMinutes(v: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 24) return null;
  if (mm < 0 || mm > 59) return null;
  if (hh === 24 && mm !== 0) return null;
  return hh * 60 + mm;
}

export function FocusSettings({
  open,
  onClose,
  initialTab = "general",
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}) {
  const editor = useEditor();
  const { settings, update } = useFocusAppSettings();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [shortcutDraft, setShortcutDraft] = useState(settings.globalToggleShortcut);
  const [presetsDraft, setPresetsDraft] = useState(() =>
    settings.durationPresets.join(", "),
  );
  const [workingStart, setWorkingStart] = useState(
    formatTime(settings.workingHours.startMin),
  );
  const [workingEnd, setWorkingEnd] = useState(formatTime(settings.workingHours.endMin));
  // Ollama
  const [ollamaEnabled, setOllamaEnabled] = useState(settings.ollamaEnabled ?? true);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(settings.ollamaBaseUrl || "http://127.0.0.1:11434");
  const [ollamaModelDraft, setOllamaModelDraft] = useState(settings.ollamaDefaultModel || "");
  const [testingOllama, setTestingOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);

  // OpenAI
  const [openaiEnabled, setOpenaiEnabled] = useState(settings.openaiEnabled ?? false);
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState(settings.openaiApiKey || "");
  const [openaiUrlDraft, setOpenaiUrlDraft] = useState(settings.openaiBaseUrl || "https://api.openai.com/v1");
  const [openaiModelDraft, setOpenaiModelDraft] = useState(settings.openaiDefaultModel || "gpt-4o-mini");
  const [testingOpenai, setTestingOpenai] = useState(false);
  const [openaiStatus, setOpenaiStatus] = useState<string | null>(null);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Gemini
  const [geminiEnabled, setGeminiEnabled] = useState(settings.geminiEnabled ?? false);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(settings.geminiApiKey || "");
  const [geminiModelDraft, setGeminiModelDraft] = useState(settings.geminiDefaultModel || "gemini-1.5-flash");
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<string | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // TypeSafe (Jev)
  const [typesafeEnabled, setTypesafeEnabled] = useState(settings.typesafeEnabled ?? true);
  const [typesafeKeyDraft, setTypesafeKeyDraft] = useState(settings.typesafeApiKey || "");
  const [typesafeUrlDraft, setTypesafeUrlDraft] = useState(settings.typesafeBaseUrl || "https://api.typesafe.ai");
  const [testingJev, setTestingJev] = useState(false);
  const [jevStatus, setJevStatus] = useState<string | null>(null);
  const [showTypesafeKey, setShowTypesafeKey] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isElectron = typeof window.focusStore?.getSettings === "function";

  useEffect(() => {
    setShortcutDraft(settings.globalToggleShortcut);
    setPresetsDraft(settings.durationPresets.join(", "));
    setWorkingStart(formatTime(settings.workingHours.startMin));
    setWorkingEnd(formatTime(settings.workingHours.endMin));

    setOllamaEnabled(settings.ollamaEnabled ?? true);
    setOllamaUrlDraft(settings.ollamaBaseUrl || "http://127.0.0.1:11434");
    setOllamaModelDraft(settings.ollamaDefaultModel || "");

    setOpenaiEnabled(settings.openaiEnabled ?? false);
    setOpenaiKeyDraft(settings.openaiApiKey || "");
    setOpenaiUrlDraft(settings.openaiBaseUrl || "https://api.openai.com/v1");
    setOpenaiModelDraft(settings.openaiDefaultModel || "gpt-4o-mini");

    setGeminiEnabled(settings.geminiEnabled ?? false);
    setGeminiKeyDraft(settings.geminiApiKey || "");
    setGeminiModelDraft(settings.geminiDefaultModel || "gemini-1.5-flash");

    setTypesafeEnabled(settings.typesafeEnabled ?? true);
    setTypesafeKeyDraft(settings.typesafeApiKey || "");
    setTypesafeUrlDraft(settings.typesafeBaseUrl || "https://api.typesafe.ai");
  }, [
    settings.globalToggleShortcut,
    settings.durationPresets,
    settings.workingHours,
    settings.ollamaEnabled,
    settings.ollamaBaseUrl,
    settings.ollamaDefaultModel,
    settings.openaiEnabled,
    settings.openaiApiKey,
    settings.openaiBaseUrl,
    settings.openaiDefaultModel,
    settings.geminiEnabled,
    settings.geminiApiKey,
    settings.geminiDefaultModel,
    settings.typesafeEnabled,
    settings.typesafeApiKey,
    settings.typesafeBaseUrl,
  ]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const persistOllamaConfig = useCallback(
    async (partial?: { enabled?: boolean; url?: string; model?: string }) => {
      setSaveError(null);
      const enabled = partial?.enabled ?? ollamaEnabled;
      const url = (partial?.url ?? ollamaUrlDraft).trim();
      const model = (partial?.model ?? ollamaModelDraft).trim();
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem("foqz_ollama_base_url", url);
          if (model) localStorage.setItem("foqz_ollama_model", model);
        } catch {}
      }
      const res = await update({
        ollamaEnabled: enabled,
        ollamaBaseUrl: url,
        ollamaDefaultModel: model,
      });
      if (!res.ok) setSaveError(res.error ?? "Could not save Ollama configuration");
    },
    [update, ollamaEnabled, ollamaUrlDraft, ollamaModelDraft],
  );

  const persistOpenAiConfig = useCallback(
    async (partial?: { enabled?: boolean; key?: string; url?: string; model?: string }) => {
      setSaveError(null);
      const enabled = partial?.enabled ?? openaiEnabled;
      const key = (partial?.key ?? openaiKeyDraft).trim();
      const url = (partial?.url ?? openaiUrlDraft).trim();
      const model = (partial?.model ?? openaiModelDraft).trim();
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem("foqz_openai_api_key", key);
          localStorage.setItem("foqz_openai_base_url", url);
          localStorage.setItem("foqz_openai_model", model);
        } catch {}
      }
      const res = await update({
        openaiEnabled: enabled,
        openaiApiKey: key,
        openaiBaseUrl: url,
        openaiDefaultModel: model,
      });
      if (!res.ok) setSaveError(res.error ?? "Could not save OpenAI configuration");
    },
    [update, openaiEnabled, openaiKeyDraft, openaiUrlDraft, openaiModelDraft],
  );

  const persistGeminiConfig = useCallback(
    async (partial?: { enabled?: boolean; key?: string; model?: string }) => {
      setSaveError(null);
      const enabled = partial?.enabled ?? geminiEnabled;
      const key = (partial?.key ?? geminiKeyDraft).trim();
      const model = (partial?.model ?? geminiModelDraft).trim();
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem("foqz_gemini_api_key", key);
          localStorage.setItem("foqz_gemini_model", model);
        } catch {}
      }
      const res = await update({
        geminiEnabled: enabled,
        geminiApiKey: key,
        geminiDefaultModel: model,
      });
      if (!res.ok) setSaveError(res.error ?? "Could not save Gemini configuration");
    },
    [update, geminiEnabled, geminiKeyDraft, geminiModelDraft],
  );

  const persistTypesafeConfig = useCallback(
    async (partial?: { enabled?: boolean; key?: string; url?: string }) => {
      setSaveError(null);
      const enabled = partial?.enabled ?? typesafeEnabled;
      const key = (partial?.key ?? typesafeKeyDraft).trim();
      const url = (partial?.url ?? typesafeUrlDraft).trim();
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem("foqz_typesafe_api_key", key);
          localStorage.setItem("foqz_typesafe_base_url", url);
        } catch {}
      }
      const res = await update({
        typesafeEnabled: enabled,
        typesafeApiKey: key,
        typesafeBaseUrl: url,
      });
      if (!res.ok) setSaveError(res.error ?? "Could not save TypeSafe configuration");
    },
    [update, typesafeEnabled, typesafeKeyDraft, typesafeUrlDraft],
  );

  const handleTestOllama = useCallback(async () => {
    setTestingOllama(true);
    setOllamaStatus(null);
    void persistOllamaConfig();
    const res = await testOllamaConnection(ollamaUrlDraft);
    setOllamaStatus(res.message);
    setTestingOllama(false);
  }, [ollamaUrlDraft, persistOllamaConfig]);

  const handleTestOpenAi = useCallback(async () => {
    setTestingOpenai(true);
    setOpenaiStatus(null);
    void persistOpenAiConfig();
    const res = await testOpenAiConnection(openaiKeyDraft, openaiUrlDraft);
    setOpenaiStatus(res.message);
    setTestingOpenai(false);
  }, [openaiKeyDraft, openaiUrlDraft, persistOpenAiConfig]);

  const handleTestGemini = useCallback(async () => {
    setTestingGemini(true);
    setGeminiStatus(null);
    void persistGeminiConfig();
    const res = await testGeminiConnection(geminiKeyDraft);
    setGeminiStatus(res.message);
    setTestingGemini(false);
  }, [geminiKeyDraft, persistGeminiConfig]);

  const handleTestJev = useCallback(async () => {
    setTestingJev(true);
    setJevStatus(null);
    void persistTypesafeConfig();
    const res = await testJevConnection(typesafeKeyDraft, typesafeUrlDraft);
    setJevStatus(res.message);
    setTestingJev(false);
  }, [typesafeKeyDraft, typesafeUrlDraft, persistTypesafeConfig]);

  const persistWorkingHours = useCallback(async () => {
    setSaveError(null);
    const startMin = parseTimeToMinutes(workingStart);
    const endMin = parseTimeToMinutes(workingEnd);
    if (startMin == null || endMin == null) {
      setSaveError("Working hours must be valid times.");
      return;
    }
    if (startMin === endMin) {
      setSaveError("Working hours range can’t be zero-length.");
      return;
    }
    const res = await update({ workingHours: { startMin, endMin } });
    if (!res.ok) setSaveError(res.error ?? "Could not save working hours");
  }, [update, workingStart, workingEnd]);

  const persistShortcut = useCallback(async () => {
    setSaveError(null);
    const res = await update({ globalToggleShortcut: shortcutDraft.trim() });
    if (!res.ok) setSaveError(res.error ?? "Could not save shortcut");
  }, [update, shortcutDraft]);

  const persistPresets = useCallback(async () => {
    setSaveError(null);
    const nums = parsePresetsText(presetsDraft);
    if (nums.length === 0) {
      setSaveError("Add at least one duration preset (minutes).");
      return;
    }
    const merged = mergeAppSettings({
      ...settings,
      durationPresets: nums,
    });
    const res = await update({
      durationPresets: merged.durationPresets,
      defaultFocusMinutes: merged.defaultFocusMinutes,
    });
    if (!res.ok) setSaveError(res.error ?? "Could not save presets");
    else setPresetsDraft(merged.durationPresets.join(", "));
  }, [update, presetsDraft, settings]);

  const exportBoard = useCallback(async () => {
    setSaveError(null);
    const snapshot = getSnapshot(editor.store);
    const r = await window.focusStore?.exportBoardToFile?.(snapshot);
    if (r && !r.ok && !r.canceled)
      setSaveError(r.error ?? "Export failed");
  }, [editor]);

  const importBoard = useCallback(async () => {
    setSaveError(null);
    const r = await window.focusStore?.importBoardFromFile?.();
    if (!r || r.canceled) return;
    if (!r.ok || !("snapshot" in r)) {
      setSaveError(r.error ?? "Import failed");
      return;
    }
    try {
      loadSnapshot(editor.store, r.snapshot as never);
      const snapshot = getSnapshot(editor.store);
      await window.focusStore?.saveSnapshot?.(snapshot);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Import failed");
    }
  }, [editor]);

  const resetBoard = useCallback(async () => {
    if (
      !window.confirm(
        "Erase everything on this board? This cannot be undone.",
      )
    )
      return;
    setSaveError(null);
    try {
      await window.focusStore?.clearBoardFile?.();
      editor.run(() => {
        for (const page of editor.getPages()) {
          for (const id of [...editor.getSortedChildIdsForParent(page.id)]) {
            editor.deleteShape(id as TLShapeId);
          }
        }
      });
      const snapshot = getSnapshot(editor.store);
      await window.focusStore?.saveSnapshot?.(snapshot);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Reset failed");
    }
  }, [editor, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(94vh,860px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/90 bg-background/95 shadow-2xl backdrop-blur-md dark:border-white/12 dark:bg-zinc-950/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 id="focus-settings-title" className="text-base font-semibold tracking-tight">
            Settings
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="border-b border-border/60 px-5 py-3">
          <div className="inline-flex w-full items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-2 sm:px-3 text-xs sm:text-sm font-medium transition",
                tab === "general"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("general")}
            >
              General
            </button>
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-2 sm:px-3 text-xs sm:text-sm font-medium transition",
                tab === "workingHours"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("workingHours")}
            >
              Working hours
            </button>
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-2 sm:px-3 text-xs sm:text-sm font-medium transition",
                tab === "ai"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("ai")}
            >
              AI
            </button>
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-2 sm:px-3 text-xs sm:text-sm font-medium transition",
                tab === "mcp"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("mcp")}
            >
              MCP Servers
            </button>
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-2 sm:px-3 text-xs sm:text-sm font-medium transition",
                tab === "data"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("data")}
            >
              Data
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="flex flex-col gap-9 pb-2">
            {tab === "general" ? (
            <>
            <Section title="Focus timer">
              <Row
                label="Default block length"
                description="Used for new timer cards and task focus sessions."
              >
                <Input
                  type="number"
                  inputSize="sm"
                  min={1}
                  max={480}
                  className="w-full max-w-[120px] sm:ml-auto"
                  value={settings.defaultFocusMinutes}
                  onChange={(e) =>
                    void update({
                      defaultFocusMinutes: Number(e.target.value),
                    })
                  }
                />
              </Row>
              <Row
                label="Duration presets (minutes)"
                description="Comma-separated list shown on timer shapes."
              >
                <Input
                  inputSize="sm"
                  className="w-full min-w-0 font-mono text-xs sm:max-w-full"
                  value={presetsDraft}
                  onChange={(e) => setPresetsDraft(e.target.value)}
                  onBlur={() => void persistPresets()}
                  placeholder="15, 25, 50"
                />
              </Row>
            </Section>

            <Section title="Window">
              <Row
                label="Keep window on top"
                description="Floating above other windows."
              >
                <ToggleRowControl
                  checked={settings.alwaysOnTop}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ alwaysOnTop: v })}
                />
              </Row>
              <Row
                label="Pin window"
                description="When on, the canvas stays visible when you click elsewhere."
              >
                <ToggleRowControl
                  checked={settings.pinWindow}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ pinWindow: v })}
                />
              </Row>
              <Row
                label="Remember window position & size"
                description="Restores where you left the window."
              >
                <ToggleRowControl
                  checked={settings.rememberWindowBounds}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ rememberWindowBounds: v })}
                />
              </Row>
              <Row
                label="Show icon in Dock"
                description="macOS: show the app in the Dock in addition to the menu bar tray. No effect on Windows or Linux."
              >
                <ToggleRowControl
                  checked={settings.showDockIcon}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ showDockIcon: v })}
                />
              </Row>
            </Section>

            <Section title="Startup & shortcuts">
              <Row
                label="Open at login"
                description="Start with macOS (menu bar apps)."
              >
                <ToggleRowControl
                  checked={settings.openAtLogin}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ openAtLogin: v })}
                />
              </Row>
              <Row
                label="Global show / hide"
                description="Electron accelerator, e.g. CommandOrControl+Shift+F"
              >
                <Input
                  inputSize="sm"
                  className="w-full min-w-0 font-mono text-xs"
                  value={shortcutDraft}
                  onChange={(e) => setShortcutDraft(e.target.value)}
                  onBlur={() => void persistShortcut()}
                  disabled={!isElectron}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Row>
            </Section>

            <Section title="Notifications">
              <Row
                label="Notify when a focus block ends"
                description="Uses system notifications when allowed."
              >
                <ToggleRowControl
                  checked={settings.notifyOnTimerEnd}
                  onCheckedChange={async (v) => {
                    if (v) await ensureNotificationPermission();
                    void update({ notifyOnTimerEnd: v });
                  }}
                />
              </Row>
              <Row label="Play sound" description="Short chime when time is up.">
                <ToggleRowControl
                  checked={settings.playSoundOnTimerEnd}
                  onCheckedChange={(v) => void update({ playSoundOnTimerEnd: v })}
                />
              </Row>
            </Section>

            <Section title="Appearance">
              <Row label="Color scheme">
                <select
                  className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm sm:ml-auto sm:max-w-[220px]"
                  value={settings.colorScheme}
                  onChange={(e) =>
                    void update({
                      colorScheme: e.target.value as typeof settings.colorScheme,
                    })
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Row>
            </Section>
            </>
            ) : null}

            {tab === "workingHours" ? (
              <Section title="Working hours">
                <Row
                  label="Range"
                  description="Used for planning features (e.g. highlighting after-hours). Overnight ranges are allowed."
                >
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-[320px]">
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        inputSize="sm"
                        className="w-full min-w-0"
                        value={workingStart}
                        onChange={(e) => setWorkingStart(e.target.value)}
                        onBlur={() => void persistWorkingHours()}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        inputSize="sm"
                        className="w-full min-w-0"
                        value={workingEnd}
                        onChange={(e) => setWorkingEnd(e.target.value)}
                        onBlur={() => void persistWorkingHours()}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Example: 09:00–17:00. Overnight: 22:00–06:00.
                    </div>
                  </div>
                </Row>
              </Section>
            ) : null}

            {tab === "ai" ? (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI Connectors</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Toggle and configure connectors for local inference, cloud foundation models, and System One fast evaluations.
                  </p>
                </div>

                {/* Active AI Provider Switcher */}
                <div className="p-3.5 rounded-xl border border-border bg-card/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Active AI Engine</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Primary model provider used by the Copilot chat and canvas tools.</div>
                  </div>
                  <select
                    value={settings.activeAiProvider || "ollama"}
                    onChange={(e) => {
                      const prov = e.target.value as "ollama" | "openai" | "gemini";
                      void update({ activeAiProvider: prov });
                    }}
                    className="h-8 px-2.5 rounded-lg border border-input bg-background text-xs font-medium text-foreground cursor-pointer shadow-2xs"
                  >
                    <option value="ollama">Ollama (Local / Private)</option>
                    <option value="openai">OpenAI (Cloud)</option>
                    <option value="gemini">Google Gemini (Cloud)</option>
                  </select>
                </div>

                {/* 1. Ollama (Local AI) */}
                <AiConnectorCard
                  icon={Bot}
                  title="Ollama"
                  badge="Local / Private"
                  description="Run open-source models (Llama 3, Qwen 2.5, Mistral) 100% locally on your machine."
                  enabled={ollamaEnabled}
                  onToggle={(v) => {
                    setOllamaEnabled(v);
                    void persistOllamaConfig({ enabled: v });
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-1">
                        Base URL
                      </label>
                      <Input
                        inputSize="sm"
                        placeholder="http://127.0.0.1:11434"
                        value={ollamaUrlDraft}
                        onChange={(e) => setOllamaUrlDraft(e.target.value)}
                        onBlur={() => void persistOllamaConfig()}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-1">
                        Default Model
                      </label>
                      <Input
                        inputSize="sm"
                        placeholder="e.g. qwen2.5-coder:7b or llama3.2"
                        value={ollamaModelDraft}
                        onChange={(e) => setOllamaModelDraft(e.target.value)}
                        onBlur={() => void persistOllamaConfig()}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={testingOllama}
                      onClick={() => void handleTestOllama()}
                    >
                      {testingOllama ? (
                        <>
                          <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        "Test & Detect Models"
                      )}
                    </Button>
                    {ollamaStatus ? (
                      <span
                        className={`text-xs flex items-center gap-1 ${
                          ollamaStatus.startsWith("Online")
                            ? "text-emerald-500 font-medium"
                            : "text-amber-500"
                        }`}
                      >
                        {ollamaStatus.startsWith("Online") ? (
                          <CheckCircle2 className="size-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="size-3.5 shrink-0" />
                        )}
                        <span>{ollamaStatus}</span>
                      </span>
                    ) : null}
                  </div>
                </AiConnectorCard>

                {/* 2. OpenAI */}
                <AiConnectorCard
                  icon={Sparkles}
                  title="OpenAI"
                  badge="Cloud Foundation"
                  description="Connect GPT-4o, GPT-4o-mini, or compatible gateways (OpenRouter, Groq, DeepSeek)."
                  enabled={openaiEnabled}
                  onToggle={(v) => {
                    setOpenaiEnabled(v);
                    void persistOpenAiConfig({ enabled: v });
                  }}
                >
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-1">
                        API Key
                      </label>
                      <div className="relative flex items-center">
                        <Input
                          type={showOpenaiKey ? "text" : "password"}
                          inputSize="sm"
                          placeholder="sk-proj-..."
                          value={openaiKeyDraft}
                          onChange={(e) => setOpenaiKeyDraft(e.target.value)}
                          onBlur={() => void persistOpenAiConfig()}
                          className="pr-9 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOpenaiKey((prev) => !prev)}
                          className="absolute right-2 text-muted-foreground hover:text-foreground p-1 rounded"
                          tabIndex={-1}
                        >
                          {showOpenaiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Base URL
                        </label>
                        <Input
                          inputSize="sm"
                          placeholder="https://api.openai.com/v1"
                          value={openaiUrlDraft}
                          onChange={(e) => setOpenaiUrlDraft(e.target.value)}
                          onBlur={() => void persistOpenAiConfig()}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Default Model
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            value={
                              OPENAI_DEFAULT_MODELS.includes(openaiModelDraft)
                                ? openaiModelDraft
                                : "custom"
                            }
                            onChange={(e) => {
                              if (e.target.value !== "custom") {
                                setOpenaiModelDraft(e.target.value);
                                void persistOpenAiConfig({ model: e.target.value });
                              }
                            }}
                          >
                            {OPENAI_DEFAULT_MODELS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                            <option value="custom">Custom model...</option>
                          </select>
                          <Input
                            inputSize="sm"
                            placeholder="model name"
                            value={openaiModelDraft}
                            onChange={(e) => setOpenaiModelDraft(e.target.value)}
                            onBlur={() => void persistOpenAiConfig()}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testingOpenai || !openaiKeyDraft.trim()}
                        onClick={() => void handleTestOpenAi()}
                      >
                        {testingOpenai ? "Testing..." : "Test OpenAI Connection"}
                      </Button>
                      {openaiStatus ? (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            openaiStatus.startsWith("Connected")
                              ? "text-emerald-500 font-medium"
                              : "text-destructive"
                          }`}
                        >
                          {openaiStatus.startsWith("Connected") ? (
                            <CheckCircle2 className="size-3.5 shrink-0" />
                          ) : (
                            <AlertCircle className="size-3.5 shrink-0" />
                          )}
                          <span>{openaiStatus}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </AiConnectorCard>

                {/* 3. Google Gemini */}
                <AiConnectorCard
                  icon={Zap}
                  title="Google Gemini"
                  badge="High-Speed Multimodal"
                  description="Leverage Google Gemini 1.5 Flash, 2.0 Flash, and Gemini Pro models."
                  enabled={geminiEnabled}
                  onToggle={(v) => {
                    setGeminiEnabled(v);
                    void persistGeminiConfig({ enabled: v });
                  }}
                >
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Gemini API Key
                        </label>
                        <div className="relative flex items-center">
                          <Input
                            type={showGeminiKey ? "text" : "password"}
                            inputSize="sm"
                            placeholder="AIzaSy..."
                            value={geminiKeyDraft}
                            onChange={(e) => setGeminiKeyDraft(e.target.value)}
                            onBlur={() => void persistGeminiConfig()}
                            className="pr-9 font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGeminiKey((prev) => !prev)}
                            className="absolute right-2 text-muted-foreground hover:text-foreground p-1 rounded"
                            tabIndex={-1}
                          >
                            {showGeminiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Default Model
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            value={
                              GEMINI_DEFAULT_MODELS.includes(geminiModelDraft)
                                ? geminiModelDraft
                                : "custom"
                            }
                            onChange={(e) => {
                              if (e.target.value !== "custom") {
                                setGeminiModelDraft(e.target.value);
                                void persistGeminiConfig({ model: e.target.value });
                              }
                            }}
                          >
                            {GEMINI_DEFAULT_MODELS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                            <option value="custom">Custom model...</option>
                          </select>
                          <Input
                            inputSize="sm"
                            placeholder="model name"
                            value={geminiModelDraft}
                            onChange={(e) => setGeminiModelDraft(e.target.value)}
                            onBlur={() => void persistGeminiConfig()}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testingGemini || !geminiKeyDraft.trim()}
                        onClick={() => void handleTestGemini()}
                      >
                        {testingGemini ? "Testing..." : "Test Gemini Connection"}
                      </Button>
                      {geminiStatus ? (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            geminiStatus.startsWith("Connected")
                              ? "text-emerald-500 font-medium"
                              : "text-destructive"
                          }`}
                        >
                          {geminiStatus.startsWith("Connected") ? (
                            <CheckCircle2 className="size-3.5 shrink-0" />
                          ) : (
                            <AlertCircle className="size-3.5 shrink-0" />
                          )}
                          <span>{geminiStatus}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </AiConnectorCard>

                {/* 4. TypeSafe (System One AI) */}
                <AiConnectorCard
                  icon={Target}
                  title="TypeSafe AI"
                  badge="System One Judgments"
                  description="Sub-150ms parallel evaluations for daily backlog prioritization, mono-focus friction, and semantic search."
                  enabled={typesafeEnabled}
                  onToggle={(v) => {
                    setTypesafeEnabled(v);
                    void persistTypesafeConfig({ enabled: v });
                  }}
                >
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          TypeSafe API Key
                        </label>
                        <div className="relative flex items-center">
                          <Input
                            type={showTypesafeKey ? "text" : "password"}
                            inputSize="sm"
                            placeholder="apikey_... or sk-typesafe-..."
                            value={typesafeKeyDraft}
                            onChange={(e) => setTypesafeKeyDraft(e.target.value)}
                            onBlur={() => void persistTypesafeConfig()}
                            className="pr-9 font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowTypesafeKey((prev) => !prev)}
                            className="absolute right-2 text-muted-foreground hover:text-foreground p-1 rounded"
                            tabIndex={-1}
                          >
                            {showTypesafeKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          API Base URL
                        </label>
                        <Input
                          inputSize="sm"
                          placeholder="https://api.typesafe.ai"
                          value={typesafeUrlDraft}
                          onChange={(e) => setTypesafeUrlDraft(e.target.value)}
                          onBlur={() => void persistTypesafeConfig()}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testingJev || !typesafeKeyDraft.trim()}
                        onClick={() => void handleTestJev()}
                      >
                        {testingJev ? "Testing..." : "Test Connection"}
                      </Button>
                      {jevStatus ? (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            jevStatus.startsWith("Connected")
                              ? "text-emerald-500 font-medium"
                              : "text-destructive"
                          }`}
                        >
                          {jevStatus.startsWith("Connected") ? (
                            <CheckCircle2 className="size-3.5 shrink-0" />
                          ) : (
                            <AlertCircle className="size-3.5 shrink-0" />
                          )}
                          <span>{jevStatus}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </AiConnectorCard>
              </div>
            ) : null}

            {tab === "mcp" ? (
              <Section title="Model Context Protocol (MCP)">
                <McpSettingsTab />
              </Section>
            ) : null}

            {tab === "data" ? (
            <Section title="Data">
              <Row
                label="Export board"
                description="Save a JSON copy of your canvas."
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isElectron}
                  onClick={() => void exportBoard()}
                >
                  Export…
                </Button>
              </Row>
              <Row
                label="Import board"
                description="Replace the current canvas from a JSON file."
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isElectron}
                  onClick={() => void importBoard()}
                >
                  Import…
                </Button>
              </Row>
              <Row label="Erase board" description="Remove all shapes permanently.">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={!isElectron}
                  onClick={() => void resetBoard()}
                >
                  Reset board…
                </Button>
              </Row>
            </Section>
            ) : null}

            {!isElectron ? (
              <p className="text-xs text-muted-foreground">
                Window, startup, and file actions require the desktop app.
              </p>
            ) : null}

            {saveError ? (
              <p className="text-xs font-medium text-destructive">{saveError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

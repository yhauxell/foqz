import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFocusAppSettings } from "@/context/FocusAppSettingsContext";
import { mergeAppSettings } from "@/lib/appSettings";
import { ensureNotificationPermission } from "@/lib/focusSessionFeedback";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  GitPullRequest,
  ImageIcon,
  Plus,
  RefreshCw,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { McpSettingsTab } from "@/components/McpSettingsTab";
import { AgentsSettingsTab } from "@/components/AgentsSettingsTab";
import {
  OPENAI_DEFAULT_MODELS,
  GEMINI_DEFAULT_MODELS,
  testOllamaConnection,
  testOpenAiConnection,
  testGeminiConnection,
  testJevConnection,
} from "@/lib/aiConnectors";
import { discoverLocalServers, type DiscoveredLocalServer } from "@/lib/ollama";
import { useCallback, useEffect, useState } from "react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";

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
function parsePresetsText(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 480);
}

type SettingsTab = "general" | "ai" | "agents" | "data" | "workingHours" | "mcp";

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
  editor?: any;
}) {
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
  // Ollama & Local LLM Servers
  const [ollamaEnabled, setOllamaEnabled] = useState(settings.ollamaEnabled ?? true);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(settings.ollamaBaseUrl || "http://127.0.0.1:11434");
  const [ollamaModelDraft, setOllamaModelDraft] = useState(settings.ollamaDefaultModel || "");
  const [testingOllama, setTestingOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredLocalServer[]>([]);
  const [probingLocal, setProbingLocal] = useState(false);

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

  // GitHub Integration (PAT)
  const [githubTokenDraft, setGithubTokenDraft] = useState(() => {
    if (settings.githubToken) return settings.githubToken;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        return localStorage.getItem("foqz_github_token") || "";
      } catch {}
    }
    return "";
  });
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [githubTokenStatus, setGithubTokenStatus] = useState<string | null>(null);
  const [testingGithub, setTestingGithub] = useState(false);

  // Image Generation
  const [imageProviderDraft, setImageProviderDraft] = useState<"auto" | "openai" | "gemini" | "pollinations">(
    settings.imageProvider || "auto"
  );
  const [imageModelDraft, setImageModelDraft] = useState(settings.imageModel || "dall-e-3");

  // In-modal AI Provider Configuration Drawer / Panel
  const [activeConfigProvider, setActiveConfigProvider] = useState<
    "ollama" | "openai" | "gemini" | "typesafe" | "image" | null
  >(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotification, setSaveSuccessNotification] = useState(false);

  const isElectron = typeof window.focusStore?.getSettings === "function";

  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    if (!window.focusStore?.updater) return;

    window.focusStore.updater
      .getState()
      .then((st) => {
        setUpdaterState(st);
      })
      .catch(() => {});

    const unsubscribe = window.focusStore.updater.onStatusChange((st) => {
      setUpdaterState(st);
      if (st.status !== "checking") {
        setCheckingUpdate(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    if (!window.focusStore?.updater) return;
    setCheckingUpdate(true);
    try {
      await window.focusStore.updater.check();
    } catch {
      setCheckingUpdate(false);
    }
  }, []);

  const handleRestartAndInstall = useCallback(async () => {
    if (!window.focusStore?.updater) return;
    await window.focusStore.updater.quitAndInstall();
  }, []);

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

    if (settings.githubToken !== undefined) {
      setGithubTokenDraft(settings.githubToken);
    }
    if (settings.imageProvider !== undefined) {
      setImageProviderDraft(settings.imageProvider);
    }
    if (settings.imageModel !== undefined) {
      setImageModelDraft(settings.imageModel);
    }
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
    settings.githubToken,
    settings.imageProvider,
    settings.imageModel,
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

  const persistGithubToken = useCallback(
    async (tokenVal?: string) => {
      setSaveError(null);
      const token = (tokenVal ?? githubTokenDraft).trim();
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          if (token) {
            localStorage.setItem("foqz_github_token", token);
          } else {
            localStorage.removeItem("foqz_github_token");
          }
        } catch {}
      }
      const res = await update({ githubToken: token });
      if (!res.ok) setSaveError(res.error ?? "Could not save GitHub configuration");
    },
    [update, githubTokenDraft],
  );

  const handleTestGithub = useCallback(async () => {
    setTestingGithub(true);
    setGithubTokenStatus(null);
    void persistGithubToken();
    const token = githubTokenDraft.trim();
    if (!token) {
      setGithubTokenStatus("Token is empty. Please enter a valid Personal Access Token.");
      setTestingGithub(false);
      return;
    }
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const user = await res.json();
        setGithubTokenStatus(`Connected as @${user.login} (${user.name || "GitHub User"})`);
      } else if (res.status === 401) {
        setGithubTokenStatus("Bad credentials (401). Check if your token is valid or expired.");
      } else {
        setGithubTokenStatus(`GitHub API error: ${res.statusText}`);
      }
    } catch (e: any) {
      setGithubTokenStatus(e.message || "Network error testing GitHub connection");
    } finally {
      setTestingGithub(false);
    }
  }, [githubTokenDraft, persistGithubToken]);

  const handleProbeLocalServers = useCallback(async () => {
    setProbingLocal(true);
    try {
      const servers = await discoverLocalServers();
      setDiscoveredServers(servers);
      const onlineFound = servers.find((s) => s.online);
      if (onlineFound && !ollamaModelDraft) {
        if (onlineFound.recommendedModel) {
          setOllamaModelDraft(onlineFound.recommendedModel);
          void persistOllamaConfig({ model: onlineFound.recommendedModel });
        }
      }
    } finally {
      setProbingLocal(false);
    }
  }, [ollamaModelDraft, persistOllamaConfig]);

  useEffect(() => {
    if (open && tab === "ai") {
      void handleProbeLocalServers();
    }
  }, [open, tab, handleProbeLocalServers]);

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

  const handleSaveAllChanges = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);

    const startMin = parseTimeToMinutes(workingStart);
    const endMin = parseTimeToMinutes(workingEnd);
    if (startMin == null || endMin == null) {
      setSaveError("Working hours must be valid times (HH:MM).");
      setIsSaving(false);
      return;
    }
    if (startMin === endMin) {
      setSaveError("Working hours range can’t be zero-length.");
      setIsSaving(false);
      return;
    }

    const nums = parsePresetsText(presetsDraft);
    if (nums.length === 0) {
      setSaveError("Add at least one duration preset (minutes).");
      setIsSaving(false);
      return;
    }

    const merged = mergeAppSettings({
      ...settings,
      durationPresets: nums,
    });

    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem("foqz_openai_api_key", openaiKeyDraft.trim());
        localStorage.setItem("foqz_openai_base_url", openaiUrlDraft.trim());
        localStorage.setItem("foqz_openai_model", openaiModelDraft.trim());
        localStorage.setItem("foqz_gemini_api_key", geminiKeyDraft.trim());
        localStorage.setItem("foqz_gemini_model", geminiModelDraft.trim());
        localStorage.setItem("foqz_typesafe_api_key", typesafeKeyDraft.trim());
        localStorage.setItem("foqz_typesafe_base_url", typesafeUrlDraft.trim());
        if (githubTokenDraft.trim()) {
          localStorage.setItem("foqz_github_token", githubTokenDraft.trim());
        } else {
          localStorage.removeItem("foqz_github_token");
        }
      } catch {}
    }

    const res = await update({
      durationPresets: merged.durationPresets,
      defaultFocusMinutes: merged.defaultFocusMinutes,
      workingHours: { startMin, endMin },
      globalToggleShortcut: shortcutDraft.trim(),
      ollamaEnabled,
      ollamaBaseUrl: ollamaUrlDraft.trim(),
      ollamaDefaultModel: ollamaModelDraft.trim(),
      openaiEnabled,
      openaiApiKey: openaiKeyDraft.trim(),
      openaiBaseUrl: openaiUrlDraft.trim(),
      openaiDefaultModel: openaiModelDraft.trim(),
      geminiEnabled,
      geminiApiKey: geminiKeyDraft.trim(),
      geminiDefaultModel: geminiModelDraft.trim(),
      typesafeEnabled,
      typesafeApiKey: typesafeKeyDraft.trim(),
      typesafeBaseUrl: typesafeUrlDraft.trim(),
      githubToken: githubTokenDraft.trim(),
      imageProvider: imageProviderDraft,
      imageModel: imageModelDraft.trim(),
    });

    setIsSaving(false);

    if (!res.ok) {
      setSaveError(res.error ?? "Failed to save settings");
    } else {
      setSaveSuccessNotification(true);
      setTimeout(() => {
        setSaveSuccessNotification(false);
        onClose();
      }, 350);
    }
  }, [
    settings,
    update,
    workingStart,
    workingEnd,
    presetsDraft,
    shortcutDraft,
    ollamaEnabled,
    ollamaUrlDraft,
    ollamaModelDraft,
    openaiEnabled,
    openaiKeyDraft,
    openaiUrlDraft,
    openaiModelDraft,
    geminiEnabled,
    geminiKeyDraft,
    geminiModelDraft,
    typesafeEnabled,
    typesafeKeyDraft,
    typesafeUrlDraft,
    githubTokenDraft,
    imageProviderDraft,
    imageModelDraft,
    onClose,
  ]);

  const exportBoard = useCallback(async () => {
    setSaveError(null);
    try {
      const { nodes, edges } = useFlowCanvasStore.getState();
      const data = JSON.stringify({ nodes, edges, version: 1, exportedAt: Date.now() }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foqz-board-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Export failed");
    }
  }, []);

  const importBoard = useCallback(async () => {
    setSaveError(null);
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.nodes)) {
          useFlowCanvasStore.getState().setNodes(parsed.nodes);
        }
        if (Array.isArray(parsed.edges)) {
          useFlowCanvasStore.getState().setEdges(parsed.edges);
        }
      };
      input.click();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Import failed");
    }
  }, []);

  const resetBoard = useCallback(async () => {
    if (
      !window.confirm(
        "Erase everything on this board? This cannot be undone.",
      )
    )
      return;
    setSaveError(null);
    try {
      useFlowCanvasStore.getState().resetBoard();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Reset failed");
    }
  }, [onClose]);

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
        className="flex max-h-[min(94vh,860px)] w-full max-w-4xl w-[92vw] flex-col overflow-hidden rounded-2xl border border-border/90 bg-background/95 shadow-2xl backdrop-blur-md dark:border-white/12 dark:bg-zinc-950/95"
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

        <div className="border-b border-border/60 px-6 py-2.5 bg-muted/20">
          <div className="flex w-full items-center gap-2 overflow-x-auto no-scrollbar rounded-xl border border-border/70 bg-muted/50 p-1 select-none">
            <button
              type="button"
              className={[
                "h-9 flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-xs sm:text-sm font-medium transition",
                tab === "general" || tab === "workingHours"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40",
              ].join(" ")}
              onClick={() => {
                setActiveConfigProvider(null);
                setTab("general");
              }}
            >
              <Sliders className="size-3.5 shrink-0" />
              <span>General</span>
            </button>
            <button
              type="button"
              className={[
                "h-9 flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-xs sm:text-sm font-medium transition",
                tab === "ai"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40",
              ].join(" ")}
              onClick={() => setTab("ai")}
            >
              <Sparkles className="size-3.5 shrink-0 text-amber-500" />
              <span>AI & Models</span>
            </button>
            <button
              type="button"
              className={[
                "h-9 flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-xs sm:text-sm font-medium transition",
                tab === "agents" || tab === "mcp"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40",
              ].join(" ")}
              onClick={() => {
                setActiveConfigProvider(null);
                setTab("agents");
              }}
            >
              <Bot className="size-3.5 shrink-0 text-blue-500" />
              <span>Agents & MCP</span>
            </button>
            <button
              type="button"
              className={[
                "h-9 flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-xs sm:text-sm font-medium transition",
                tab === "data"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40",
              ].join(" ")}
              onClick={() => {
                setActiveConfigProvider(null);
                setTab("data");
              }}
            >
              <Database className="size-3.5 shrink-0 text-emerald-500" />
              <span>Data</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="flex flex-col gap-9 pb-2">
            {tab === "general" || tab === "workingHours" ? (
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

            <Section title="Working hours">
              <Row
                label="Daily active hours"
                description="Used for planning features and highlighting after-hours sessions. Overnight ranges are supported."
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
                    <span className="text-xs text-muted-foreground font-medium">to</span>
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
                    Default: 09:00–17:00. Overnight: 22:00–06:00.
                  </div>
                </div>
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

            <Section title="About & Updates">
              <div className="rounded-xl border border-border/80 bg-card/40 p-4 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs tracking-wider border border-primary/20 shrink-0">
                      FQ
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">Foqz</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-muted text-foreground border border-border/60">
                          v{updaterState?.currentVersion || "0.2.0"}
                        </span>
                        {updaterState?.isPackaged === false && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Dev
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {!isElectron ? (
                          "Running in web browser. Desktop updates are delivered via GitHub Releases."
                        ) : updaterState?.status === "checking" || checkingUpdate ? (
                          "Checking for updates..."
                        ) : updaterState?.status === "available" ? (
                          `Update v${updaterState.updateInfo?.version || ""} available! Downloading in background...`
                        ) : updaterState?.status === "downloading" ? (
                          `Downloading update v${updaterState.updateInfo?.version || ""} (${updaterState.progress?.percent ?? 0}%)...`
                        ) : updaterState?.status === "downloaded" ? (
                          `Foqz v${updaterState.updateInfo?.version || ""} has been downloaded and is ready to install.`
                        ) : updaterState?.status === "not-available" ? (
                          "Foqz is up to date."
                        ) : updaterState?.status === "dev-mode" ? (
                          "Running unpackaged in development mode."
                        ) : updaterState?.status === "error" ? (
                          <span className="text-red-500">
                            Check failed: {updaterState.error || "Unknown error"}
                          </span>
                        ) : (
                          "Automatic background updates are enabled."
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
                    {updaterState?.status === "downloaded" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium cursor-pointer shadow-xs"
                        onClick={handleRestartAndInstall}
                      >
                        <Download className="size-3.5" />
                        <span>Restart & Install</span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          !isElectron ||
                          checkingUpdate ||
                          updaterState?.status === "checking" ||
                          updaterState?.status === "downloading"
                        }
                        onClick={handleCheckForUpdates}
                        className="gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <RefreshCw
                          className={`size-3.5 ${
                            checkingUpdate ||
                            updaterState?.status === "checking" ||
                            updaterState?.status === "downloading"
                              ? "animate-spin text-primary"
                              : ""
                          }`}
                        />
                        <span>
                          {checkingUpdate || updaterState?.status === "checking"
                            ? "Checking..."
                            : updaterState?.status === "downloading"
                            ? "Downloading..."
                            : "Check for updates"}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Download progress bar */}
                {updaterState?.status === "downloading" && updaterState.progress ? (
                  <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-1.5 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(5, updaterState.progress.percent)}%` }}
                    />
                  </div>
                ) : null}

                {/* Footer info: last checked and release link */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/80 pt-2 border-t border-border/50">
                  <span>
                    {updaterState?.lastChecked
                      ? `Last checked: ${new Date(updaterState.lastChecked).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Checks automatically on start"}
                  </span>
                  <a
                    href="https://github.com/yhauxell/foqz/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                  >
                    View release notes
                  </a>
                </div>
              </div>
            </Section>
            </>
            ) : null}



            {tab === "ai" ? (
              <div className="flex flex-col gap-5">
                {activeConfigProvider ? (
                  /* ==============================================================
                     IN-MODAL CONFIGURATION PANEL FOR SELECTED PROVIDER
                     ============================================================== */
                  <div className="rounded-2xl border border-border/80 bg-card/60 p-5 space-y-5 animate-in fade-in slide-in-from-right-4 duration-150 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveConfigProvider(null)}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          ← Back to Providers
                        </Button>
                        <span className="text-muted-foreground/40">|</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground capitalize">
                            {activeConfigProvider === "image"
                              ? "AI Image Generation"
                              : activeConfigProvider === "typesafe"
                              ? "TypeSafe AI (Jev)"
                              : activeConfigProvider}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                            Configuration
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setActiveConfigProvider(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>

                    {/* Ollama Config */}
                    {activeConfigProvider === "ollama" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
                          <div>
                            <div className="text-xs font-semibold text-foreground">Enable Ollama</div>
                            <div className="text-[11px] text-muted-foreground">Run local models offline on your machine</div>
                          </div>
                          <Toggle
                            checked={ollamaEnabled}
                            onCheckedChange={(v) => {
                              setOllamaEnabled(v);
                              void persistOllamaConfig({ enabled: v });
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

                        {/* Local Discovery Strip */}
                        <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Bot className="size-3.5 text-primary" />
                              <span>Auto-Detected Local Inference Engines</span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={probingLocal}
                              onClick={() => void handleProbeLocalServers()}
                            >
                              <RefreshCw className={`size-3 ${probingLocal ? "animate-spin text-primary" : "text-muted-foreground"}`} />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {(discoveredServers.length > 0 ? discoveredServers : [
                              { kind: 'ollama', name: 'Ollama', url: 'http://127.0.0.1:11434', online: false, models: [] },
                              { kind: 'lmstudio', name: 'LM Studio', url: 'http://127.0.0.1:1234/v1', online: false, models: [] },
                              { kind: 'llamacpp', name: 'llama.cpp', url: 'http://127.0.0.1:8080/v1', online: false, models: [] },
                            ]).map((srv) => (
                              <div
                                key={srv.name}
                                className={`p-2 rounded-lg border text-xs flex flex-col justify-between gap-1 transition-all ${
                                  srv.online
                                    ? "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20"
                                    : "border-border/40 bg-background/50 opacity-70"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-foreground">{srv.name}</span>
                                  <span
                                    className={`size-2 rounded-full ${
                                      srv.online ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                                    }`}
                                  />
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">{srv.online ? `${srv.models.length} model(s) active` : "Offline"}</div>
                                {srv.online && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOllamaUrlDraft(srv.url);
                                      if (srv.recommendedModel) {
                                        setOllamaModelDraft(srv.recommendedModel);
                                        void persistOllamaConfig({ url: srv.url, model: srv.recommendedModel });
                                      } else {
                                        void persistOllamaConfig({ url: srv.url });
                                      }
                                    }}
                                    className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline text-left cursor-pointer pt-0.5"
                                  >
                                    Use this engine →
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={testingOllama}
                            onClick={() => void handleTestOllama()}
                          >
                            {testingOllama ? "Testing..." : "Test Connection"}
                          </Button>
                          {ollamaStatus && (
                            <span className={`text-xs ${ollamaStatus.startsWith("Connected") ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive"}`}>
                              {ollamaStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* OpenAI Config */}
                    {activeConfigProvider === "openai" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
                          <div>
                            <div className="text-xs font-semibold text-foreground">Enable OpenAI</div>
                            <div className="text-[11px] text-muted-foreground">GPT-4o, GPT-4o-mini, and compatible API gateways</div>
                          </div>
                          <Toggle
                            checked={openaiEnabled}
                            onCheckedChange={(v) => {
                              setOpenaiEnabled(v);
                              void persistOpenAiConfig({ enabled: v });
                            }}
                          />
                        </div>

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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                                value={OPENAI_DEFAULT_MODELS.includes(openaiModelDraft) ? openaiModelDraft : "custom"}
                                onChange={(e) => {
                                  if (e.target.value !== "custom") {
                                    setOpenaiModelDraft(e.target.value);
                                    void persistOpenAiConfig({ model: e.target.value });
                                  }
                                }}
                              >
                                {OPENAI_DEFAULT_MODELS.map((m) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                                <option value="custom">Custom...</option>
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

                        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={testingOpenai || !openaiKeyDraft.trim()}
                            onClick={() => void handleTestOpenAi()}
                          >
                            {testingOpenai ? "Testing..." : "Test Connection"}
                          </Button>
                          {openaiStatus && (
                            <span className={`text-xs ${openaiStatus.startsWith("Connected") ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive"}`}>
                              {openaiStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Gemini Config */}
                    {activeConfigProvider === "gemini" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
                          <div>
                            <div className="text-xs font-semibold text-foreground">Enable Google Gemini</div>
                            <div className="text-[11px] text-muted-foreground">Gemini 1.5 Flash, 2.0 Flash, and Pro models</div>
                          </div>
                          <Toggle
                            checked={geminiEnabled}
                            onCheckedChange={(v) => {
                              setGeminiEnabled(v);
                              void persistGeminiConfig({ enabled: v });
                            }}
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-foreground block mb-1">
                            Google AI Studio API Key
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
                              value={GEMINI_DEFAULT_MODELS.includes(geminiModelDraft) ? geminiModelDraft : "custom"}
                              onChange={(e) => {
                                if (e.target.value !== "custom") {
                                  setGeminiModelDraft(e.target.value);
                                  void persistGeminiConfig({ model: e.target.value });
                                }
                              }}
                            >
                              {GEMINI_DEFAULT_MODELS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                              <option value="custom">Custom...</option>
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

                        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={testingGemini || !geminiKeyDraft.trim()}
                            onClick={() => void handleTestGemini()}
                          >
                            {testingGemini ? "Testing..." : "Test Connection"}
                          </Button>
                          {geminiStatus && (
                            <span className={`text-xs ${geminiStatus.startsWith("Connected") ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive"}`}>
                              {geminiStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TypeSafe Config */}
                    {activeConfigProvider === "typesafe" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
                          <div>
                            <div className="text-xs font-semibold text-foreground">Enable TypeSafe AI</div>
                            <div className="text-[11px] text-muted-foreground">Sub-150ms Jev evaluations for daily backlog and friction ranking</div>
                          </div>
                          <Toggle
                            checked={typesafeEnabled}
                            onCheckedChange={(v) => {
                              setTypesafeEnabled(v);
                              void persistTypesafeConfig({ enabled: v });
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="text-xs font-medium text-foreground block mb-1">
                              API Key
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

                        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={testingJev || !typesafeKeyDraft.trim()}
                            onClick={() => void handleTestJev()}
                          >
                            {testingJev ? "Testing..." : "Test Connection"}
                          </Button>
                          {jevStatus && (
                            <span className={`text-xs ${jevStatus.startsWith("Connected") ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive"}`}>
                              {jevStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Image Generation Config */}
                    {activeConfigProvider === "image" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="text-xs font-medium text-foreground block mb-1">
                              Image Generation Engine
                            </label>
                            <select
                              className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground cursor-pointer shadow-2xs"
                              value={imageProviderDraft}
                              onChange={(e) => setImageProviderDraft(e.target.value as any)}
                            >
                              <option value="auto">Auto (DALL-E 3 if key exists, else Pollinations)</option>
                              <option value="openai">OpenAI DALL-E 3</option>
                              <option value="pollinations">Pollinations AI (Free / Offline-safe)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-foreground block mb-1">
                              Model
                            </label>
                            <Input
                              inputSize="sm"
                              placeholder="dall-e-3"
                              value={imageModelDraft}
                              onChange={(e) => setImageModelDraft(e.target.value)}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Trigger from chat using <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">/image &lt;prompt&gt;</code> to place interactive image elements directly onto the board.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ==============================================================
                     CLEAN PROVIDER OVERVIEW + "+ ADD / CONFIGURE" DRAWER TRIGGER
                     ============================================================== */
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Configured AI Connectors</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Manage and fine-tune your local and cloud intelligence engines.
                        </p>
                      </div>

                      {/* Add / Setup Provider Dropdown Button */}
                      <div className="flex items-center gap-2">
                        <select
                          className="h-8 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-medium px-2.5 cursor-pointer transition shadow-xs"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setActiveConfigProvider(e.target.value as any);
                            }
                          }}
                        >
                          <option value="" disabled>+ Add / Configure Provider...</option>
                          <option value="ollama">Ollama (Local / Private)</option>
                          <option value="openai">OpenAI (GPT-4o / DALL-E)</option>
                          <option value="gemini">Google Gemini</option>
                          <option value="typesafe">TypeSafe AI (Jev)</option>
                          <option value="image">AI Image Generation</option>
                        </select>
                      </div>
                    </div>

                    {/* Active Engine Card */}
                    <div className="p-3.5 rounded-xl border border-border bg-card/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Active Default AI Engine</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Primary model used for assistant responses and canvas reasoning.</div>
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

                    {/* Provider Quick Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Ollama Card */}
                      <div className="p-3.5 rounded-xl border border-border/80 bg-card/50 flex flex-col justify-between gap-3 shadow-2xs hover:border-border transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                              <Bot className="size-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                <span>Ollama</span>
                                <span className={`size-1.5 rounded-full ${ollamaEnabled ? "bg-emerald-500" : "bg-zinc-400"}`} />
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{ollamaModelDraft || "Local default"}</div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setActiveConfigProvider("ollama")}
                            className="text-[11px] h-7 px-2"
                          >
                            Configure
                          </Button>
                        </div>
                      </div>

                      {/* OpenAI Card */}
                      <div className="p-3.5 rounded-xl border border-border/80 bg-card/50 flex flex-col justify-between gap-3 shadow-2xs hover:border-border transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                              <Sparkles className="size-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                <span>OpenAI</span>
                                <span className={`size-1.5 rounded-full ${openaiEnabled ? "bg-emerald-500" : "bg-zinc-400"}`} />
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{openaiModelDraft || "gpt-4o-mini"}</div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setActiveConfigProvider("openai")}
                            className="text-[11px] h-7 px-2"
                          >
                            Configure
                          </Button>
                        </div>
                      </div>

                      {/* Gemini Card */}
                      <div className="p-3.5 rounded-xl border border-border/80 bg-card/50 flex flex-col justify-between gap-3 shadow-2xs hover:border-border transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                              <Zap className="size-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                <span>Google Gemini</span>
                                <span className={`size-1.5 rounded-full ${geminiEnabled ? "bg-emerald-500" : "bg-zinc-400"}`} />
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{geminiModelDraft || "gemini-1.5-flash"}</div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setActiveConfigProvider("gemini")}
                            className="text-[11px] h-7 px-2"
                          >
                            Configure
                          </Button>
                        </div>
                      </div>

                      {/* TypeSafe Card */}
                      <div className="p-3.5 rounded-xl border border-border/80 bg-card/50 flex flex-col justify-between gap-3 shadow-2xs hover:border-border transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                              <Target className="size-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                <span>TypeSafe AI</span>
                                <span className={`size-1.5 rounded-full ${typesafeEnabled ? "bg-emerald-500" : "bg-zinc-400"}`} />
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">System One Jev engine</div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setActiveConfigProvider("typesafe")}
                            className="text-[11px] h-7 px-2"
                          >
                            Configure
                          </Button>
                        </div>
                      </div>

                      {/* Image Generation Card */}
                      <div className="p-3.5 rounded-xl border border-border/80 bg-card/50 flex flex-col justify-between gap-3 shadow-2xs hover:border-border transition sm:col-span-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-500">
                              <ImageIcon className="size-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                <span>AI Image Generation</span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-pink-500/10 text-pink-600 dark:text-pink-400 uppercase">
                                  {imageProviderDraft}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Model: {imageModelDraft} · Spawns interactive ImageNode on canvas via /image
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setActiveConfigProvider("image")}
                            className="text-[11px] h-7 px-2"
                          >
                            Configure
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* GitHub Source Sync Box */}
                    <div className="rounded-xl border border-border/80 bg-card/50 p-4 space-y-3 shadow-2xs mt-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg ${githubTokenDraft.trim() ? "bg-purple-500/15 text-purple-600 dark:text-purple-400" : "bg-muted text-muted-foreground"}`}>
                            <GitPullRequest className="size-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-foreground">GitHub Integration</div>
                            <div className="text-[10px] text-muted-foreground">Import issues and link PRs to spatial cards</div>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {githubTokenDraft.trim() ? "Configured" : "Optional"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="relative flex items-center">
                          <Input
                            inputSize="sm"
                            type={showGithubToken ? "text" : "password"}
                            placeholder="ghp_... or github_pat_..."
                            value={githubTokenDraft}
                            onChange={(e) => setGithubTokenDraft(e.target.value)}
                            onBlur={() => void persistGithubToken()}
                            className="pr-9 font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGithubToken((prev) => !prev)}
                            className="absolute right-2 text-muted-foreground hover:text-foreground p-1 rounded"
                            tabIndex={-1}
                          >
                            {showGithubToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={testingGithub || !githubTokenDraft.trim()}
                            onClick={() => void handleTestGithub()}
                            className="h-7 text-xs"
                          >
                            {testingGithub ? "Verifying..." : "Test GitHub Token"}
                          </Button>
                          {githubTokenStatus && (
                            <span className={`text-xs ${githubTokenStatus.startsWith("Connected") ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive"}`}>
                              {githubTokenStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {tab === "agents" || tab === "mcp" ? (
              <div className="flex flex-col gap-8">
                <Section title="Agent Profiles & Autonomous Skills">
                  <AgentsSettingsTab />
                </Section>
                <div className="h-px w-full bg-border/60" />
                <Section title="Model Context Protocol (MCP) Tool Servers">
                  <McpSettingsTab />
                </Section>
              </div>
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

        {/* Sticky Actions Footer */}
        <div className="flex items-center justify-between border-t border-border/70 bg-card/70 px-6 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs">
            {saveSuccessNotification ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
                <Check className="size-4" />
                <span>Settings saved successfully</span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                Click Update to save all configured parameters
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => void handleSaveAllChanges()}
              disabled={isSaving}
              className="gap-1.5 min-w-[95px] font-medium"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  <span>Update</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { AppSettings } from "@/lib/appSettings";
import { DEFAULT_APP_SETTINGS, mergeAppSettings } from "@/lib/appSettings";
import {
  replaceCachedAppSettings,
} from "@/lib/appSettingsCache";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type FocusAppSettingsContextValue = {
  settings: AppSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<{
    ok: boolean;
    error?: string;
  }>;
};

const FocusAppSettingsContext = createContext<FocusAppSettingsContextValue | null>(
  null,
);

/** Keys of providers removed in v0.14; purged so their secrets don't linger in localStorage. */
const REMOVED_LOCAL_KEYS = ["foqz_typesafe_api_key", "foqz_typesafe_base_url", "foqz_gemini_api_key"];

function mirrorSettingsToLocalStorage(next: AppSettings) {
  localStorage.setItem("foqz_app_settings", JSON.stringify(next));
  if (next.openaiApiKey) {
    localStorage.setItem("foqz_openai_api_key", next.openaiApiKey);
  }
  for (const key of REMOVED_LOCAL_KEYS) localStorage.removeItem(key);
}

export function FocusAppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = localStorage.getItem("foqz_app_settings");
        if (raw) return mergeAppSettings(JSON.parse(raw));
      } catch {}
    }
    return DEFAULT_APP_SETTINGS;
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const api = window.focusStore?.getSettings;
    if (!api) {
      let initial = DEFAULT_APP_SETTINGS;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const raw = localStorage.getItem("foqz_app_settings");
          if (raw) initial = mergeAppSettings(JSON.parse(raw));
        } catch {}
      }
      replaceCachedAppSettings(initial);
      setSettings(initial);
      setLoading(false);
      return;
    }
    try {
      const next = await api();
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          mirrorSettingsToLocalStorage(next);
        } catch {}
      }
      replaceCachedAppSettings(next);
      setSettings(next);
    } catch {
      let fallback = DEFAULT_APP_SETTINGS;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const raw = localStorage.getItem("foqz_app_settings");
          if (raw) fallback = mergeAppSettings(JSON.parse(raw));
        } catch {}
      }
      replaceCachedAppSettings(fallback);
      setSettings(fallback);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(
    async (partial: Partial<AppSettings>) => {
      const api = window.focusStore?.setSettings;
      if (!api) {
        const merged = mergeAppSettings({ ...settings, ...partial });
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            mirrorSettingsToLocalStorage(merged);
          } catch {}
        }
        replaceCachedAppSettings(merged);
        setSettings(merged);
        return { ok: true as const };
      }
      const res = await api(partial);
      if ("settings" in res && res.settings) {
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            mirrorSettingsToLocalStorage(res.settings);
          } catch {}
        }
        replaceCachedAppSettings(res.settings);
        setSettings(res.settings);
      }
      if (res.ok) return { ok: true as const };
      return {
        ok: false as const,
        error: "error" in res ? res.error : "Could not save settings",
      };
    },
    [settings],
  );

  const value = useMemo(
    () => ({ settings, loading, refresh, update }),
    [settings, loading, refresh, update],
  );

  return (
    <FocusAppSettingsContext.Provider value={value}>
      {children}
    </FocusAppSettingsContext.Provider>
  );
}

export function useFocusAppSettings() {
  const ctx = useContext(FocusAppSettingsContext);
  if (!ctx) {
    throw new Error("useFocusAppSettings must be used within FocusAppSettingsProvider");
  }
  return ctx;
}

/** For shape components that may render outside the provider in tests — returns defaults. */
export function useFocusAppSettingsOptional() {
  return useContext(FocusAppSettingsContext);
}

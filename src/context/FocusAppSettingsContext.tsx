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
          localStorage.setItem("foqz_app_settings", JSON.stringify(next));
          if (next.typesafeApiKey) {
            localStorage.setItem("foqz_typesafe_api_key", next.typesafeApiKey);
          }
          if (next.typesafeBaseUrl) {
            localStorage.setItem("foqz_typesafe_base_url", next.typesafeBaseUrl);
          }
          if (next.openaiApiKey) {
            localStorage.setItem("foqz_openai_api_key", next.openaiApiKey);
          }
          if (next.geminiApiKey) {
            localStorage.setItem("foqz_gemini_api_key", next.geminiApiKey);
          }
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
            localStorage.setItem("foqz_app_settings", JSON.stringify(merged));
            if (merged.typesafeApiKey) {
              localStorage.setItem("foqz_typesafe_api_key", merged.typesafeApiKey);
            }
            if (merged.typesafeBaseUrl) {
              localStorage.setItem("foqz_typesafe_base_url", merged.typesafeBaseUrl);
            }
            if (merged.openaiApiKey) {
              localStorage.setItem("foqz_openai_api_key", merged.openaiApiKey);
            }
            if (merged.geminiApiKey) {
              localStorage.setItem("foqz_gemini_api_key", merged.geminiApiKey);
            }
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
            localStorage.setItem("foqz_app_settings", JSON.stringify(res.settings));
            if (res.settings.typesafeApiKey) {
              localStorage.setItem("foqz_typesafe_api_key", res.settings.typesafeApiKey);
            }
            if (res.settings.typesafeBaseUrl) {
              localStorage.setItem("foqz_typesafe_base_url", res.settings.typesafeBaseUrl);
            }
            if (res.settings.openaiApiKey) {
              localStorage.setItem("foqz_openai_api_key", res.settings.openaiApiKey);
            }
            if (res.settings.geminiApiKey) {
              localStorage.setItem("foqz_gemini_api_key", res.settings.geminiApiKey);
            }
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

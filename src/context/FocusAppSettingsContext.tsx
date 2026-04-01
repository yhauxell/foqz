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
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const api = window.focusStore?.getSettings;
    if (!api) {
      replaceCachedAppSettings(DEFAULT_APP_SETTINGS);
      setSettings(DEFAULT_APP_SETTINGS);
      setLoading(false);
      return;
    }
    try {
      const next = await api();
      replaceCachedAppSettings(next);
      setSettings(next);
    } catch {
      replaceCachedAppSettings(DEFAULT_APP_SETTINGS);
      setSettings(DEFAULT_APP_SETTINGS);
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
        replaceCachedAppSettings(merged);
        setSettings(merged);
        return { ok: true as const };
      }
      const res = await api(partial);
      if ("settings" in res && res.settings) {
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

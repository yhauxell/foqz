import {
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
} from "./appSettings";

function getInitialCached(): AppSettings {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("foqz_app_settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        return mergeAppSettings(parsed);
      }
      const localKey = localStorage.getItem("foqz_typesafe_api_key");
      if (localKey) {
        return mergeAppSettings({
          ...DEFAULT_APP_SETTINGS,
          typesafeApiKey: localKey,
        });
      }
    } catch {}
  }
  return { ...DEFAULT_APP_SETTINGS };
}

let cached: AppSettings = getInitialCached();

export function getCachedAppSettings(): AppSettings {
  return cached;
}

export function replaceCachedAppSettings(settings: AppSettings) {
  cached = mergeAppSettings(settings);
}

export function patchCachedAppSettings(partial: Partial<AppSettings>) {
  cached = mergeAppSettings({ ...cached, ...partial });
}

export function resetCachedAppSettingsToDefaults() {
  cached = mergeAppSettings({});
}

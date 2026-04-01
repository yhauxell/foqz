import {
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
} from "./appSettings";

let cached: AppSettings = { ...DEFAULT_APP_SETTINGS };

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

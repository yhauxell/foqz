import type { AppSettings } from "./lib/appSettings";

export {};

declare global {
  interface Window {
    focusStore?: {
      loadSnapshot: () => Promise<unknown>;
      saveSnapshot: (
        snapshot: unknown,
      ) => Promise<{ ok: boolean; error?: string }>;
      setTrayTooltip?: (text: string) => Promise<void>;
      getSettings?: () => Promise<AppSettings>;
      setSettings?: (
        partial: Partial<AppSettings>,
      ) => Promise<
        | { ok: true; settings: AppSettings }
        | { ok: false; error?: string; settings: AppSettings }
      >;
      exportBoardToFile?: (
        snapshot: unknown,
      ) => Promise<
        { ok: true } | { ok: false; error?: string; canceled?: boolean }
      >;
      importBoardFromFile?: () => Promise<
        | { ok: true; snapshot: unknown }
        | { ok: false; error?: string; canceled?: boolean }
      >;
      clearBoardFile?: () => Promise<{ ok: boolean; error?: string }>;
      /** Electron: run before exit so timers can be stopped and the board saved. */
      onPrepareShutdown?: (handler: () => void | Promise<void>) => () => void;
    };
  }
}

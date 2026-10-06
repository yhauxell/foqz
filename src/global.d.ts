import type { AppSettings } from "./lib/appSettings";
import type { McpStoreApi } from "./lib/mcpTypes";

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
      openExternal?: (url: string) => Promise<boolean>;
      fetchOgMetadata?: (url: string) => Promise<{
        url: string;
        title: string;
        description: string;
        image: string | null;
        siteName: string;
      } | null>;
      toggleMaximize?: () => Promise<boolean>;
      isMaximized?: () => Promise<boolean>;
      onMaximizedChange?: (callback: (isMaximized: boolean) => void) => () => void;
      /** MCP client manager & transport supervisor API */
      mcp?: McpStoreApi;
      /** TypeSafe Jev System One IPC bridge */
      jev?: {
        evaluate: (
          req: unknown,
          options?: { apiKey?: string; baseUrl?: string },
        ) => Promise<unknown>;
      };
      /** Auto-updater API */
      updater?: {
        check: () => Promise<{ ok: boolean; status?: string; error?: string; updateInfo?: any }>;
        getState: () => Promise<UpdaterState>;
        quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
        onStatusChange: (callback: (state: UpdaterState) => void) => () => void;
      };
      getAppVersion?: () => Promise<{ version: string; isPackaged: boolean }>;
      /** Electron: run before exit so timers can be stopped and the board saved. */
      onPrepareShutdown?: (handler: () => void | Promise<void>) => () => void;
    };
    electron?: {
      openExternal: (url: string) => Promise<boolean>;
    };
  }

  export type UpdaterState = {
    status:
      | 'idle'
      | 'checking'
      | 'available'
      | 'not-available'
      | 'downloading'
      | 'downloaded'
      | 'error'
      | 'dev-mode';
    currentVersion: string;
    isPackaged?: boolean;
    updateInfo?: {
      version: string;
      releaseDate?: string;
      releaseName?: string;
      releaseNotes?: string;
      [key: string]: any;
    } | null;
    error?: string | null;
    progress?: {
      percent: number;
      bytesPerSecond?: number;
      transferred?: number;
      total?: number;
    } | null;
    lastChecked?: string | null;
  };
}

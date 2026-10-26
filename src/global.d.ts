import type { AppSettings } from "./lib/appSettings";
import type { McpHostApi, McpStoreApi } from "./lib/mcpTypes";
import type { LogbookDay, LogbookEntry } from "./types/logbook";
import type { PendingReminder } from "./lib/reminders";
import type { ClaudeCodeDetectResult } from "./lib/claudeCode";

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
      /** Embedded Foqz MCP server for external agents */
      mcpHost?: McpHostApi;
      /** Local Claude Code CLI, run from main (see electron/claudeCode.cjs) */
      claudeCode?: {
        detect: () => Promise<ClaudeCodeDetectResult>;
        run: (req: { requestId: string; prompt: string; systemPrompt?: string }) => Promise<{ ok: boolean; error?: string }>;
        cancel: (requestId: string) => Promise<boolean>;
        onLine: (callback: (payload: { requestId: string; line: string }) => void) => () => void;
        onExit: (
          callback: (payload: { requestId: string; code: number | null; signal: string | null; stderr: string }) => void,
        ) => () => void;
      };
      /** Element reminders, scheduled in main so they ring while the window is hidden */
      reminders?: {
        set: (list: PendingReminder[]) => void;
        onFired: (callback: (nodeId: string) => void) => () => void;
        onOpen: (callback: (nodeId: string) => void) => () => void;
      };
      /** Auto-updater API */
      updater?: {
        check: () => Promise<{ ok: boolean; status?: string; error?: string; updateInfo?: any }>;
        getState: () => Promise<UpdaterState>;
        quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
        onStatusChange: (callback: (state: UpdaterState) => void) => () => void;
      };
      getAppVersion?: () => Promise<{ version: string; isPackaged: boolean }>;
      /** Logbook persistence & query API */
      logbook?: {
        append: (payload: {
          workdayId: string;
          window?: { startMin: number; endMin: number };
          entries: LogbookEntry[];
          summary?: string;
        }) => Promise<{ ok: boolean; sweptCount?: number; workdayId?: string; error?: string }>;
        listDays: (opts?: { limitMonths?: number }) => Promise<LogbookDay[]>;
        getEntriesByIds: (ids: string[]) => Promise<LogbookEntry[]>;
        removeEntry: (entryId: string) => Promise<{ ok: boolean; removedEntry?: LogbookEntry; error?: string }>;
        search: (query: string) => Promise<Array<LogbookEntry & { workdayId: string }>>;
      };
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

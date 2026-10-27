import type {
  BoardMeta,
  BoardSnapshot,
  CanvasStorageAdapter,
} from "@/types/storage";
import {
  ACTIVE_BOARD_KEY,
  BOARD_NAME_KEY,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  GITHUB_TOKEN_KEY,
  getBoardBackupKey,
  getBoardStorageKey,
  STORAGE_BOARDS_KEY,
} from "@/lib/storage/keys";
import { normalizeBoardSnapshot } from "@/lib/storage/snapshot";
import { migrateBoardSnapshot } from "@/lib/storage/migrate";
import { reportSaveError, reportSaveOk, reportUnreadable } from "@/lib/storage/health";

/** Raw data of a board that could not be read, kept so the next save doesn't destroy it. */
export function getUnreadableBoardKey(boardId: string): string {
  return `foqz_board_unreadable:${boardId}`;
}

/** Parse stored board JSON: a snapshot, null when nothing is stored, or "invalid". */
export function parseStoredBoard(raw: string | null | undefined): BoardSnapshot | null | "invalid" {
  if (!raw) return null;
  try {
    return normalizeBoardSnapshot(JSON.parse(raw), { migrate: false }) ?? "invalid";
  } catch {
    return "invalid";
  }
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Access can throw in sandboxed / privacy modes.
  }
  return null;
}

/**
 * localStorage-backed {@link CanvasStorageAdapter}.
 *
 * Exposes both the async adapter contract and sync helpers so the Zustand
 * store can keep its synchronous module-init / switchBoard paths without
 * changing boot semantics.
 */
export class LocalStorageAdapter implements CanvasStorageAdapter {
  protected readonly storage: Storage | null;
  protected readonly unreadableIds = new Set<string>();

  constructor(storage?: Storage | null) {
    this.storage = resolveStorage(storage);
  }

  // --- async CanvasStorageAdapter ---

  async listBoards(): Promise<BoardMeta[]> {
    return this.listBoardsSync();
  }

  async saveBoardCatalog(boards: BoardMeta[]): Promise<void> {
    this.saveBoardCatalogSync(boards);
  }

  async getActiveBoardId(): Promise<string | null> {
    return this.getActiveBoardIdSync();
  }

  async setActiveBoardId(boardId: string, displayName?: string): Promise<void> {
    this.setActiveBoardIdSync(boardId, displayName);
  }

  async loadBoard(boardId: string): Promise<BoardSnapshot | null> {
    return this.loadBoardSync(boardId);
  }

  async saveBoard(boardId: string, snapshot: BoardSnapshot): Promise<void> {
    this.saveBoardSync(boardId, snapshot);
  }

  async deleteBoard(boardId: string): Promise<void> {
    this.deleteBoardSync(boardId);
  }

  // --- sync helpers (Phase 1 store wiring) ---

  listBoardsSync(): BoardMeta[] {
    try {
      const raw = this.storage?.getItem(STORAGE_BOARDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(isBoardMeta);
        }
      }
      const initialName =
        this.storage?.getItem(BOARD_NAME_KEY) || DEFAULT_BOARD_NAME;
      return [
        {
          id: DEFAULT_BOARD_ID,
          name: initialName,
          createdAt: Date.now(),
        },
      ];
    } catch {
      return [
        {
          id: DEFAULT_BOARD_ID,
          name: DEFAULT_BOARD_NAME,
          createdAt: Date.now(),
        },
      ];
    }
  }

  saveBoardCatalogSync(boards: BoardMeta[]): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_BOARDS_KEY, JSON.stringify(boards));
    } catch (err) {
      console.warn("Failed to save board catalog:", err);
    }
  }

  getActiveBoardIdSync(): string | null {
    try {
      return this.storage?.getItem(ACTIVE_BOARD_KEY) ?? null;
    } catch {
      return null;
    }
  }

  resolveActiveBoardIdSync(boards: BoardMeta[]): string {
    const active = this.getActiveBoardIdSync();
    if (active && boards.some((b) => b.id === active)) return active;
    return boards[0]?.id || DEFAULT_BOARD_ID;
  }

  setActiveBoardIdSync(boardId: string, displayName?: string): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(ACTIVE_BOARD_KEY, boardId);
      if (displayName !== undefined) {
        this.storage.setItem(BOARD_NAME_KEY, displayName);
      }
    } catch (err) {
      console.warn("Failed to set active board id:", err);
    }
  }

  loadBoardSync(boardId: string): BoardSnapshot | null {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(getBoardStorageKey(boardId)) ?? null;
    } catch (err) {
      console.warn("Failed to load board snapshot:", err);
      return null;
    }
    const parsed = parseStoredBoard(raw);
    if (parsed === "invalid") {
      this.keepUnreadable(boardId, raw!);
      return null;
    }
    if (!parsed) return null;
    return this.migrateOnLoad(boardId, raw!, parsed).snapshot;
  }

  /** True when the board's stored data could not be read this session. */
  isUnreadable(boardId: string): boolean {
    return this.unreadableIds.has(boardId);
  }

  /**
   * Keep data that could not be read under a separate key, so the empty board shown instead
   * doesn't overwrite it, and tell the UI.
   */
  protected keepUnreadable(boardId: string, raw: string): void {
    this.unreadableIds.add(boardId);
    let keptAt: string | null = null;
    try {
      this.storage?.setItem(getUnreadableBoardKey(boardId), raw);
      keptAt = `browser storage (${getUnreadableBoardKey(boardId)})`;
    } catch (err) {
      console.warn("Failed to keep unreadable board data:", err);
    }
    reportUnreadable({ boardId, keptAt });
  }

  /** Earlier versions of a board, newest first. Only the disk adapter keeps them. */
  async listBackups(_boardId: string): Promise<BoardBackup[]> {
    return [];
  }

  /** Read one backup. Only the disk adapter keeps them. */
  async readBackup(_boardId: string, _backupId: string): Promise<BoardSnapshot | null> {
    return null;
  }

  /** Make the next save of this board keep the version it replaces as a backup. */
  backupBeforeNextSave(_boardId: string): void {}

  /** Resolves when every save started so far has been written. */
  async whenIdle(): Promise<void> {}

  /**
   * Upgrade an older snapshot in place. The raw JSON is copied to a backup key
   * first (never overwritten), so a bad migration can be recovered by hand.
   */
  protected migrateOnLoad(
    boardId: string,
    raw: string,
    snapshot: BoardSnapshot,
  ): { snapshot: BoardSnapshot; changed: boolean } {
    const result = migrateBoardSnapshot(snapshot);
    if (!result.changed || !this.storage) return result;
    try {
      const backupKey = getBoardBackupKey(boardId, snapshot.version);
      if (this.storage.getItem(backupKey) === null) {
        this.storage.setItem(backupKey, raw);
      }
      if (result.strippedGithubToken && !this.storage.getItem(GITHUB_TOKEN_KEY)) {
        this.storage.setItem(GITHUB_TOKEN_KEY, result.strippedGithubToken);
      }
      this.storage.setItem(getBoardStorageKey(boardId), JSON.stringify(result.snapshot));
    } catch (err) {
      console.warn("Failed to persist migrated board snapshot:", err);
    }
    return result;
  }

  saveBoardSync(boardId: string, snapshot: BoardSnapshot): void {
    if (!this.storage) return;
    try {
      const key = getBoardStorageKey(boardId);
      this.storage.setItem(key, JSON.stringify(snapshot));
      reportSaveOk();
    } catch (err) {
      // Usually the storage quota; without a disk copy this means nothing is being saved.
      reportSaveError(err);
    }
  }

  deleteBoardSync(boardId: string): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(getBoardStorageKey(boardId));
    } catch (err) {
      console.warn("Failed to delete board snapshot:", err);
    }
  }
}

export interface BoardBackup {
  id: string;
  /** Epoch ms when the backed-up version was replaced. */
  at: number;
  bytes: number;
}

export function isBoardMeta(value: unknown): value is BoardMeta {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.createdAt === "number"
  );
}

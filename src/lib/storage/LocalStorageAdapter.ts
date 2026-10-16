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
  getBoardStorageKey,
  STORAGE_BOARDS_KEY,
} from "@/lib/storage/keys";
import { normalizeBoardSnapshot } from "@/lib/storage/snapshot";

export interface StorageWriteOptions {
  /** When false, listeners such as cloud sync are not notified. */
  notify?: boolean;
}

export type StorageMutation =
  | { type: "save"; boardId: string; snapshot: BoardSnapshot }
  | { type: "delete"; boardId: string }
  | { type: "catalog"; boards: BoardMeta[] };

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
  private readonly storage: Storage | null;
  private readonly mutationListeners = new Set<(event: StorageMutation) => void>();

  constructor(storage?: Storage | null) {
    this.storage = resolveStorage(storage);
  }

  subscribeMutations(listener: (event: StorageMutation) => void): () => void {
    this.mutationListeners.add(listener);
    return () => {
      this.mutationListeners.delete(listener);
    };
  }

  private emit(event: StorageMutation, options?: StorageWriteOptions): void {
    if (options?.notify === false) return;
    for (const listener of this.mutationListeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn("Storage listener failed:", err);
      }
    }
  }

  // --- async CanvasStorageAdapter ---

  async listBoards(): Promise<BoardMeta[]> {
    return this.listBoardsSync();
  }

  async saveBoardCatalog(boards: BoardMeta[], options?: StorageWriteOptions): Promise<void> {
    this.saveBoardCatalogSync(boards, options);
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

  async saveBoard(
    boardId: string,
    snapshot: BoardSnapshot,
    options?: StorageWriteOptions
  ): Promise<void> {
    this.saveBoardSync(boardId, snapshot, options);
  }

  async deleteBoard(boardId: string, options?: StorageWriteOptions): Promise<void> {
    this.deleteBoardSync(boardId, options);
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

  saveBoardCatalogSync(boards: BoardMeta[], options?: StorageWriteOptions): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_BOARDS_KEY, JSON.stringify(boards));
      this.emit({ type: "catalog", boards }, options);
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
    try {
      const key = getBoardStorageKey(boardId);
      const raw = this.storage?.getItem(key);
      if (!raw) return null;
      return normalizeBoardSnapshot(JSON.parse(raw));
    } catch (err) {
      console.warn("Failed to load board snapshot:", err);
      return null;
    }
  }

  saveBoardSync(boardId: string, snapshot: BoardSnapshot, options?: StorageWriteOptions): void {
    if (!this.storage) return;
    try {
      const key = getBoardStorageKey(boardId);
      this.storage.setItem(key, JSON.stringify(snapshot));
      this.emit({ type: "save", boardId, snapshot }, options);
    } catch (err) {
      console.warn("Failed to save board snapshot:", err);
    }
  }

  deleteBoardSync(boardId: string, options?: StorageWriteOptions): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(getBoardStorageKey(boardId));
      this.emit({ type: "delete", boardId }, options);
    } catch (err) {
      console.warn("Failed to delete board snapshot:", err);
    }
  }
}

function isBoardMeta(value: unknown): value is BoardMeta {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.createdAt === "number"
  );
}

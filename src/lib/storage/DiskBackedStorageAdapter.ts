import type { BoardMeta, BoardSnapshot } from "@/types/storage";
import { getBoardStorageKey, STORAGE_BOARDS_KEY } from "@/lib/storage/keys";
import { normalizeBoardSnapshot } from "@/lib/storage/snapshot";
import { reportSaveError, reportSaveOk, reportUnreadable } from "@/lib/storage/health";
import {
  isBoardMeta,
  LocalStorageAdapter,
  parseStoredBoard,
  type BoardBackup,
} from "@/lib/storage/LocalStorageAdapter";

type DiskResult<T = void> = { ok: true; value?: T } | { ok: false; error?: string };

/** Board file API exposed by the Electron preload (`window.focusStore.boards`). */
export interface DiskBoardBackend {
  readSync(boardId: string): { ok: boolean; raw?: string | null; error?: string };
  readCatalogSync(): { ok: boolean; raw?: string | null; error?: string };
  locationSync(): string;
  write(boardId: string, json: string, options?: { forceBackup?: boolean }): Promise<DiskResult>;
  writeCatalog(json: string): Promise<DiskResult>;
  remove(boardId: string): Promise<DiskResult>;
  listBackups(boardId: string): Promise<DiskResult<BoardBackup[]>>;
  readBackup(boardId: string, backupId: string): Promise<DiskResult<string>>;
  keepUnreadable(boardId: string, raw: string): Promise<DiskResult<string>>;
  revealUnreadable(): Promise<unknown>;
}

const isNewer = (a: BoardSnapshot, b: BoardSnapshot) =>
  a.updatedAt !== b.updatedAt ? a.updatedAt > b.updatedAt : a.revision > b.revision;

/**
 * Boards as files on disk (written atomically by the main process, with rolling backups), with
 * localStorage kept as a cache. Loading picks the newer of the two, so either can be lost; saving
 * writes both, and only a failed disk write counts as a failed save.
 *
 * Only this renderer writes the files, so a board read or saved once is served from memory after
 * that: the debounced autosave asks for the previous snapshot on every save.
 */
export class DiskBackedStorageAdapter extends LocalStorageAdapter {
  private readonly loaded = new Map<string, BoardSnapshot>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly forceBackup = new Set<string>();

  constructor(
    private readonly disk: DiskBoardBackend,
    storage?: Storage | null,
  ) {
    super(storage);
  }

  // --- catalog ---

  listBoardsSync(): BoardMeta[] {
    if (this.readCache(STORAGE_BOARDS_KEY)) {
      const boards = super.listBoardsSync();
      if (!this.readDisk(() => this.disk.readCatalogSync())) this.writeCatalogToDisk(boards);
      return boards;
    }
    const raw = this.readDisk(() => this.disk.readCatalogSync());
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const boards = Array.isArray(parsed) ? parsed.filter(isBoardMeta) : [];
        if (boards.length > 0) {
          super.saveBoardCatalogSync(boards);
          return boards;
        }
      } catch (err) {
        console.warn("Board catalog on disk could not be read:", err);
      }
    }
    const boards = super.listBoardsSync();
    // A new profile: write the default list so the boards folder is complete on its own.
    if (!raw) this.writeCatalogToDisk(boards);
    return boards;
  }

  saveBoardCatalogSync(boards: BoardMeta[]): void {
    super.saveBoardCatalogSync(boards);
    this.writeCatalogToDisk(boards);
  }

  // --- boards ---

  loadBoardSync(boardId: string): BoardSnapshot | null {
    const known = this.loaded.get(boardId);
    if (known) return known;

    const key = getBoardStorageKey(boardId);
    const sources = [
      { from: "cache" as const, raw: this.readCache(key) },
      { from: "disk" as const, raw: this.readDisk(() => this.disk.readSync(boardId)) },
    ].map((s) => ({ ...s, parsed: parseStoredBoard(s.raw) }));

    // Keep anything unreadable before it can be replaced.
    for (const s of sources) {
      if (s.parsed === "invalid") void this.disk.keepUnreadable(boardId, s.raw!);
    }

    let best: (typeof sources)[number] | null = null;
    for (const s of sources) {
      if (!s.parsed || s.parsed === "invalid") continue;
      if (!best || isNewer(s.parsed, best.parsed as BoardSnapshot)) best = s;
    }
    if (!best) {
      if (sources.some((s) => s.parsed === "invalid")) this.markUnreadable(boardId);
      return null;
    }

    const { snapshot, changed } = this.migrateOnLoad(boardId, best.raw!, best.parsed as BoardSnapshot);
    this.loaded.set(boardId, snapshot);
    const disk = sources[1].parsed;
    const diskIsCurrent = disk && disk !== "invalid" && !isNewer(snapshot, disk) && !changed;
    if (best.from === "disk" && !changed) this.writeCache(key, best.raw!);
    // First run with disk storage, a newer cache, or a migration: bring the file up to date. A
    // migration keeps the replaced file as a backup.
    if (!diskIsCurrent) this.queueDiskWrite(boardId, JSON.stringify(snapshot), changed);
    return snapshot;
  }

  saveBoardSync(boardId: string, snapshot: BoardSnapshot): void {
    this.loaded.set(boardId, snapshot);
    const json = JSON.stringify(snapshot);
    // The cache can fail (quota) without losing anything while the disk write succeeds.
    this.writeCache(getBoardStorageKey(boardId), json);
    this.queueDiskWrite(boardId, json, this.forceBackup.delete(boardId));
  }

  deleteBoardSync(boardId: string): void {
    super.deleteBoardSync(boardId);
    this.loaded.delete(boardId);
    void this.disk.remove(boardId).then((res) => {
      if (!res.ok) console.warn("Failed to delete board file:", res.error);
    });
  }

  // --- backups ---

  async listBackups(boardId: string): Promise<BoardBackup[]> {
    const res = await this.disk.listBackups(boardId);
    if (!res.ok) throw new Error(res.error || "Could not list backups");
    return res.value ?? [];
  }

  async readBackup(boardId: string, backupId: string): Promise<BoardSnapshot | null> {
    const res = await this.disk.readBackup(boardId, backupId);
    if (!res.ok) throw new Error(res.error || "Could not read backup");
    try {
      return normalizeBoardSnapshot(JSON.parse(res.value ?? ""));
    } catch {
      return null;
    }
  }

  backupBeforeNextSave(boardId: string): void {
    this.forceBackup.add(boardId);
  }

  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending.values()]);
  }

  // --- internals ---

  protected keepUnreadable(boardId: string, raw: string): void {
    void this.disk.keepUnreadable(boardId, raw);
    this.markUnreadable(boardId);
  }

  private markUnreadable(boardId: string) {
    let location: string | null = null;
    try {
      location = `${this.disk.locationSync()}/unreadable`;
    } catch {}
    this.unreadableIds.add(boardId);
    reportUnreadable({ boardId, keptAt: location });
  }

  private queueDiskWrite(boardId: string, json: string, forceBackup: boolean) {
    const write = this.disk
      .write(boardId, json, forceBackup ? { forceBackup } : undefined)
      .then((res) => (res.ok ? reportSaveOk() : reportSaveError(res.error || "Could not write board file")))
      .catch(reportSaveError)
      .finally(() => {
        if (this.pending.get(boardId) === write) this.pending.delete(boardId);
      });
    this.pending.set(boardId, write);
  }

  private writeCatalogToDisk(boards: BoardMeta[]) {
    void this.disk
      .writeCatalog(JSON.stringify(boards))
      .then((res) => {
        if (!res.ok) reportSaveError(res.error || "Could not write board list");
      })
      .catch(reportSaveError);
  }

  private readCache(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private writeCache(key: string, json: string) {
    try {
      this.storage?.setItem(key, json);
    } catch (err) {
      console.warn("Board cache not updated (the file on disk is):", err);
    }
  }

  private readDisk(read: () => { ok: boolean; raw?: string | null; error?: string }): string | null {
    try {
      const res = read();
      if (!res.ok) console.warn("Board file could not be read:", res.error);
      return res.ok ? res.raw ?? null : null;
    } catch (err) {
      console.warn("Board file could not be read:", err);
      return null;
    }
  }
}

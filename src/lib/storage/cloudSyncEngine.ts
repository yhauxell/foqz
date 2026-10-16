import { cloudErrorMessage, CloudConflictError, isOfflineError } from "@/lib/pocketbase/errors";
import { boardFingerprint } from "@/lib/storage/fingerprint";
import { sameViewport } from "@/lib/storage/snapshot";
import type { RemoteBoardEvent } from "@/lib/storage/PocketBaseStorageAdapter";
import type { StorageMutation } from "@/lib/storage/LocalStorageAdapter";
import type { BoardMeta, BoardSnapshot } from "@/types/storage";

export type CloudPhase = "signed-out" | "syncing" | "saved" | "offline" | "error";

export interface CloudSyncDeps {
  debounceMs: number;
  isOnline: () => boolean;
  isAuthenticated: () => boolean;
  saveBoard: (boardId: string, snapshot: BoardSnapshot, name?: string) => Promise<void>;
  /** User chose this device over a newer or diverged cloud board. */
  keepLocal: (boardId: string, snapshot: BoardSnapshot, name?: string) => Promise<BoardSnapshot>;
  deleteBoard: (boardId: string) => Promise<void>;
  saveCatalog: (boards: BoardMeta[]) => Promise<void>;
  listRemote: () => Promise<BoardMeta[]>;
  loadRemote: (boardId: string) => Promise<BoardSnapshot | null>;
  acknowledge: (boardId: string, revision: number) => void;
  subscribeRemote: (handler: (event: RemoteBoardEvent) => void) => Promise<() => void>;
  readLocalSnapshot: (boardId: string) => BoardSnapshot | null;
  listLocalBoards: () => BoardMeta[];
  boardName: (boardId: string) => string | undefined;
  /** Fingerprint of the open canvas, or null when `boardId` is not the active board. */
  memoryFingerprint: (boardId: string) => string | null;
  applyToCanvas: (boardId: string, snapshot: BoardSnapshot) => void;
  /** Persist a snapshot without replacing the open canvas or re-queueing a save. */
  writeLocalSnapshot: (boardId: string, snapshot: BoardSnapshot) => void;
  replaceLocalCatalog: (boards: BoardMeta[]) => void;
  removeLocalBoard: (boardId: string) => void;
  onStatus: (phase: CloudPhase, detail: string | null, conflict?: boolean) => void;
  schedule?: (fn: () => void | Promise<void>, ms: number) => { cancel: () => void };
}

export interface CloudSyncEngine {
  start(): void;
  stop(): void;
  noteMutation(event: StorageMutation): void;
  flush(): Promise<CloudPhase | "idle">;
  reconcile(options?: { preferRemote?: boolean; preferLocal?: boolean }): Promise<void>;
  handleOnline(): void;
  handleOffline(): void;
  handleAuthChanged(): void;
}

const OFFLINE_DETAIL = "You are offline. Changes stay on this device until you reconnect.";

/**
 * Debounced bridge from local board writes to PocketBase.
 * The canvas keeps writing locally; this engine never runs on the pointer path.
 */
export function createCloudSyncEngine(deps: CloudSyncDeps): CloudSyncEngine {
  const schedule =
    deps.schedule ??
    ((fn: () => void | Promise<void>, ms: number) => {
      const id = setTimeout(() => {
        void fn();
      }, ms);
      return { cancel: () => clearTimeout(id) };
    });

  let stopped = false;
  let timer: { cancel: () => void } | null = null;
  let flushing: Promise<{ phase: CloudPhase; detail: string | null; conflict: boolean }> | null = null;
  let flushAgain = false;
  let holdForOnline = false;
  let reconciling: Promise<void> | null = null;
  let unsubRealtime: (() => void) | null = null;
  const pendingSaves = new Map<string, BoardSnapshot>();
  const pendingDeletes = new Set<string>();
  let pendingCatalog: BoardMeta[] | null = null;
  const lastPushed = new Map<string, string>();

  function touchTimer() {
    if (stopped) return;
    timer?.cancel();
    timer = schedule(() => {
      timer = null;
      return flush().then(() => undefined);
    }, deps.debounceMs);
  }

  function cloneSnapshot(snapshot: BoardSnapshot): BoardSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as BoardSnapshot;
  }

  function isDirty(boardId: string, local: BoardSnapshot | null): boolean {
    const memory = deps.memoryFingerprint(boardId);
    if (memory === null) return false;
    if (!local) return true;
    return memory !== boardFingerprint(local);
  }

  async function flush(): Promise<CloudPhase | "idle"> {
    timer?.cancel();
    timer = null;
    if (flushing) {
      flushAgain = true;
      await flushing;
      return "idle";
    }
    if (stopped || !deps.isAuthenticated()) {
      pendingSaves.clear();
      pendingDeletes.clear();
      pendingCatalog = null;
      return "idle";
    }
    if (!deps.isOnline()) {
      holdForOnline = true;
      deps.onStatus("offline", OFFLINE_DETAIL);
      return "offline";
    }
    const saves = new Map<string, BoardSnapshot>();
    for (const [boardId, snapshot] of pendingSaves) {
      // Clone when the debounce fires, not on the local save turn, so a large
      // board is not serialized twice while the canvas is writing localStorage.
      saves.set(boardId, cloneSnapshot(snapshot));
    }
    const deletes = new Set(pendingDeletes);
    const catalog = pendingCatalog;
    pendingSaves.clear();
    pendingDeletes.clear();
    pendingCatalog = null;
    if (saves.size === 0 && deletes.size === 0 && !catalog) return "idle";

    deps.onStatus("syncing", null);
    flushing = (async () => {
      let phase: CloudPhase = "saved";
      let detail: string | null = null;
      let conflict = false;
      const finish = () => ({ phase, detail, conflict });
      for (const boardId of deletes) {
        saves.delete(boardId);
        try {
          await deps.deleteBoard(boardId);
          lastPushed.delete(boardId);
        } catch (err) {
          detail = cloudErrorMessage(err);
          if (isOfflineError(err)) {
            pendingDeletes.add(boardId);
            holdForOnline = true;
            phase = "offline";
            return finish();
          }
          phase = "error";
        }
      }
      if (catalog) {
        try {
          await deps.saveCatalog(catalog);
        } catch (err) {
          detail = cloudErrorMessage(err);
          if (isOfflineError(err)) {
            pendingCatalog = catalog;
            holdForOnline = true;
            phase = "offline";
            return finish();
          }
          phase = "error";
        }
      }
      for (const [boardId, snapshot] of saves) {
        try {
          await deps.saveBoard(boardId, snapshot, deps.boardName(boardId));
          lastPushed.set(boardId, boardFingerprint(snapshot));
        } catch (err) {
          detail = cloudErrorMessage(err);
          if (isOfflineError(err)) {
            pendingSaves.set(boardId, snapshot);
            holdForOnline = true;
            phase = "offline";
            return finish();
          }
          phase = "error";
          if (err instanceof CloudConflictError) conflict = true;
          else pendingSaves.set(boardId, snapshot);
        }
      }
      return finish();
    })();

    let outcome: { phase: CloudPhase; detail: string | null; conflict: boolean };
    try {
      outcome = await flushing;
    } finally {
      flushing = null;
    }
    const { phase, detail, conflict: saveConflict } = outcome;

    if (phase === "offline") {
      deps.onStatus("offline", detail ?? OFFLINE_DETAIL);
      return "offline";
    }
    if (phase === "error") {
      deps.onStatus("error", detail ?? "Cloud sync failed.", saveConflict);
      return "error";
    }
    if (flushAgain || pendingSaves.size > 0 || pendingDeletes.size > 0 || pendingCatalog) {
      flushAgain = false;
      return flush();
    }
    deps.onStatus("saved", null);
    return "saved";
  }

  async function ensureSubscription() {
    if (unsubRealtime || stopped) return;
    unsubRealtime = await deps.subscribeRemote((event) => {
      void onRemote(event);
    });
  }

  async function onRemote(event: RemoteBoardEvent) {
    if (stopped || !deps.isAuthenticated()) return;
    if (event.action === "delete") {
      const local = deps.readLocalSnapshot(event.localId);
      if (isDirty(event.localId, local)) {
        deps.onStatus("error", "A board was deleted in the cloud while you had local edits.");
        return;
      }
      lastPushed.delete(event.localId);
      deps.removeLocalBoard(event.localId);
      return;
    }
    const snapshot = event.snapshot;
    if (!snapshot) return;
    const fp = boardFingerprint(snapshot);
    if (lastPushed.get(event.localId) === fp) {
      deps.acknowledge(event.localId, snapshot.revision);
      return;
    }
    const local = deps.readLocalSnapshot(event.localId);
    if (local && snapshot.revision < local.revision) return;
    if (
      local &&
      snapshot.revision === local.revision &&
      boardFingerprint(local) === fp
    ) {
      deps.acknowledge(event.localId, snapshot.revision);
      return;
    }
    if (isDirty(event.localId, local)) {
      deps.onStatus(
        "error",
        "Remote changes arrived while this board has unsaved local edits."
      );
      return;
    }
    deps.acknowledge(event.localId, snapshot.revision);
    lastPushed.set(event.localId, fp);
    deps.applyToCanvas(event.localId, snapshot);
    deps.onStatus("saved", null);
  }

  async function reconcile(options?: { preferRemote?: boolean; preferLocal?: boolean }): Promise<void> {
    if (reconciling) {
      await reconciling;
      if (!options?.preferRemote) return;
    }
    if (!deps.isAuthenticated()) {
      deps.onStatus("signed-out", null);
      return;
    }
    if (!deps.isOnline()) {
      holdForOnline = true;
      deps.onStatus("offline", OFFLINE_DETAIL);
      return;
    }

    const run = async () => {
      deps.onStatus("syncing", null);
      const remoteMetas = await deps.listRemote();
      const localMetas = deps.listLocalBoards();
      const byId = new Map<string, BoardMeta>();
      for (const board of localMetas) byId.set(board.id, board);
      for (const board of remoteMetas) {
        const local = byId.get(board.id);
        byId.set(board.id, local ? { ...local, name: board.name || local.name } : board);
      }
      const merged = [...byId.values()];
      deps.replaceLocalCatalog(merged);
      await deps.saveCatalog(merged);

      let conflict: string | null = null;
      for (const meta of merged) {
        const remote = await deps.loadRemote(meta.id);
        const local = deps.readLocalSnapshot(meta.id);
        if (!remote && local) {
          pendingSaves.set(meta.id, cloneSnapshot(local));
          continue;
        }
        if (remote && !local) {
          deps.acknowledge(meta.id, remote.revision);
          lastPushed.set(meta.id, boardFingerprint(remote));
          deps.applyToCanvas(meta.id, remote);
          continue;
        }
        if (!remote || !local) continue;
        const remoteFp = boardFingerprint(remote);
        const localFp = boardFingerprint(local);
        const diverged =
          remote.revision > local.revision ||
          (remote.revision === local.revision &&
            (remoteFp !== localFp || !sameViewport(remote.viewport, local.viewport)));
        if (diverged && options?.preferLocal) {
          const written = await deps.keepLocal(meta.id, local, meta.name);
          deps.acknowledge(meta.id, written.revision);
          lastPushed.set(meta.id, boardFingerprint(written));
          const pending = pendingSaves.get(meta.id);
          if (pending && boardFingerprint(pending) !== boardFingerprint(written)) {
            const revision = Math.max(pending.revision, written.revision + 1);
            const next = revision === pending.revision ? pending : { ...pending, revision };
            pendingSaves.set(meta.id, next);
            deps.writeLocalSnapshot(meta.id, next);
          } else {
            pendingSaves.delete(meta.id);
            deps.writeLocalSnapshot(meta.id, written);
          }
          continue;
        }
        if (diverged && (options?.preferRemote || !isDirty(meta.id, local))) {
          deps.acknowledge(meta.id, remote.revision);
          lastPushed.set(meta.id, remoteFp);
          pendingSaves.delete(meta.id);
          deps.applyToCanvas(meta.id, remote);
          continue;
        }
        if (diverged) {
          conflict = `Remote changes on “${meta.name}” differ from this device. Use the cloud copy or keep this device’s version.`;
          continue;
        }
        if (local.revision > remote.revision) {
          deps.acknowledge(meta.id, remote.revision);
          pendingSaves.set(meta.id, cloneSnapshot(local));
          continue;
        }
        deps.acknowledge(meta.id, remote.revision);
        lastPushed.set(meta.id, localFp);
      }

      await ensureSubscription();
      const flushed = await flush();
      if (conflict) deps.onStatus("error", conflict, true);
      else if (flushed === "idle") deps.onStatus("saved", null);
    };

    reconciling = run().catch((err) => {
      if (isOfflineError(err)) {
        holdForOnline = true;
        deps.onStatus("offline", cloudErrorMessage(err));
        return;
      }
      deps.onStatus("error", cloudErrorMessage(err));
    });
    try {
      await reconciling;
    } finally {
      reconciling = null;
    }
  }

  return {
    start() {
      stopped = false;
      void reconcile();
    },
    stop() {
      stopped = true;
      timer?.cancel();
      timer = null;
      unsubRealtime?.();
      unsubRealtime = null;
      pendingSaves.clear();
      pendingDeletes.clear();
      pendingCatalog = null;
    },
    noteMutation(event: StorageMutation) {
      if (stopped || !deps.isAuthenticated()) return;
      if (event.type === "save") {
        pendingDeletes.delete(event.boardId);
        pendingSaves.set(event.boardId, event.snapshot);
      } else if (event.type === "delete") {
        pendingSaves.delete(event.boardId);
        pendingDeletes.add(event.boardId);
      } else {
        pendingCatalog = event.boards;
      }
      if (!deps.isOnline()) {
        holdForOnline = true;
        deps.onStatus("offline", OFFLINE_DETAIL);
        return;
      }
      holdForOnline = false;
      touchTimer();
    },
    flush,
    reconcile,
    handleOnline() {
      if (stopped || !holdForOnline) return;
      holdForOnline = false;
      if (deps.isAuthenticated()) void reconcile();
    },
    handleOffline() {
      if (stopped || !deps.isAuthenticated()) return;
      holdForOnline = true;
      deps.onStatus("offline", OFFLINE_DETAIL);
    },
    handleAuthChanged() {
      unsubRealtime?.();
      unsubRealtime = null;
      lastPushed.clear();
      if (!deps.isAuthenticated()) {
        pendingSaves.clear();
        pendingDeletes.clear();
        pendingCatalog = null;
        deps.onStatus("signed-out", null);
        return;
      }
      void reconcile();
    },
  };
}

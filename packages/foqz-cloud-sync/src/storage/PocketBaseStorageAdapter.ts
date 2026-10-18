import {
  BOARDS_COLLECTION,
  MAX_SNAPSHOT_BYTES,
  WORKSPACES_COLLECTION,
} from "../pocketbase/constants";
import {
  CloudAuthError,
  CloudConflictError,
  isNotFoundError,
  SnapshotTooLargeError,
} from "../pocketbase/errors";
import type { PbClientLike, PbRecord, PbSubscribeEvent } from "../pocketbase/types";
import { boardFingerprint, snapshotByteLength } from "@/lib/storage/fingerprint";
import { normalizeBoardSnapshot, sameViewport } from "@/lib/storage/snapshot";
import type { BoardMeta, BoardSnapshot, CanvasStorageAdapter } from "@/types/storage";

export interface RemoteBoardEvent {
  action: "create" | "update" | "delete";
  localId: string;
  snapshot: BoardSnapshot | null;
  revision: number;
}

type RealtimeHandler = (event: RemoteBoardEvent) => void;

/**
 * Remote {@link CanvasStorageAdapter} for one PocketBase user.
 *
 * Active-board pointers stay on the local adapter. This class owns workspace
 * and board records, revision checks, and a single collection SSE subscription.
 */
export class PocketBaseStorageAdapter implements CanvasStorageAdapter {
  private workspacePromise: Promise<string> | null = null;
  private readonly recordIds = new Map<string, string>();
  private readonly ackedRevision = new Map<string, number>();
  private readonly handlers = new Set<RealtimeHandler>();
  private realtime: Promise<void> | null = null;
  private unsubscribeRealtime: (() => Promise<void> | void) | null = null;
  /** Bumped on disconnect so a subscribe that resolves later is closed immediately. */
  private realtimeGeneration = 0;

  constructor(private readonly getClient: () => PbClientLike) {}

  async listBoards(): Promise<BoardMeta[]> {
    const records = await this.listBoardRecords();
    return records.map(recordToMeta);
  }

  async saveBoardCatalog(boards: BoardMeta[]): Promise<void> {
    const existing = await this.listBoardRecords();
    const byLocal = new Map(existing.map((record) => [String(record.local_id), record]));
    for (const board of boards) {
      const row = byLocal.get(board.id);
      // A missing board is created by saveBoard with the real snapshot.
      // Inserting an empty revision here would publish a blank canvas first.
      if (!row) continue;
      this.remember(board.id, row);
      if (row.name !== board.name) {
        await this.client.collection(BOARDS_COLLECTION).update(String(row.id), {
          name: board.name,
        });
      }
    }
  }

  async getActiveBoardId(): Promise<string | null> {
    return null;
  }

  async setActiveBoardId(): Promise<void> {
    // The open board is device-local. Cloud state is the board catalog and snapshots.
  }

  async loadBoard(boardId: string): Promise<BoardSnapshot | null> {
    const record = await this.findBoard(boardId);
    if (!record) return null;
    this.remember(boardId, record);
    return snapshotFromRecord(record);
  }

  async saveBoard(boardId: string, snapshot: BoardSnapshot, name?: string): Promise<void> {
    const bytes = snapshotByteLength(snapshot);
    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw new SnapshotTooLargeError(bytes, MAX_SNAPSHOT_BYTES);
    }
    const workspaceId = await this.ensureWorkspace();
    const existing = await this.findBoard(boardId);
    if (!existing) {
      await this.createBoardRecord(workspaceId, boardId, name?.trim() || boardId, snapshot);
      this.ackedRevision.set(boardId, snapshot.revision);
      return;
    }
    this.remember(boardId, existing);
    const remoteRevision = revisionOf(existing);
    const acked = this.ackedRevision.get(boardId);
    if (acked !== undefined && remoteRevision > acked) {
      throw new CloudConflictError(boardId, remoteRevision, snapshot.revision);
    }
    if (remoteRevision > snapshot.revision) {
      throw new CloudConflictError(boardId, remoteRevision, snapshot.revision);
    }
    const remoteSnapshot = snapshotFromRecord(existing);
    if (remoteSnapshot && remoteRevision === snapshot.revision) {
      const sameCanvas = boardFingerprint(remoteSnapshot) === boardFingerprint(snapshot);
      if (sameCanvas && sameViewport(remoteSnapshot.viewport, snapshot.viewport)) {
        this.ackedRevision.set(boardId, snapshot.revision);
        return;
      }
      // Same counter, different canvas or view. Another device saved this revision first.
      throw new CloudConflictError(boardId, remoteRevision, snapshot.revision);
    }
    const updated = await this.client.collection(BOARDS_COLLECTION).update(String(existing.id), {
      snapshot,
      revision: snapshot.revision,
      last_modified_by: this.requireUserId(),
      ...(name ? { name } : {}),
    });
    this.remember(boardId, updated);
    this.ackedRevision.set(boardId, snapshot.revision);
  }

  /**
   * Write this device's snapshot after the user chooses it over the cloud copy.
   * The stored revision becomes one past the higher counter so the sequence
   * stays monotonic. Ordinary saves never take this path.
   */
  async keepLocalBoard(
    boardId: string,
    snapshot: BoardSnapshot,
    name?: string
  ): Promise<BoardSnapshot> {
    const bytes = snapshotByteLength(snapshot);
    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw new SnapshotTooLargeError(bytes, MAX_SNAPSHOT_BYTES);
    }
    const workspaceId = await this.ensureWorkspace();
    const existing = await this.findBoard(boardId);
    if (!existing) {
      const created = await this.createBoardRecord(
        workspaceId,
        boardId,
        name?.trim() || boardId,
        snapshot
      );
      const stored = snapshotFromRecord(created) ?? snapshot;
      this.ackedRevision.set(boardId, stored.revision);
      return stored;
    }

    const remoteRevision = revisionOf(existing);
    const remoteSnapshot = snapshotFromRecord(existing);
    if (
      remoteSnapshot &&
      boardFingerprint(remoteSnapshot) === boardFingerprint(snapshot) &&
      sameViewport(remoteSnapshot.viewport, snapshot.viewport)
    ) {
      const revision = Math.max(snapshot.revision, remoteRevision);
      this.remember(boardId, existing);
      this.ackedRevision.set(boardId, revision);
      return revision === snapshot.revision ? snapshot : { ...snapshot, revision };
    }

    const written: BoardSnapshot = {
      ...snapshot,
      revision: Math.max(snapshot.revision, remoteRevision) + 1,
      updatedAt: Date.now(),
    };
    const updated = await this.client.collection(BOARDS_COLLECTION).update(String(existing.id), {
      snapshot: written,
      revision: written.revision,
      last_modified_by: this.requireUserId(),
      ...(name ? { name } : {}),
    });
    this.remember(boardId, updated);
    this.ackedRevision.set(boardId, written.revision);
    return written;
  }

  async deleteBoard(boardId: string): Promise<void> {
    const existing = await this.findBoard(boardId);
    this.recordIds.delete(boardId);
    this.ackedRevision.delete(boardId);
    if (!existing) return;
    await this.client.collection(BOARDS_COLLECTION).delete(String(existing.id));
  }

  subscribeBoard(
    boardId: string,
    onRemoteChange: (snapshot: BoardSnapshot) => void
  ): () => void {
    let stopped = false;
    let unsubscribe = () => {
      stopped = true;
    };
    void this.subscribeChanges((event) => {
      if (event.localId !== boardId || !event.snapshot || event.action === "delete") return;
      onRemoteChange(event.snapshot);
    }).then((stop) => {
      if (stopped) {
        stop();
        return;
      }
      unsubscribe = stop;
    });
    return () => unsubscribe();
  }

  acknowledge(boardId: string, revision: number): void {
    this.ackedRevision.set(boardId, revision);
  }

  async subscribeChanges(handler: RealtimeHandler): Promise<() => void> {
    this.handlers.add(handler);
    try {
      await this.ensureRealtime();
    } catch (err) {
      this.handlers.delete(handler);
      throw err;
    }
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) this.stopRealtime();
    };
  }

  resetSession(): void {
    this.workspacePromise = null;
    this.recordIds.clear();
    this.ackedRevision.clear();
    this.handlers.clear();
    this.stopRealtime();
  }

  private get client(): PbClientLike {
    return this.getClient();
  }

  private requireUserId(): string {
    const id = this.client.authStore.record?.id;
    if (!id || !this.client.authStore.isValid) {
      throw new CloudAuthError();
    }
    return id;
  }

  private async ensureWorkspace(): Promise<string> {
    if (!this.workspacePromise) {
      this.workspacePromise = this.loadOrCreateWorkspace().catch((err) => {
        this.workspacePromise = null;
        throw err;
      });
    }
    return this.workspacePromise;
  }

  private async loadOrCreateWorkspace(): Promise<string> {
    const userId = this.requireUserId();
    const owned = `owner = "${escapeFilter(userId)}"`;
    const personal = `${owned} && name = "Personal"`;
    try {
      const existing = await this.client
        .collection(WORKSPACES_COLLECTION)
        .getFirstListItem(personal);
      return String(existing.id);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
    try {
      const anyOwned = await this.client.collection(WORKSPACES_COLLECTION).getFirstListItem(owned);
      return String(anyOwned.id);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
    try {
      const created = await this.client.collection(WORKSPACES_COLLECTION).create({
        name: "Personal",
        owner: userId,
      });
      return String(created.id);
    } catch (createErr) {
      // Two devices can pass the empty check together. The unique (owner, name)
      // index rejects the second insert; use the row that won.
      try {
        const existing = await this.client.collection(WORKSPACES_COLLECTION).getFirstListItem(owned);
        return String(existing.id);
      } catch (lookupErr) {
        if (isNotFoundError(lookupErr)) throw createErr;
        throw lookupErr;
      }
    }
  }

  private async listBoardRecords(): Promise<PbRecord[]> {
    const workspaceId = await this.ensureWorkspace();
    const records = await this.client.collection(BOARDS_COLLECTION).getFullList({
      filter: `workspace = "${escapeFilter(workspaceId)}"`,
      batch: 200,
      // Sort locally. `created` is an autodate column added by the schema
      // script; a server that does not have it yet still returns this list.
      fields: "id,local_id,name,created,revision,workspace",
    });
    records.sort((a, b) => String(a.created ?? "").localeCompare(String(b.created ?? "")));
    for (const record of records) {
      const localId = String(record.local_id ?? "");
      if (localId) this.remember(localId, record);
    }
    return records;
  }

  private async findBoard(boardId: string): Promise<PbRecord | null> {
    const workspaceId = await this.ensureWorkspace();
    const filter = `workspace = "${escapeFilter(workspaceId)}" && local_id = "${escapeFilter(boardId)}"`;
    try {
      return await this.client.collection(BOARDS_COLLECTION).getFirstListItem(filter);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  private async createBoardRecord(
    workspaceId: string,
    boardId: string,
    name: string,
    snapshot: BoardSnapshot
  ): Promise<PbRecord> {
    try {
      const created = await this.client.collection(BOARDS_COLLECTION).create({
        workspace: workspaceId,
        name,
        local_id: boardId,
        snapshot,
        revision: snapshot.revision,
        last_modified_by: this.requireUserId(),
      });
      this.remember(boardId, created);
      return created;
    } catch (err) {
      const existing = await this.findBoard(boardId);
      if (!existing) throw err;
      const remoteRevision = revisionOf(existing);
      const remoteSnapshot = snapshotFromRecord(existing);
      const sameCanvas =
        remoteSnapshot !== null &&
        boardFingerprint(remoteSnapshot) === boardFingerprint(snapshot) &&
        sameViewport(remoteSnapshot.viewport, snapshot.viewport);
      if (
        remoteSnapshot &&
        (remoteRevision > snapshot.revision ||
          (remoteRevision === snapshot.revision && !sameCanvas))
      ) {
        this.remember(boardId, existing);
        throw new CloudConflictError(boardId, remoteRevision, snapshot.revision);
      }
      if (sameCanvas && remoteSnapshot) {
        this.remember(boardId, existing);
        this.ackedRevision.set(boardId, Math.max(snapshot.revision, remoteRevision));
        return existing;
      }
      const updated = await this.client.collection(BOARDS_COLLECTION).update(String(existing.id), {
        name,
        snapshot,
        revision: snapshot.revision,
        last_modified_by: this.requireUserId(),
      });
      this.remember(boardId, updated);
      return updated;
    }
  }

  private remember(localId: string, record: PbRecord): void {
    this.recordIds.set(localId, String(record.id));
  }

  private async ensureRealtime(): Promise<void> {
    if (this.unsubscribeRealtime) return;
    if (!this.realtime) {
      const generation = this.realtimeGeneration;
      this.realtime = this.client
        .collection(BOARDS_COLLECTION)
        .subscribe("*", (data) => this.dispatch(data))
        .then((unsubscribe) => {
          if (generation !== this.realtimeGeneration) {
            void Promise.resolve(unsubscribe()).catch(() => {
              // The socket is already gone. Nothing left to clean up.
            });
            return;
          }
          this.unsubscribeRealtime = unsubscribe;
        })
        .catch((err) => {
          if (generation !== this.realtimeGeneration) return;
          this.realtime = null;
          throw err;
        });
    }
    await this.realtime;
  }

  private stopRealtime(): void {
    this.realtimeGeneration += 1;
    const unsubscribe = this.unsubscribeRealtime;
    this.unsubscribeRealtime = null;
    this.realtime = null;
    if (unsubscribe) {
      void Promise.resolve(unsubscribe()).catch(() => {
        // The socket is already gone. Nothing left to clean up.
      });
    }
  }

  private dispatch(data: PbSubscribeEvent): void {
    const localId = String(data.record.local_id ?? "");
    if (!localId) return;
    const action = data.action === "delete" ? "delete" : data.action === "create" ? "create" : "update";
    if (action !== "delete") this.remember(localId, data.record);
    const snapshot = action === "delete" ? null : snapshotFromRecord(data.record);
    const event: RemoteBoardEvent = {
      action,
      localId,
      snapshot,
      revision: snapshot?.revision ?? revisionOf(data.record),
    };
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        console.warn("PocketBase realtime handler failed:", err);
      }
    }
  }
}

function escapeFilter(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function revisionOf(record: PbRecord): number {
  const value = record.revision;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function snapshotFromRecord(record: PbRecord): BoardSnapshot | null {
  const normalized = normalizeBoardSnapshot(record.snapshot);
  if (!normalized) return null;
  const revision = Math.max(normalized.revision, revisionOf(record));
  return revision === normalized.revision ? normalized : { ...normalized, revision };
}

function recordToMeta(record: PbRecord): BoardMeta {
  const created = record.created;
  let createdAt = Date.now();
  if (typeof created === "string") {
    const parsed = Date.parse(created);
    if (Number.isFinite(parsed)) createdAt = parsed;
  } else if (typeof created === "number" && Number.isFinite(created)) {
    createdAt = created;
  }
  return {
    id: String(record.local_id ?? record.id),
    name: typeof record.name === "string" && record.name ? record.name : "Untitled board",
    createdAt,
  };
}

import { describe, expect, it } from "vitest";
import { createCloudSyncEngine, type CloudPhase } from "@/lib/storage/cloudSyncEngine";
import { boardFingerprint } from "@/lib/storage/fingerprint";
import type { RemoteBoardEvent } from "@/lib/storage/PocketBaseStorageAdapter";
import { createEmptySnapshot } from "@/lib/storage/snapshot";
import type { BoardMeta, BoardSnapshot } from "@/types/storage";

function harness(options?: { online?: boolean; authenticated?: boolean }) {
  const saves: BoardSnapshot[] = [];
  const kept: BoardSnapshot[] = [];
  const written: BoardSnapshot[] = [];
  const statuses: CloudPhase[] = [];
  const conflicts: boolean[] = [];
  const applied: BoardSnapshot[] = [];
  let remoteHandler: ((event: RemoteBoardEvent) => void) | null = null;
  let queued: (() => void) | null = null;
  const local = new Map<string, BoardSnapshot>();
  const remote = new Map<string, BoardSnapshot>();
  const metas: BoardMeta[] = [{ id: "board-default", name: "Main", createdAt: 1 }];
  let online = options?.online ?? true;
  let authenticated = options?.authenticated ?? true;
  let memory: string | null = null;

  const engine = createCloudSyncEngine({
    debounceMs: 1000,
    isOnline: () => online,
    isAuthenticated: () => authenticated,
    async saveBoard(_boardId, snapshot) {
      saves.push(snapshot);
    },
    async keepLocal(boardId, snapshot) {
      const remoteSnap = remote.get(boardId);
      const base = Math.max(snapshot.revision, remoteSnap?.revision ?? 0);
      const next = { ...snapshot, revision: base + 1 };
      kept.push(next);
      return next;
    },
    async deleteBoard() {},
    async saveCatalog() {},
    async listRemote() {
      return metas;
    },
    async loadRemote(boardId) {
      if (remote.has(boardId)) return remote.get(boardId) ?? null;
      return local.get(boardId) ?? null;
    },
    acknowledge() {},
    async subscribeRemote(handler) {
      remoteHandler = handler;
      return () => {
        remoteHandler = null;
      };
    },
    readLocalSnapshot: (boardId) => local.get(boardId) ?? null,
    listLocalBoards: () => metas,
    boardName: () => "Main",
    memoryFingerprint: () => memory,
    applyToCanvas(_boardId, snapshot) {
      applied.push(snapshot);
      local.set("board-default", snapshot);
    },
    writeLocalSnapshot(boardId, snapshot) {
      written.push(snapshot);
      local.set(boardId, snapshot);
    },
    replaceLocalCatalog() {},
    removeLocalBoard() {},
    onStatus(phase, _detail, conflict) {
      statuses.push(phase);
      conflicts.push(Boolean(conflict));
    },
    schedule(fn) {
      queued = fn;
      return {
        cancel() {
          if (queued === fn) queued = null;
        },
      };
    },
  });

  return {
    engine,
    saves,
    kept,
    written,
    statuses,
    conflicts,
    applied,
    local,
    remote,
    setOnline(value: boolean) {
      online = value;
    },
    setAuthenticated(value: boolean) {
      authenticated = value;
    },
    setMemory(value: string | null) {
      memory = value;
    },
    async flushTimer() {
      const run = queued;
      queued = null;
      await run?.();
    },
    emit(event: RemoteBoardEvent) {
      remoteHandler?.(event);
    },
  };
}

describe("createCloudSyncEngine", () => {
  it("sends a pending save when flush runs before the debounce", async () => {
    const sync = harness();
    await sync.engine.reconcile();
    sync.engine.noteMutation({
      type: "save",
      boardId: "board-default",
      snapshot: createEmptySnapshot({ revision: 1 }),
    });
    expect(sync.saves).toHaveLength(0);
    await sync.engine.flush();
    expect(sync.saves).toHaveLength(1);
    sync.engine.stop();
  });

  it("coalesces rapid saves into the latest snapshot", async () => {
    const sync = harness();
    await sync.engine.reconcile();
    const first = createEmptySnapshot({ revision: 1, nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }] });
    const second = createEmptySnapshot({ revision: 2, nodes: [{ id: "b", position: { x: 1, y: 1 }, data: {} }] });
    sync.engine.noteMutation({ type: "save", boardId: "board-default", snapshot: first });
    sync.engine.noteMutation({ type: "save", boardId: "board-default", snapshot: second });
    await sync.flushTimer();
    expect(sync.saves).toHaveLength(1);
    expect(sync.saves[0].revision).toBe(2);
    sync.engine.stop();
  });

  it("serializes the canvas when the debounce fires", async () => {
    const sync = harness();
    await sync.engine.reconcile();
    const snapshot = createEmptySnapshot({
      revision: 1,
      nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }],
    });
    sync.engine.noteMutation({ type: "save", boardId: "board-default", snapshot });
    const node = snapshot.nodes[0];
    if (node) node.position = { x: 9, y: 4 };
    await sync.flushTimer();
    expect(sync.saves[0]?.nodes[0]?.position).toEqual({ x: 9, y: 4 });
    sync.engine.stop();
  });

  it("keeps edits on device while offline", async () => {
    const sync = harness({ online: false });
    sync.engine.noteMutation({
      type: "save",
      boardId: "board-default",
      snapshot: createEmptySnapshot({ revision: 1 }),
    });
    expect(sync.saves).toHaveLength(0);
    expect(sync.statuses[sync.statuses.length - 1]).toBe("offline");
    sync.engine.stop();
  });

  it("ignores the echo of a snapshot it just pushed", async () => {
    const sync = harness();
    sync.local.set("board-default", createEmptySnapshot({ revision: 1 }));
    await sync.engine.reconcile();
    const snapshot = createEmptySnapshot({ revision: 2, nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }] });
    sync.engine.noteMutation({ type: "save", boardId: "board-default", snapshot });
    await sync.flushTimer();
    sync.applied.length = 0;
    sync.emit({
      action: "update",
      localId: "board-default",
      revision: 2,
      snapshot,
    });
    await Promise.resolve();
    expect(sync.applied).toHaveLength(0);
    sync.engine.stop();
  });

  it("adopts a higher remote revision when the canvas already matches", async () => {
    const sync = harness();
    const local = createEmptySnapshot({
      revision: 2,
      nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }],
      viewport: { x: 1, y: 2, zoom: 1 },
    });
    sync.local.set("board-default", local);
    sync.setMemory(boardFingerprint(local));
    await sync.engine.reconcile();
    sync.written.length = 0;
    sync.applied.length = 0;
    sync.emit({
      action: "update",
      localId: "board-default",
      revision: 5,
      snapshot: { ...local, revision: 5 },
    });
    await Promise.resolve();
    expect(sync.applied).toHaveLength(0);
    expect(sync.written[0]?.revision).toBe(5);
    expect(sync.local.get("board-default")?.nodes[0]?.id).toBe("a");
    sync.engine.stop();
  });

  it("does not rewind a newer local edit when an older echo matches", async () => {
    const sync = harness();
    const pushed = createEmptySnapshot({
      revision: 2,
      nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }],
    });
    sync.local.set("board-default", pushed);
    await sync.engine.reconcile();
    const edited = createEmptySnapshot({
      revision: 3,
      nodes: [{ id: "b", position: { x: 4, y: 4 }, data: {} }],
    });
    sync.local.set("board-default", edited);
    sync.written.length = 0;
    sync.emit({
      action: "update",
      localId: "board-default",
      revision: 6,
      snapshot: { ...pushed, revision: 6 },
    });
    await Promise.resolve();
    expect(sync.written).toHaveLength(0);
    expect(sync.local.get("board-default")?.nodes[0]?.id).toBe("b");
    sync.engine.stop();
  });

  it("applies a remote pan when the board content is unchanged", async () => {
    const sync = harness();
    const local = createEmptySnapshot({
      revision: 2,
      nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    sync.local.set("board-default", local);
    sync.setMemory(boardFingerprint(local));
    await sync.engine.reconcile();
    sync.applied.length = 0;
    const remote = {
      ...local,
      revision: 3,
      viewport: { x: 40, y: 12, zoom: 1 },
    };
    sync.emit({
      action: "update",
      localId: "board-default",
      revision: 3,
      snapshot: remote,
    });
    await Promise.resolve();
    expect(sync.applied.at(-1)?.viewport).toEqual({ x: 40, y: 12, zoom: 1 });
    expect(sync.applied.at(-1)?.revision).toBe(3);
    sync.engine.stop();
  });

  it("applies a newer idle remote snapshot and reports a conflict when the canvas is dirty", async () => {
    const sync = harness();
    const local = createEmptySnapshot({ revision: 1 });
    const remote = createEmptySnapshot({ revision: 4, nodes: [{ id: "remote", position: { x: 3, y: 3 }, data: {} }] });
    sync.local.set("board-default", local);
    await sync.engine.reconcile();
    sync.emit({
      action: "update",
      localId: "board-default",
      revision: 4,
      snapshot: remote,
    });
    await Promise.resolve();
    expect(sync.applied[sync.applied.length - 1]?.revision).toBe(4);

    sync.setMemory("dirty-fingerprint");
    sync.local.set("board-default", createEmptySnapshot({ revision: 4 }));
    const newer = createEmptySnapshot({ revision: 5, nodes: [{ id: "other", position: { x: 9, y: 9 }, data: {} }] });
    sync.emit({
      action: "update",
      localId: "board-default",
      revision: 5,
      snapshot: newer,
    });
    await Promise.resolve();
    expect(sync.statuses[sync.statuses.length - 1]).toBe("error");
    sync.engine.stop();
  });

  it("keeps this device by writing one revision past a diverged cloud board", async () => {
    const sync = harness();
    const mine = createEmptySnapshot({
      revision: 2,
      nodes: [{ id: "mine", position: { x: 1, y: 1 }, data: {} }],
    });
    const theirs = createEmptySnapshot({
      revision: 5,
      nodes: [{ id: "theirs", position: { x: 2, y: 2 }, data: {} }],
    });
    sync.local.set("board-default", mine);
    sync.remote.set("board-default", theirs);
    sync.setMemory("dirty-fingerprint");

    await sync.engine.reconcile();
    expect(sync.conflicts[sync.conflicts.length - 1]).toBe(true);
    expect(sync.applied).toHaveLength(0);

    await sync.engine.reconcile({ preferLocal: true });
    expect(sync.kept[0]?.revision).toBe(6);
    expect(sync.kept[0]?.nodes[0]?.id).toBe("mine");
    expect(sync.written[0]?.revision).toBe(6);
    expect(sync.applied).toHaveLength(0);
    expect(sync.statuses[sync.statuses.length - 1]).toBe("saved");
    sync.engine.stop();
  });

  it("takes the cloud copy when the same revision diverged and this device is idle", async () => {
    const sync = harness();
    const mine = createEmptySnapshot({
      revision: 3,
      nodes: [{ id: "mine", position: { x: 0, y: 0 }, data: {} }],
    });
    const theirs = createEmptySnapshot({
      revision: 3,
      nodes: [{ id: "theirs", position: { x: 4, y: 4 }, data: {} }],
    });
    sync.local.set("board-default", mine);
    sync.remote.set("board-default", theirs);
    sync.setMemory(boardFingerprint(mine));

    await sync.engine.reconcile();
    expect(sync.applied[0]?.nodes[0]?.id).toBe("theirs");
    expect(sync.conflicts[sync.conflicts.length - 1]).toBe(false);
    sync.engine.stop();
  });
});

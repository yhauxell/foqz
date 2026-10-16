import { describe, expect, it } from "vitest";
import { MAX_SNAPSHOT_BYTES } from "@/lib/pocketbase/constants";
import { CloudConflictError, SnapshotTooLargeError } from "@/lib/pocketbase/errors";
import type { PbClientLike, PbRecord, PbSubscribeEvent } from "@/lib/pocketbase/types";
import { PocketBaseStorageAdapter } from "@/lib/storage/PocketBaseStorageAdapter";
import { createEmptySnapshot } from "@/lib/storage/snapshot";

function matches(filter: string, row: PbRecord): boolean {
  return filter.split("&&").every((part) => {
    const match = part.trim().match(/^([\w.]+) = "(.*)"$/);
    if (!match) return false;
    return String(row[match[1]] ?? "") === match[2];
  });
}

function createFakeClient() {
  const tables = new Map<string, PbRecord[]>([
    ["workspaces", []],
    ["boards", []],
  ]);
  const handlers = new Set<(event: PbSubscribeEvent) => void>();
  let seq = 1;
  let failCreates = 0;
  let missFinds = 0;
  const auth = {
    isValid: true,
    token: "token",
    record: { id: "user-1", email: "a@example.com" },
    clear() {
      auth.isValid = false;
      auth.record = { id: "", email: "" };
    },
    onChange() {
      return () => {};
    },
  };

  const client: PbClientLike = {
    autoCancellation() {},
    authStore: auth,
    collection(name: string) {
      const table = tables.get(name) ?? [];
      tables.set(name, table);
      return {
        async getFullList() {
          return table.map((row) => ({ ...row }));
        },
        async getFirstListItem(filter: string) {
          if (missFinds > 0 && filter.includes("local_id")) {
            missFinds -= 1;
            const error = new Error("not found") as Error & { status: number };
            error.status = 404;
            throw error;
          }
          const found = table.find((row) => matches(filter, row));
          if (!found) {
            const error = new Error("not found") as Error & { status: number };
            error.status = 404;
            throw error;
          }
          return { ...found };
        },
        async create(data: Record<string, unknown>) {
          if (failCreates > 0) {
            failCreates -= 1;
            const error = new Error("unique") as Error & { status: number };
            error.status = 400;
            throw error;
          }
          const row: PbRecord = {
            id: `rec-${seq++}`,
            created: "2026-10-16 12:00:00.000Z",
            ...data,
          };
          table.push(row);
          return { ...row };
        },
        async update(id: string, data: Record<string, unknown>) {
          const row = table.find((item) => item.id === id);
          if (!row) {
            const error = new Error("not found") as Error & { status: number };
            error.status = 404;
            throw error;
          }
          Object.assign(row, data);
          return { ...row };
        },
        async delete(id: string) {
          const index = table.findIndex((item) => item.id === id);
          if (index >= 0) table.splice(index, 1);
          return true;
        },
        async subscribe(_topic: string, callback: (data: PbSubscribeEvent) => void) {
          handlers.add(callback);
          return () => {
            handlers.delete(callback);
          };
        },
      };
    },
  };

  return {
    client,
    tables,
    failNextCreate() {
      failCreates += 1;
    },
    missNextFind() {
      missFinds += 1;
    },
    emit(event: PbSubscribeEvent) {
      for (const handler of handlers) handler(event);
    },
  };
}

describe("PocketBaseStorageAdapter", () => {
  it("creates one workspace and upserts a board snapshot", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    const snapshot = createEmptySnapshot({
      revision: 2,
      nodes: [{ id: "n1", position: { x: 0, y: 0 }, data: {} }],
    });

    await adapter.saveBoard("board-default", snapshot, "Main");
    await adapter.saveBoard("board-default", { ...snapshot, revision: 3 }, "Main");

    expect(fake.tables.get("workspaces")).toHaveLength(1);
    const boards = fake.tables.get("boards") ?? [];
    expect(boards).toHaveLength(1);
    expect(boards[0].revision).toBe(3);
    expect(boards[0].last_modified_by).toBe("user-1");
    const loaded = await adapter.loadBoard("board-default");
    expect(loaded?.revision).toBe(3);
    expect(await adapter.listBoards()).toEqual([
      expect.objectContaining({ id: "board-default", name: "Main" }),
    ]);
  });

  it("refuses to overwrite a newer remote revision", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    const snapshot = createEmptySnapshot({ revision: 1 });
    await adapter.saveBoard("board-default", snapshot, "Main");
    const row = fake.tables.get("boards")?.[0];
    if (row) row.revision = 8;

    await expect(
      adapter.saveBoard("board-default", createEmptySnapshot({ revision: 2 }), "Main")
    ).rejects.toBeInstanceOf(CloudConflictError);
  });

  it("refuses to overwrite a different canvas at the same revision", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    await adapter.saveBoard(
      "board-default",
      createEmptySnapshot({
        revision: 2,
        nodes: [{ id: "local", position: { x: 0, y: 0 }, data: {} }],
      }),
      "Main"
    );
    const row = fake.tables.get("boards")?.[0];
    if (row) {
      row.snapshot = createEmptySnapshot({
        revision: 2,
        nodes: [{ id: "remote", position: { x: 1, y: 1 }, data: {} }],
      });
    }

    await expect(
      adapter.saveBoard(
        "board-default",
        createEmptySnapshot({
          revision: 2,
          nodes: [{ id: "local", position: { x: 0, y: 0 }, data: {} }],
        }),
        "Main"
      )
    ).rejects.toBeInstanceOf(CloudConflictError);
    expect((row?.snapshot as { nodes?: { id: string }[] })?.nodes?.[0]?.id).toBe("remote");
  });

  it("refuses a same-revision write when only the viewport differs", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    const snapshot = createEmptySnapshot({
      revision: 2,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await adapter.saveBoard("board-default", snapshot, "Main");
    const row = fake.tables.get("boards")?.[0];
    if (row) {
      row.snapshot = { ...snapshot, viewport: { x: 40, y: 10, zoom: 1 } };
    }

    await expect(adapter.saveBoard("board-default", snapshot, "Main")).rejects.toBeInstanceOf(
      CloudConflictError
    );
    expect((row?.snapshot as { viewport?: { x: number } })?.viewport?.x).toBe(40);
  });

  it("keeps this device by advancing one revision past the cloud", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    await adapter.saveBoard(
      "board-default",
      createEmptySnapshot({
        revision: 4,
        nodes: [{ id: "remote", position: { x: 1, y: 1 }, data: {} }],
      }),
      "Main"
    );
    const kept = await adapter.keepLocalBoard(
      "board-default",
      createEmptySnapshot({
        revision: 2,
        nodes: [{ id: "local", position: { x: 0, y: 0 }, data: {} }],
      }),
      "Main"
    );
    expect(kept.revision).toBe(5);
    expect(kept.nodes[0]?.id).toBe("local");
    const row = fake.tables.get("boards")?.[0];
    expect(row?.revision).toBe(5);
  });

  it("keeps a viewport-only local view by advancing one revision", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    const local = createEmptySnapshot({
      revision: 3,
      viewport: { x: 12, y: 4, zoom: 1 },
    });
    await adapter.saveBoard("board-default", local, "Main");
    const row = fake.tables.get("boards")?.[0];
    if (row) {
      row.snapshot = { ...local, viewport: { x: 80, y: 4, zoom: 1 } };
    }

    const kept = await adapter.keepLocalBoard("board-default", local, "Main");
    expect(kept.revision).toBe(4);
    expect(kept.viewport).toEqual({ x: 12, y: 4, zoom: 1 });
    expect(row?.revision).toBe(4);
    expect((row?.snapshot as { viewport?: { x: number } })?.viewport?.x).toBe(12);
  });

  it("does not clobber a diverged board when create loses the insert race", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    await adapter.saveBoard(
      "board-default",
      createEmptySnapshot({
        revision: 2,
        nodes: [{ id: "remote", position: { x: 1, y: 1 }, data: {} }],
      }),
      "Main"
    );
    const racer = new PocketBaseStorageAdapter(() => fake.client);
    fake.missNextFind();
    fake.failNextCreate();
    await expect(
      racer.saveBoard(
        "board-default",
        createEmptySnapshot({
          revision: 2,
          nodes: [{ id: "local", position: { x: 0, y: 0 }, data: {} }],
        }),
        "Main"
      )
    ).rejects.toBeInstanceOf(CloudConflictError);
    const row = fake.tables.get("boards")?.[0];
    expect((row?.snapshot as { nodes?: { id: string }[] })?.nodes?.[0]?.id).toBe("remote");
  });

  it("does not drop a local viewport when create loses the insert race", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    const remote = createEmptySnapshot({
      revision: 2,
      viewport: { x: 80, y: 0, zoom: 1 },
    });
    await adapter.saveBoard("board-default", remote, "Main");
    const racer = new PocketBaseStorageAdapter(() => fake.client);
    fake.missNextFind();
    fake.failNextCreate();
    const local = createEmptySnapshot({
      revision: 2,
      viewport: { x: 4, y: 9, zoom: 1 },
    });
    await expect(racer.saveBoard("board-default", local, "Main")).rejects.toBeInstanceOf(
      CloudConflictError
    );
    const row = fake.tables.get("boards")?.[0];
    expect((row?.snapshot as { viewport?: { x: number } })?.viewport?.x).toBe(80);
  });

  it("rejects snapshots over the byte cap before writing", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    const snapshot = createEmptySnapshot({
      nodes: [{ id: "n1", position: { x: 0, y: 0 }, data: { blob: "x".repeat(MAX_SNAPSHOT_BYTES) } }],
    });

    await expect(adapter.saveBoard("board-default", snapshot)).rejects.toBeInstanceOf(
      SnapshotTooLargeError
    );
    expect(fake.tables.get("boards")).toHaveLength(0);
  });

  it("fans one realtime subscription out to board listeners", async () => {
    const fake = createFakeClient();
    const adapter = new PocketBaseStorageAdapter(() => fake.client);
    const seen: number[] = [];
    const stop = await adapter.subscribeChanges((event) => {
      if (event.snapshot) seen.push(event.snapshot.revision);
    });
    fake.emit({
      action: "update",
      record: {
        id: "rec-9",
        local_id: "board-default",
        revision: 4,
        snapshot: createEmptySnapshot({ revision: 4 }),
      },
    });
    stop();
    expect(seen).toEqual([4]);
  });

  it("keeps the workspace created by a concurrent login", async () => {
    let workspaceLookups = 0;
    const client: PbClientLike = {
      autoCancellation() {},
      authStore: {
        isValid: true,
        token: "token",
        record: { id: "user-1" },
        clear() {},
        onChange() {
          return () => {};
        },
      },
      collection(name: string) {
        return {
          async getFullList() {
            return [];
          },
          async getFirstListItem(filter: string) {
            if (name === "workspaces") {
              workspaceLookups += 1;
              if (workspaceLookups < 3) {
                throw Object.assign(new Error("not found"), { status: 404 });
              }
              return { id: "ws-shared", name: "Personal", owner: "user-1" };
            }
            if (filter.includes("board-default")) {
              throw Object.assign(new Error("not found"), { status: 404 });
            }
            throw Object.assign(new Error("not found"), { status: 404 });
          },
          async create(data: Record<string, unknown>) {
            if (name === "workspaces") {
              throw Object.assign(new Error("unique"), { status: 400 });
            }
            return { id: "rec-board", created: "2026-10-16 12:00:00.000Z", ...data };
          },
          async update() {
            return { id: "rec-board" };
          },
          async delete() {
            return true;
          },
          async subscribe() {
            return () => {};
          },
        };
      },
    };
    const adapter = new PocketBaseStorageAdapter(() => client);
    await adapter.saveBoard(
      "board-default",
      createEmptySnapshot({ revision: 1, updatedAt: 1 }),
      "Focus"
    );
    const listed = await adapter.listBoards();
    expect(listed).toEqual([]);
    expect(workspaceLookups).toBeGreaterThanOrEqual(3);
  });

  it("closes a realtime socket that connects after the session was reset", async () => {
    let finish: (unsubscribe: () => void) => void = () => {};
    const closed = { count: 0 };
    const client: PbClientLike = {
      autoCancellation() {},
      authStore: {
        isValid: true,
        token: "token",
        record: { id: "user-1" },
        clear() {},
        onChange() {
          return () => {};
        },
      },
      collection() {
        return {
          async getFullList() {
            return [];
          },
          async getFirstListItem() {
            throw Object.assign(new Error("not found"), { status: 404 });
          },
          async create() {
            return { id: "rec" };
          },
          async update() {
            return { id: "rec" };
          },
          async delete() {
            return true;
          },
          subscribe() {
            return new Promise<() => void>((resolve) => {
              finish = resolve;
            });
          },
        };
      },
    };
    const adapter = new PocketBaseStorageAdapter(() => client);
    const pending = adapter.subscribeChanges(() => {});
    adapter.resetSession();
    finish(() => {
      closed.count += 1;
    });
    await pending;
    expect(closed.count).toBe(1);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { DiskBackedStorageAdapter, type DiskBoardBackend } from "@/lib/storage/DiskBackedStorageAdapter";
import { createMemoryStorage } from "@/lib/storage/memoryStorage";
import { getBoardStorageKey, STORAGE_BOARDS_KEY } from "@/lib/storage/keys";
import { useStorageHealth } from "@/lib/storage/health";

/** In-memory stand-in for the Electron board files. */
function fakeDisk(files: Record<string, string> = {}) {
  const kept: Array<{ id: string; raw: string }> = [];
  const writes: Array<{ id: string; json: string; forceBackup?: boolean }> = [];
  let failWrites = false;
  const disk: DiskBoardBackend = {
    readSync: (id) => ({ ok: true, raw: files[`${id}.json`] ?? null }),
    readCatalogSync: () => ({ ok: true, raw: files["catalog.json"] ?? null }),
    locationSync: () => "/boards",
    write: async (id, json, options) => {
      if (failWrites) return { ok: false, error: "disk full" };
      writes.push({ id, json, forceBackup: options?.forceBackup });
      files[`${id}.json`] = json;
      return { ok: true };
    },
    writeCatalog: async (json) => {
      files["catalog.json"] = json;
      return { ok: true };
    },
    remove: async (id) => {
      delete files[`${id}.json`];
      return { ok: true };
    },
    listBackups: async () => ({ ok: true, value: [] }),
    readBackup: async () => ({ ok: false, error: "none" }),
    keepUnreadable: async (id, raw) => {
      kept.push({ id, raw });
      return { ok: true, value: "/boards/unreadable/x.json" };
    },
    revealUnreadable: async () => undefined,
  };
  return { disk, files, kept, writes, failNextWrites: (v: boolean) => (failWrites = v) };
}

const board = (text: string, updatedAt: number, revision = 1) =>
  JSON.stringify({
    version: 2,
    revision,
    nodes: [{ id: "n", type: "text", position: { x: 0, y: 0 }, data: { text } }],
    edges: [],
    annotations: {},
    updatedAt,
  });

const textOf = (snapshot: { nodes: Array<{ data: Record<string, unknown> }> } | null) => snapshot?.nodes[0]?.data.text;

beforeEach(() => {
  useStorageHealth.setState({ saveError: null, lastSavedAt: null, unreadable: null });
});

describe("DiskBackedStorageAdapter", () => {
  it("loads the newer of disk and cache, and brings the other up to date", async () => {
    const key = getBoardStorageKey("b");
    const cache = createMemoryStorage({ [key]: board("cache", 100) });
    const f = fakeDisk({ "b.json": board("disk", 200) });
    const adapter = new DiskBackedStorageAdapter(f.disk, cache);

    expect(textOf(adapter.loadBoardSync("b"))).toBe("disk");
    expect(cache.getItem(key)).toContain('"disk"');
    await adapter.whenIdle();
    expect(f.writes).toEqual([]); // disk was already current

    const cache2 = createMemoryStorage({ [key]: board("newer cache", 300) });
    const f2 = fakeDisk({ "b.json": board("disk", 200) });
    const adapter2 = new DiskBackedStorageAdapter(f2.disk, cache2);
    expect(textOf(adapter2.loadBoardSync("b"))).toBe("newer cache");
    await adapter2.whenIdle();
    expect(f2.files["b.json"]).toContain("newer cache");
  });

  it("uses the readable copy when the other is damaged, and keeps the damaged one", () => {
    const key = getBoardStorageKey("b");
    const f = fakeDisk({ "b.json": "{broken" });
    const adapter = new DiskBackedStorageAdapter(f.disk, createMemoryStorage({ [key]: board("cache", 1) }));

    expect(textOf(adapter.loadBoardSync("b"))).toBe("cache");
    expect(f.kept).toEqual([{ id: "b", raw: "{broken" }]);
    expect(useStorageHealth.getState().unreadable).toBeNull();
  });

  it("reports a board with no readable copy once, and never returns the damaged data", () => {
    const f = fakeDisk({ "b.json": "{broken" });
    const adapter = new DiskBackedStorageAdapter(f.disk, createMemoryStorage());

    expect(adapter.loadBoardSync("b")).toBeNull();
    expect(adapter.loadBoardSync("b")).toBeNull(); // autosave asks again
    expect(adapter.isUnreadable("b")).toBe(true);
    expect(f.kept).toHaveLength(1);
    expect(useStorageHealth.getState().unreadable).toEqual({ boardId: "b", keptAt: "/boards/unreadable" });
  });

  it("prefers the catalog on disk and copies boards that exist only in the cache", async () => {
    const cache = createMemoryStorage({
      [STORAGE_BOARDS_KEY]: JSON.stringify([{ id: "a", name: "Stale", createdAt: 1 }]),
      [getBoardStorageKey("b")]: board("only cached", 5),
    });
    const f = fakeDisk({
      "catalog.json": JSON.stringify([
        { id: "a", name: "A", createdAt: 1 },
        { id: "b", name: "B", createdAt: 2 },
      ]),
    });
    const adapter = new DiskBackedStorageAdapter(f.disk, cache);

    expect(adapter.listBoardsSync().map((b) => b.name)).toEqual(["A", "B"]);
    expect(JSON.parse(cache.getItem(STORAGE_BOARDS_KEY)!)).toHaveLength(2);
    await adapter.whenIdle();
    expect(f.files["b.json"]).toContain("only cached");
  });

  it("counts only a failed disk write as a failed save", async () => {
    const full = createMemoryStorage();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const f = fakeDisk();
    const adapter = new DiskBackedStorageAdapter(f.disk, full);
    const snap = JSON.parse(board("x", 1));

    adapter.saveBoardSync("b", snap);
    await adapter.whenIdle();
    expect(useStorageHealth.getState().saveError).toBeNull();
    expect(f.files["b.json"]).toContain('"x"');

    f.failNextWrites(true);
    adapter.saveBoardSync("b", snap);
    await adapter.whenIdle();
    expect(useStorageHealth.getState().saveError).toBe("disk full");
  });

  it("forces a backup on the save after a restore was requested", async () => {
    const f = fakeDisk();
    const adapter = new DiskBackedStorageAdapter(f.disk, createMemoryStorage());
    const snap = JSON.parse(board("x", 1));
    adapter.backupBeforeNextSave("b");
    adapter.saveBoardSync("b", snap);
    adapter.saveBoardSync("b", snap);
    await adapter.whenIdle();
    expect(f.writes.map((w) => Boolean(w.forceBackup))).toEqual([true, false]);
  });
});

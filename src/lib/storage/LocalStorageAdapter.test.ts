import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageAdapter } from "@/lib/storage/LocalStorageAdapter";
import { createMemoryStorage } from "@/lib/storage/memoryStorage";
import {
  ACTIVE_BOARD_KEY,
  BOARD_NAME_KEY,
  DEFAULT_BOARD_ID,
  FLOW_STORAGE_KEY,
  STORAGE_BOARDS_KEY,
  getBoardStorageKey,
} from "@/lib/storage/keys";
import { boardFingerprint } from "@/lib/storage/fingerprint";
import {
  boardNeedsSave,
  createEmptySnapshot,
  nextBoardSnapshot,
  normalizeBoardSnapshot,
  normalizeBoardViewport,
  sameViewport,
} from "@/lib/storage/snapshot";
import { BOARD_SNAPSHOT_VERSION } from "@/types/storage";
import type { Node } from "@xyflow/react";

const sampleNode = {
  id: "task-1",
  type: "focusTask",
  position: { x: 10, y: 20 },
  data: { title: "Hello" },
} as Node;

describe("normalizeBoardSnapshot", () => {
  it("upgrades legacy payloads without version/revision", () => {
    const normalized = normalizeBoardSnapshot({
      nodes: [sampleNode],
      edges: [],
      annotations: {},
      updatedAt: 123,
    });
    expect(normalized).toMatchObject({
      version: BOARD_SNAPSHOT_VERSION,
      revision: 0,
      nodes: [sampleNode],
      edges: [],
      annotations: {},
      updatedAt: 123,
    });
  });

  it("preserves viewport and revision when present", () => {
    const normalized = normalizeBoardSnapshot({
      version: 1,
      revision: 4,
      nodes: [],
      edges: [],
      annotations: {},
      viewport: { x: 1, y: 2, zoom: 0.5 },
      updatedAt: 99,
    });
    expect(normalized?.revision).toBe(4);
    expect(normalized?.viewport).toEqual({ x: 1, y: 2, zoom: 0.5 });
  });

  it("returns null for invalid payloads", () => {
    expect(normalizeBoardSnapshot(null)).toBeNull();
    expect(normalizeBoardSnapshot({ nodes: [] })).toBeNull();
    expect(normalizeBoardSnapshot({ edges: [] })).toBeNull();
  });
});

describe("nextBoardSnapshot", () => {
  it("bumps revision from previous snapshot", () => {
    const previous = createEmptySnapshot({ revision: 2 });
    const next = nextBoardSnapshot({
      nodes: [sampleNode],
      edges: [],
      annotations: {},
      previous,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(next.revision).toBe(3);
    expect(next.version).toBe(BOARD_SNAPSHOT_VERSION);
    expect(next.nodes).toEqual([sampleNode]);
    expect(next.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("stores canvas content without selection or measurement chrome", () => {
    const previous = createEmptySnapshot({ revision: 1 });
    const next = nextBoardSnapshot({
      nodes: [{ ...sampleNode, selected: true, measured: { width: 10, height: 12 } } as Node],
      edges: [{ id: "e1", source: "a", target: "b", selected: true }],
      annotations: {},
      previous,
    });
    expect(next.nodes[0]).toEqual(sampleNode);
    expect(next.edges[0]).toEqual({ id: "e1", source: "a", target: "b" });
    const selected = boardFingerprint({
      nodes: [{ ...sampleNode, selected: true }],
      edges: [],
      annotations: {},
    });
    const plain = boardFingerprint({
      nodes: [sampleNode],
      edges: [],
      annotations: {},
    });
    const moved = boardFingerprint({
      nodes: [{ ...sampleNode, position: { x: 99, y: 20 } }],
      edges: [],
      annotations: {},
    });
    expect(selected).toBe(plain);
    expect(moved).not.toBe(plain);
  });

  it("rounds viewport and treats a missing view as different", () => {
    expect(normalizeBoardViewport({ x: 1.23456, y: -2, zoom: 1.2 })).toEqual({
      x: 1.235,
      y: -2,
      zoom: 1.2,
    });
    expect(sameViewport(undefined, undefined)).toBe(true);
    expect(sameViewport(undefined, { x: 0, y: 0, zoom: 1 })).toBe(false);
    const next = nextBoardSnapshot({
      nodes: [],
      edges: [],
      annotations: {},
      previous: createEmptySnapshot({ revision: 1 }),
      viewport: { x: 1.2344, y: 0, zoom: 1 },
    });
    expect(next.viewport).toEqual({ x: 1.234, y: 0, zoom: 1 });
  });

  it("does not ask for a save when only selection chrome changed", () => {
    const previous = createEmptySnapshot({
      revision: 4,
      nodes: [sampleNode],
      viewport: { x: 3, y: 4, zoom: 1 },
    });
    expect(
      boardNeedsSave(previous, {
        nodes: [{ ...sampleNode, selected: true }],
        edges: [],
        annotations: {},
        viewport: { x: 3, y: 4, zoom: 1 },
      })
    ).toBe(false);
    expect(
      boardNeedsSave(previous, {
        nodes: [{ ...sampleNode, position: { x: 80, y: 20 } }],
        edges: [],
        annotations: {},
        viewport: { x: 3, y: 4, zoom: 1 },
      })
    ).toBe(true);
    expect(
      boardNeedsSave(
        previous,
        { nodes: [sampleNode], edges: [], annotations: {}, viewport: { x: 3, y: 4, zoom: 1 } },
        "different-content"
      )
    ).toBe(true);
  });
});

describe("LocalStorageAdapter", () => {
  let storage: Storage;
  let adapter: LocalStorageAdapter;

  beforeEach(() => {
    storage = createMemoryStorage();
    adapter = new LocalStorageAdapter(storage);
  });

  it("returns a default board catalog when empty", () => {
    const boards = adapter.listBoardsSync();
    expect(boards).toHaveLength(1);
    expect(boards[0].id).toBe(DEFAULT_BOARD_ID);
    expect(boards[0].name).toBe("Foqz Board 1");
  });

  it("uses legacy board name when catalog is missing", () => {
    storage.setItem(BOARD_NAME_KEY, "Legacy Name");
    const boards = adapter.listBoardsSync();
    expect(boards[0].name).toBe("Legacy Name");
  });

  it("persists and loads board catalog + active id", async () => {
    const boards = [
      { id: DEFAULT_BOARD_ID, name: "Main", createdAt: 1 },
      { id: "board-2", name: "Second", createdAt: 2 },
    ];
    await adapter.saveBoardCatalog(boards);
    await adapter.setActiveBoardId("board-2", "Second");

    expect(JSON.parse(storage.getItem(STORAGE_BOARDS_KEY)!)).toEqual(boards);
    expect(storage.getItem(ACTIVE_BOARD_KEY)).toBe("board-2");
    expect(storage.getItem(BOARD_NAME_KEY)).toBe("Second");
    expect(await adapter.listBoards()).toEqual(boards);
    expect(await adapter.getActiveBoardId()).toBe("board-2");
    expect(adapter.resolveActiveBoardIdSync(boards)).toBe("board-2");
  });

  it("falls back when active id is missing from catalog", () => {
    const boards = [{ id: "board-2", name: "Second", createdAt: 2 }];
    storage.setItem(ACTIVE_BOARD_KEY, "missing");
    expect(adapter.resolveActiveBoardIdSync(boards)).toBe("board-2");
  });

  it("saves and loads snapshots using legacy key for default board", async () => {
    const snapshot = createEmptySnapshot({
      nodes: [sampleNode],
      revision: 0,
    });
    const next = nextBoardSnapshot({
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      annotations: snapshot.annotations,
      previous: snapshot,
    });

    await adapter.saveBoard(DEFAULT_BOARD_ID, next);

    expect(storage.getItem(FLOW_STORAGE_KEY)).toBeTruthy();
    expect(storage.getItem(getBoardStorageKey("board-other"))).toBeNull();

    const loaded = await adapter.loadBoard(DEFAULT_BOARD_ID);
    expect(loaded?.revision).toBe(1);
    expect(loaded?.nodes).toEqual([sampleNode]);
    expect(loaded?.version).toBe(BOARD_SNAPSHOT_VERSION);
  });

  it("reads legacy snapshots written without version/revision", async () => {
    storage.setItem(
      FLOW_STORAGE_KEY,
      JSON.stringify({
        nodes: [sampleNode],
        edges: [{ id: "e1", source: "a", target: "b" }],
        annotations: { "ann-1": { id: "ann-1" } },
        updatedAt: 42,
      })
    );

    const loaded = await adapter.loadBoard(DEFAULT_BOARD_ID);
    expect(loaded).toMatchObject({
      version: BOARD_SNAPSHOT_VERSION,
      revision: 0,
      updatedAt: 42,
    });
    expect(loaded?.nodes).toHaveLength(1);
    expect(loaded?.edges).toHaveLength(1);
  });

  it("uses per-board keys for non-default boards and deletes them", async () => {
    const boardId = "board-123";
    const snapshot = createEmptySnapshot({ nodes: [sampleNode] });
    await adapter.saveBoard(boardId, snapshot);

    expect(storage.getItem(getBoardStorageKey(boardId))).toBeTruthy();
    expect(await adapter.loadBoard(boardId)).toMatchObject({
      nodes: [sampleNode],
    });

    await adapter.deleteBoard(boardId);
    expect(await adapter.loadBoard(boardId)).toBeNull();
    expect(storage.getItem(getBoardStorageKey(boardId))).toBeNull();
  });

  it("notifies listeners unless the write is silent", () => {
    const events: string[] = [];
    adapter.subscribeMutations((event) => events.push(event.type));
    const snapshot = createEmptySnapshot();
    adapter.saveBoardSync(DEFAULT_BOARD_ID, snapshot);
    adapter.saveBoardSync(DEFAULT_BOARD_ID, snapshot, { notify: false });
    adapter.deleteBoardSync("board-2", { notify: false });
    adapter.deleteBoardSync("board-2");
    expect(events).toEqual(["save", "delete"]);
  });

  it("survives null storage (SSR / unavailable localStorage)", () => {
    const nullAdapter = new LocalStorageAdapter(null);
    expect(nullAdapter.listBoardsSync()[0].id).toBe(DEFAULT_BOARD_ID);
    expect(nullAdapter.loadBoardSync(DEFAULT_BOARD_ID)).toBeNull();
    expect(() =>
      nullAdapter.saveBoardSync(DEFAULT_BOARD_ID, createEmptySnapshot())
    ).not.toThrow();
  });
});

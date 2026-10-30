import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { migrateBoardSnapshot, orderParentsFirst } from "@/lib/storage/migrate";
import { LocalStorageAdapter } from "@/lib/storage/LocalStorageAdapter";
import { createMemoryStorage } from "@/lib/storage/memoryStorage";
import { GITHUB_TOKEN_KEY, getBoardBackupKey, getBoardStorageKey } from "@/lib/storage/keys";
import { BOARD_SNAPSHOT_VERSION, type BoardSnapshot } from "@/types/storage";
import type { Annotation } from "@/types/annotations";

const stowed: Edge = {
  id: "e-stowed",
  type: "semantic",
  source: "task-staged",
  target: "task-home",
  data: { relation: "blocks" },
};

function legacyBoard(): BoardSnapshot {
  const nodes: Node[] = [
    {
      id: "proj-a",
      type: "projectFrame",
      position: { x: 100, y: 100 },
      style: { width: 600, height: 400 },
      data: {
        title: "Widgets",
        connectors: {
          githubRepo: "acme/widgets",
          githubToken: "ghp_secret",
          notionWorkspace: "Roadmap",
          sentryProject: "widgets-web",
          mcpServers: ["linear"],
        },
        customAgent: "# Planner",
      },
    },
    {
      id: "task-home",
      type: "focusTask",
      parentId: "proj-a",
      position: { x: 40, y: 100 },
      data: { title: "Ship it", status: "doing", priority: 1 },
    },
    {
      id: "runway-1",
      type: "runwayFrame",
      position: { x: 900, y: 50 },
      style: { width: 680, height: 420 },
      data: { title: "Today's Runway", templateId: "rule_of_3" },
    },
    {
      id: "task-staged",
      type: "focusTask",
      parentId: "runway-1",
      position: { x: 24, y: 82 },
      style: { width: 632, height: 50 },
      data: {
        title: "Write tests",
        status: "open",
        priority: 2,
        originProjectId: "proj-a",
        originProjectTitle: "Widgets",
        originProjectPos: { x: 40, y: 220 },
        stagedAt: 1,
        stowedEdges: [stowed],
      },
    },
    {
      id: "task-orphan",
      type: "focusTask",
      parentId: "runway-1",
      position: { x: 24, y: 142 },
      data: { title: "Loose end", status: "done", priority: 4 },
    },
    {
      id: "note-1",
      type: "note",
      position: { x: 0, y: 0 },
      data: { text: "hello" },
    },
  ];
  const edges: Edge[] = [
    { id: "e-agg", type: "semantic", source: "task-home", target: "note-1", data: { relation: "aggregates" } },
    { id: "e-runway", type: "semantic", source: "runway-1", target: "note-1", data: { relation: "depends" } },
  ];
  const annotations: Record<string, Annotation> = {
    a1: {
      id: "a1",
      anchor: { nodeId: "task-home", rel: { x: 0.5, y: 0.5 } },
      kind: "todo" as any,
      status: "open",
      aiVisible: true,
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    },
    a2: {
      id: "a2",
      anchor: { nodeId: "runway-1", rel: { x: 0.5, y: 0 } },
      kind: "constraint" as any,
      status: "open",
      aiVisible: true,
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    },
  };
  return { version: 1, revision: 3, nodes, edges, annotations, updatedAt: 1 };
}

describe("migrateBoardSnapshot v1 → v2", () => {
  it("leaves current snapshots untouched", () => {
    const current = { ...legacyBoard(), version: BOARD_SNAPSHOT_VERSION };
    const result = migrateBoardSnapshot(current);
    expect(result.changed).toBe(false);
    expect(result.snapshot).toBe(current);
  });

  it("sends staged runway tasks back to their origin region", () => {
    const { snapshot } = migrateBoardSnapshot(legacyBoard());
    const staged = snapshot.nodes.find((n) => n.id === "task-staged")!;
    expect(staged.parentId).toBe("proj-a");
    expect(staged.position).toEqual({ x: 40, y: 220 });
    expect(staged.style).toMatchObject({ width: 280, height: 82 });
    for (const key of ["originProjectId", "originProjectTitle", "originProjectPos", "stagedAt", "stowedEdges"]) {
      expect(staged.data).not.toHaveProperty(key);
    }
  });

  it("moves runway tasks without an origin to absolute canvas positions", () => {
    const { snapshot } = migrateBoardSnapshot(legacyBoard());
    const orphan = snapshot.nodes.find((n) => n.id === "task-orphan")!;
    expect(orphan.parentId).toBeUndefined();
    expect(orphan.position).toEqual({ x: 924, y: 192 });
  });

  it("deletes runways, their edges, and restores stowed edges with collapsed relations", () => {
    const { snapshot } = migrateBoardSnapshot(legacyBoard());
    expect(snapshot.nodes.some((n) => n.id === "runway-1")).toBe(false);
    expect(snapshot.edges.some((e) => e.id === "e-runway")).toBe(false);
    const restored = snapshot.edges.find((e) => e.id === "e-stowed")!;
    expect(restored.data).toMatchObject({ relation: "depends" });
    expect(snapshot.edges.find((e) => e.id === "e-agg")!.data).toMatchObject({ relation: "relates" });
  });

  it("drops priority and doing, and marks cards actionable", () => {
    const { snapshot } = migrateBoardSnapshot(legacyBoard());
    for (const n of snapshot.nodes) {
      expect(n.data).not.toHaveProperty("priority");
      expect((n.data as any).status).not.toBe("doing");
    }
    expect(snapshot.nodes.find((n) => n.id === "task-home")!.data).toMatchObject({
      status: "open",
      actionable: true,
    });
    expect(snapshot.nodes.find((n) => n.id === "note-1")!.data).not.toHaveProperty("actionable");
  });

  it("strips per-region connectors and reports the token", () => {
    const result = migrateBoardSnapshot(legacyBoard());
    const region = result.snapshot.nodes.find((n) => n.id === "proj-a")!;
    expect(region.data.connectors).toEqual({ githubRepo: "acme/widgets" });
    expect(region.data).not.toHaveProperty("customAgent");
    expect(result.strippedGithubToken).toBe("ghp_secret");
  });

  it("keeps a region's local folder for Claude Code", () => {
    const board = legacyBoard();
    const region = board.nodes.find((n: any) => n.id === "proj-a") as any;
    region.data.connectors.localFolder = " ~/code/widgets ";
    const { snapshot } = migrateBoardSnapshot(board);
    expect(snapshot.nodes.find((n) => n.id === "proj-a")!.data.connectors).toEqual({
      githubRepo: "acme/widgets",
      localFolder: "~/code/widgets",
    });
  });

  it("collapses annotation kinds and re-anchors pins on deleted runways", () => {
    const { snapshot } = migrateBoardSnapshot(legacyBoard());
    expect(snapshot.annotations.a1.kind).toBe("comment");
    expect(snapshot.annotations.a2.kind).toBe("decision");
    expect(snapshot.annotations.a2.anchor).toEqual({ nodeId: null, canvas: { x: 1240, y: 50 } });
  });

  it("keeps parents ahead of children", () => {
    const { snapshot } = migrateBoardSnapshot(legacyBoard());
    const index = new Map(snapshot.nodes.map((n, i) => [n.id, i]));
    for (const n of snapshot.nodes) {
      if (n.parentId) expect(index.get(n.parentId)!).toBeLessThan(index.get(n.id)!);
    }
    expect(snapshot.version).toBe(BOARD_SNAPSHOT_VERSION);
  });
});

describe("orderParentsFirst", () => {
  it("moves a parent listed after its child in front of it", () => {
    const nodes = [
      { id: "child", parentId: "parent", position: { x: 0, y: 0 }, data: {} },
      { id: "parent", position: { x: 0, y: 0 }, data: {} },
    ] as Node[];
    expect(orderParentsFirst(nodes).map((n) => n.id)).toEqual(["parent", "child"]);
  });
});

describe("LocalStorageAdapter migration on load", () => {
  it("backs up the raw v1 JSON once, persists v2, and promotes the token", () => {
    const storage = createMemoryStorage();
    const adapter = new LocalStorageAdapter(storage);
    const raw = JSON.stringify(legacyBoard());
    storage.setItem(getBoardStorageKey("board-x"), raw);

    const loaded = adapter.loadBoardSync("board-x")!;
    expect(loaded.version).toBe(BOARD_SNAPSHOT_VERSION);
    expect(storage.getItem(getBoardBackupKey("board-x", 1))).toBe(raw);
    expect(JSON.parse(storage.getItem(getBoardStorageKey("board-x"))!).version).toBe(BOARD_SNAPSHOT_VERSION);
    expect(storage.getItem(GITHUB_TOKEN_KEY)).toBe("ghp_secret");

    // A second load is a no-op and never overwrites the backup.
    storage.setItem(getBoardBackupKey("board-x", 1), "original");
    adapter.loadBoardSync("board-x");
    expect(storage.getItem(getBoardBackupKey("board-x", 1))).toBe("original");
  });

  it("does not replace an existing global token", () => {
    const storage = createMemoryStorage();
    storage.setItem(GITHUB_TOKEN_KEY, "ghp_global");
    storage.setItem(getBoardStorageKey("board-y"), JSON.stringify(legacyBoard()));
    new LocalStorageAdapter(storage).loadBoardSync("board-y");
    expect(storage.getItem(GITHUB_TOKEN_KEY)).toBe("ghp_global");
  });
});

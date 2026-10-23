import type { Edge, Node } from "@xyflow/react";
import type { Annotation, AnnotationKind } from "@/types/annotations";
import { BOARD_SNAPSHOT_VERSION, type BoardSnapshot } from "@/types/storage";

/**
 * v1 → v2 board migration (canvas pruning, see docs/specs/canvas-pruning.md).
 *
 * Pure: never touches storage. Callers back up the raw v1 JSON before
 * persisting the result.
 */

export interface BoardMigrationResult {
  snapshot: BoardSnapshot;
  /** First per-region GitHub token found, so the caller can promote it to the global token. */
  strippedGithubToken?: string;
  changed: boolean;
}

const RUNWAY_DATA_KEYS = [
  "originProjectId",
  "originProjectTitle",
  "originProjectAccent",
  "originProjectPos",
  "stagedAt",
  "stowedEdges",
] as const;

const ANNOTATION_KIND_MAP: Record<string, AnnotationKind> = {
  todo: "comment",
  constraint: "decision",
};

const EDGE_RELATION_MAP: Record<string, string> = {
  blocks: "depends",
  aggregates: "relates",
};

function isRunwayNode(n: Node): boolean {
  if (n.type === "runwayFrame") return true;
  return n.type === "projectFrame" && String((n.data as any)?.title || "").includes("Runway");
}

function nodeSize(n: Node, fallbackW: number, fallbackH: number) {
  return {
    w: Number(n.style?.width ?? n.width ?? fallbackW),
    h: Number(n.style?.height ?? n.height ?? fallbackH),
  };
}

/** React Flow requires a parent to precede its children in the nodes array. */
export function orderParentsFirst(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Set<string>();
  const out: Node[] = [];
  const visit = (n: Node, depth: number) => {
    if (placed.has(n.id)) return;
    if (n.parentId && byId.has(n.parentId) && depth < 32) {
      visit(byId.get(n.parentId)!, depth + 1);
    }
    placed.add(n.id);
    out.push(n);
  };
  for (const n of nodes) visit(n, 0);
  return out;
}

export function migrateBoardSnapshot(input: BoardSnapshot): BoardMigrationResult {
  if (input.version >= BOARD_SNAPSHOT_VERSION) {
    return { snapshot: input, changed: false };
  }

  let strippedGithubToken: string | undefined;
  let nodes: Node[] = input.nodes.map((n) => ({ ...n, data: { ...(n.data || {}) } }));
  let edges: Edge[] = [...input.edges];
  const annotations: Record<string, Annotation> = {};
  for (const [id, ann] of Object.entries(input.annotations || {})) {
    annotations[id] = { ...ann, anchor: { ...ann.anchor } };
  }

  // 1. Dissolve runways: send children home, restore stowed edges, drop the runway.
  const runways = nodes.filter(isRunwayNode);
  const runwayIds = new Set(runways.map((r) => r.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const runway of runways) {
    const children = nodes.filter((n) => n.parentId === runway.id);
    for (const child of children) {
      const d = child.data as Record<string, any>;
      const originId = typeof d.originProjectId === "string" ? d.originProjectId : null;
      const origin = originId ? byId.get(originId) : undefined;

      if (origin && !runwayIds.has(origin.id)) {
        const pos = d.originProjectPos;
        child.parentId = origin.id;
        child.position =
          pos && typeof pos.x === "number" && typeof pos.y === "number"
            ? { x: pos.x, y: pos.y }
            : { x: 40, y: 100 };
      } else {
        child.position = {
          x: runway.position.x + child.position.x,
          y: runway.position.y + child.position.y,
        };
        if (runway.parentId && !runwayIds.has(runway.parentId)) {
          child.parentId = runway.parentId;
        } else {
          delete child.parentId;
        }
      }

      if (Array.isArray(d.stowedEdges)) {
        for (const se of d.stowedEdges as Edge[]) {
          if (se && typeof se.id === "string" && !edges.some((e) => e.id === se.id)) {
            edges.push(se);
          }
        }
      }

      for (const key of RUNWAY_DATA_KEYS) delete d[key];
      delete (child as any).extent;
      if (child.type === "focusTask") {
        child.style = { ...child.style, width: 280, height: 82 };
        delete child.width;
        delete child.height;
      }
    }

    // Pins on the runway itself become free canvas pins where they were.
    const { w, h } = nodeSize(runway, 680, 420);
    for (const ann of Object.values(annotations)) {
      if (ann.anchor.nodeId !== runway.id) continue;
      const rel = ann.anchor.rel || { x: 0, y: 0 };
      ann.anchor = {
        nodeId: null,
        canvas: { x: runway.position.x + rel.x * w, y: runway.position.y + rel.y * h },
      };
    }
  }

  nodes = nodes.filter((n) => !runwayIds.has(n.id));
  const liveIds = new Set(nodes.map((n) => n.id));

  // 2. Node data: status, priority, actionable, region connectors.
  for (const n of nodes) {
    const d = n.data as Record<string, any>;
    if (d.status === "doing") d.status = "open";
    delete d.priority;
    if (n.type === "focusTask") d.actionable = true;

    // Any leftover runway bookkeeping on nodes outside a runway.
    for (const key of RUNWAY_DATA_KEYS) delete d[key];

    if (n.type === "projectFrame") {
      const conn = d.connectors;
      if (conn && typeof conn === "object") {
        if (!strippedGithubToken && typeof conn.githubToken === "string" && conn.githubToken.trim()) {
          strippedGithubToken = conn.githubToken.trim();
        }
        d.connectors = conn.githubRepo ? { githubRepo: conn.githubRepo } : undefined;
        if (!d.connectors) delete d.connectors;
      }
      delete d.customAgent;
    }
  }

  // 3. Edges: drop dangling ones, collapse relations.
  edges = edges
    .filter((e) => liveIds.has(e.source) && liveIds.has(e.target))
    .map((e) => {
      const rel = (e.data as any)?.relation;
      if (typeof rel === "string" && EDGE_RELATION_MAP[rel]) {
        return { ...e, data: { ...(e.data || {}), relation: EDGE_RELATION_MAP[rel] } };
      }
      return e;
    });

  // 4. Annotations: collapse kinds.
  for (const ann of Object.values(annotations)) {
    const mapped = ANNOTATION_KIND_MAP[ann.kind as string];
    if (mapped) ann.kind = mapped;
  }

  return {
    snapshot: {
      ...input,
      version: BOARD_SNAPSHOT_VERSION,
      nodes: orderParentsFirst(nodes),
      edges,
      annotations,
    },
    strippedGithubToken,
    changed: true,
  };
}

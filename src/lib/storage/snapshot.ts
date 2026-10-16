import type { Edge, Node } from "@xyflow/react";
import type { Annotation } from "@/types/annotations";
import {
  BOARD_SNAPSHOT_VERSION,
  type BoardSnapshot,
  type BoardViewport,
} from "@/types/storage";

export function createEmptySnapshot(
  overrides?: Partial<BoardSnapshot>
): BoardSnapshot {
  return {
    version: BOARD_SNAPSHOT_VERSION,
    revision: 0,
    nodes: [],
    edges: [],
    annotations: {},
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Normalize raw JSON (including legacy `{ nodes, edges, annotations?, updatedAt? }`
 * payloads without version/revision) into a canonical {@link BoardSnapshot}.
 */
export function normalizeBoardSnapshot(raw: unknown): BoardSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Record<string, unknown>;

  const nodes = Array.isArray(parsed.nodes) ? (parsed.nodes as Node[]) : null;
  const edges = Array.isArray(parsed.edges) ? (parsed.edges as Edge[]) : null;
  if (!nodes || !edges) return null;

  const annotations =
    parsed.annotations && typeof parsed.annotations === "object"
      ? (parsed.annotations as Record<string, Annotation>)
      : {};

  const revision =
    typeof parsed.revision === "number" && Number.isFinite(parsed.revision)
      ? Math.max(0, Math.floor(parsed.revision))
      : 0;

  const version =
    typeof parsed.version === "number" && Number.isFinite(parsed.version)
      ? Math.floor(parsed.version)
      : BOARD_SNAPSHOT_VERSION;

  const updatedAt =
    typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
      ? parsed.updatedAt
      : Date.now();

  let viewport: BoardViewport | undefined;
  if (parsed.viewport && typeof parsed.viewport === "object") {
    const vp = parsed.viewport as Record<string, unknown>;
    if (
      typeof vp.x === "number" &&
      typeof vp.y === "number" &&
      typeof vp.zoom === "number"
    ) {
      viewport = { x: vp.x, y: vp.y, zoom: vp.zoom };
    }
  }

  return {
    version,
    revision,
    nodes,
    edges,
    annotations,
    ...(viewport ? { viewport } : {}),
    updatedAt,
  };
}

/** Build the next snapshot for a save, bumping revision from a prior value. */
export function nextBoardSnapshot(params: {
  nodes: Node[];
  edges: Edge[];
  annotations: Record<string, Annotation>;
  previous?: BoardSnapshot | null;
  viewport?: BoardViewport;
}): BoardSnapshot {
  const previous = params.previous ?? null;
  return {
    version: BOARD_SNAPSHOT_VERSION,
    revision: (previous?.revision ?? 0) + 1,
    nodes: params.nodes,
    edges: params.edges,
    annotations: params.annotations,
    viewport: params.viewport ?? previous?.viewport,
    updatedAt: Date.now(),
  };
}

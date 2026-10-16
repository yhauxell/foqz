import type { Edge, Node } from "@xyflow/react";
import type { Annotation } from "@/types/annotations";
import {
  boardFingerprint,
  persistableEdges,
  persistableNodes,
} from "@/lib/storage/fingerprint";
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

/** Round pan and zoom so float noise does not become a new revision. */
export function normalizeBoardViewport(
  value: { x: number; y: number; zoom: number } | null | undefined
): BoardViewport | undefined {
  if (!value) return undefined;
  const { x, y, zoom } = value;
  if (![x, y, zoom].every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { x: round(x), y: round(y), zoom: round(zoom) };
}

export function sameViewport(a?: BoardViewport, b?: BoardViewport): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

/** True when the live canvas differs from the last stored snapshot. */
export function boardNeedsSave(
  previous: BoardSnapshot | null | undefined,
  next: {
    nodes: unknown;
    edges: unknown;
    annotations: unknown;
    viewport?: BoardViewport | null;
  },
  contentFingerprint?: string
): boolean {
  if (!previous) return true;
  const nextFp = contentFingerprint ?? boardFingerprint(next);
  if (boardFingerprint(previous) !== nextFp) return true;
  return !sameViewport(previous.viewport, normalizeBoardViewport(next.viewport ?? undefined));
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
    nodes: persistableNodes(params.nodes),
    edges: persistableEdges(params.edges),
    annotations: params.annotations,
    viewport: normalizeBoardViewport(params.viewport ?? previous?.viewport),
    updatedAt: Date.now(),
  };
}

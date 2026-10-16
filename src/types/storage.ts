import type { Edge, Node } from "@xyflow/react";
import type { Annotation } from "@/types/annotations";

/** Current on-disk / export schema version for board snapshots. */
export const BOARD_SNAPSHOT_VERSION = 1;

export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
}

export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Canonical persisted board payload.
 * Extends the issue #39 sketch with `annotations` (already used by the canvas).
 */
export interface BoardSnapshot {
  version: number;
  revision: number;
  nodes: Node[];
  edges: Edge[];
  annotations: Record<string, Annotation>;
  viewport?: BoardViewport;
  updatedAt: number;
}

/**
 * Pluggable persistence for multi-board canvas state.
 *
 * Phase 1: {@link LocalStorageAdapter}
 * Later: PocketBase / IndexedDB / Electron file adapters.
 */
export interface CanvasStorageAdapter {
  listBoards(): Promise<BoardMeta[]>;
  /** Persist the board catalog (create / rename / delete metadata). */
  saveBoardCatalog(boards: BoardMeta[]): Promise<void>;
  getActiveBoardId(): Promise<string | null>;
  setActiveBoardId(boardId: string, displayName?: string): Promise<void>;
  loadBoard(boardId: string): Promise<BoardSnapshot | null>;
  saveBoard(boardId: string, snapshot: BoardSnapshot): Promise<void>;
  deleteBoard(boardId: string): Promise<void>;
  subscribeBoard?(
    boardId: string,
    onRemoteChange: (snapshot: BoardSnapshot) => void
  ): () => void;
}

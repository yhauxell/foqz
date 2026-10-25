import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { temporal, type TemporalState } from "zundo";
import type { Node, Edge } from "@xyflow/react";
import type { Annotation, AnnotationKind, AnnotationAnchor, AnnotationAuthor } from "@/types/annotations";
import type { BoardMeta } from "@/types/storage";
import { findNonOverlappingPosition } from "@/lib/canvasLayout";
import {
  DEFAULT_BOARD_ID,
  getCanvasStorage,
  nextBoardSnapshot,
} from "@/lib/storage";
import { orderParentsFirst } from "@/lib/storage/migrate";
import { isTaskEligibleForSweep, formatWorkdayId } from "@/lib/logbookTiming";
import { appendLogbookEntries, removeLogbookEntry } from "@/lib/logbookService";
import type { LogbookEntry } from "@/types/logbook";
import { isActionable, nodeTitle } from "@/lib/nodePredicates";
import { getCachedAppSettings } from "@/lib/appSettingsCache";

export function getInitialBoards(): BoardMeta[] {
  return getCanvasStorage().listBoardsSync();
}

export function getInitialActiveBoardId(boards: BoardMeta[]): string {
  return getCanvasStorage().resolveActiveBoardIdSync(boards);
}

export function loadBoardSnapshotFromStorage(boardId: string): {
  nodes: Node[];
  edges: Edge[];
  annotations: Record<string, Annotation>;
} {
  const stored = getCanvasStorage().loadBoardSync(boardId);
  if (stored) {
    return {
      nodes: stored.nodes,
      edges: stored.edges,
      annotations: stored.annotations,
    };
  }
  if (boardId === DEFAULT_BOARD_ID) {
    return { nodes: INITIAL_NODES, edges: INITIAL_EDGES, annotations: {} };
  }
  return { nodes: [], edges: [], annotations: {} };
}

export const INITIAL_NODES: Node[] = [
  {
    id: "proj-1",
    type: "projectFrame",
    position: { x: 80, y: 80 },
    style: { width: 720, height: 500 },
    data: {
      title: "React Flow Migration Milestone",
      goal: "Goal: Validate sketchy style, themes & connections",
      accent: "blue",
      borderStyle: "solid",
      connectors: { githubRepo: "yhauxell/foqz" },
    },
  },
  {
    id: "task-1",
    type: "focusTask",
    parentId: "proj-1",
    position: { x: 40, y: 100 },
    style: { width: 280, height: 82 },
    data: {
      title: "Setup `@xyflow/react` and sketch engine",
      status: "done",
      actionable: true,
      paper: "sage",
      borderStyle: "solid",
      notes: "Double click me to edit title",
    },
  },
  {
    id: "task-2",
    type: "focusTask",
    parentId: "proj-1",
    position: { x: 40, y: 290 },
    style: { width: 280, height: 82 },
    data: {
      title: "Connect task cards to sketch boxes",
      status: "open",
      actionable: true,
      paper: "cream",
      borderStyle: "solid",
      notes: "Drag line from task handles to box handles",
    },
  },
  {
    id: "box-demo",
    type: "box",
    parentId: "proj-1",
    position: { x: 400, y: 120 },
    style: { width: 260, height: 180 },
    data: {
      label: "Architecture Notes (Double-click to write)",
      color: "rgba(16, 185, 129, 0.08)",
      strokeColor: "#10b981",
      borderStyle: "solid",
      roughness: 2,
    },
  },
  {
    id: "text-demo",
    type: "text",
    position: { x: 850, y: 90 },
    data: {
      text: "✏️ Double click on canvas to write text anywhere!",
      fontSize: 15,
      color: "#2563eb",
    },
  },
  {
    id: "pencil-demo",
    type: "pencil",
    position: { x: 850, y: 150 },
    data: {
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 10 },
        { x: 60, y: 40 },
        { x: 90, y: 20 },
        { x: 130, y: 60 },
        { x: 160, y: 30 },
      ],
      color: "#ef4444",
      size: 6,
    },
  },
];

export const INITIAL_EDGES: Edge[] = [
  {
    id: "e1-2",
    type: "semantic",
    source: "task-1",
    sourceHandle: "right",
    target: "task-2",
    targetHandle: "left",
    data: { relation: "depends" },
  },
  {
    id: "e2-box",
    type: "semantic",
    source: "task-2",
    sourceHandle: "right",
    target: "box-demo",
    targetHandle: "left",
    data: { relation: "relates" },
  },
];

function focusLengthSeconds(): number {
  const minutes = Number(getCachedAppSettings().defaultFocusMinutes) || 25;
  return Math.max(1, Math.round(minutes)) * 60;
}

export function getMaxZIndex(nodes: Node[]): number {
  let maxZ = 10;
  for (const n of nodes) {
    if (n.type === "projectFrame") continue;
    const styleZ = typeof n.style?.zIndex === "number" ? n.style.zIndex : undefined;
    const directZ = typeof n.zIndex === "number" ? n.zIndex : undefined;
    const z = styleZ ?? directZ ?? 0;
    if (z > maxZ) maxZ = z;
  }
  return maxZ;
}

export function findFrameAt(
  pos: { x: number; y: number },
  nodes: Node[]
): { frame: Node; relX: number; relY: number } | null {
  const frames = nodes.filter((n) => n.type === "projectFrame");
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    const fx = f.position.x;
    const fy = f.position.y;
    const fw = Number(f.style?.width ?? f.width ?? 640);
    const fh = Number(f.style?.height ?? f.height ?? 420);

    if (pos.x >= fx && pos.x <= fx + fw && pos.y >= fy && pos.y <= fy + fh) {
      return {
        frame: f,
        relX: Math.max(20, Math.min(fw - 280 - 20, Math.round(pos.x - fx))),
        relY: Math.max(68, Math.min(fh - 90 - 20, Math.round(pos.y - fy))),
      };
    }
  }
  return null;
}

export interface FlowCanvasState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  cursorPosition: { x: number; y: number } | null;
  setCursorPosition: (pos: { x: number; y: number } | null) => void;
  /** Text node whose content is being typed into; the toolbar shows formatting while set. */
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setSelectedNodeId: (id: string | null) => void;
  createTask: (props: {
    title: string;
    status?: "open" | "done";
    notes?: string;
    paper?: "cream" | "fog" | "bloom" | "sage";
    parentId?: string;
    position?: { x: number; y: number };
  }) => string;
  createProject: (props: {
    title: string;
    goal?: string;
    description?: string;
    accent?: string;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    captureNodeIds?: string[];
  }) => string;
  createBox: (props: {
    label: string;
    color?: string;
    strokeColor?: string;
    position?: { x: number; y: number };
  }) => string;
  createNote: (props: {
    title?: string;
    text: string;
    variant?: string;
    color?: string;
    corner?: string;
    parentId?: string;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  }) => string;
  /** One text concept: plain, sticky or card style, optionally actionable. */
  createText: (props: {
    text: string;
    style?: "plain" | "sticky" | "card";
    actionable?: boolean;
    position?: { x: number; y: number };
    parentId?: string;
    autoEdit?: boolean;
  }) => string;
  createImage: (props: {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    position?: { x: number; y: number };
    parentId?: string;
  }) => string;
  sweepCompletedTasks: (options?: {
    force?: boolean;
    workingHours?: { startMin: number; endMin: number };
    now?: Date;
  }) => Promise<{
    sweptCount: number;
    workdayId: string;
    sweptNodes: Node[];
    sweptEdges: Edge[];
  } | null>;
  restoreSweptTasks: (sweptNodes: Node[], sweptEdges: Edge[]) => Promise<boolean>;
  activeFocusNodeId: string | null;
  timerSecondsRemaining: number;
  isTimerRunning: boolean;
  /** Start (or with null, stop) focus on a node. Seconds default to the settings' focus length. */
  setActiveFocusNodeId: (id: string | null, seconds?: number) => void;
  setTimerSecondsRemaining: (updater: number | ((prev: number) => number)) => void;
  setIsTimerRunning: (updater: boolean | ((prev: boolean) => boolean)) => void;
  updateNodeData: (id: string, patch: Record<string, any>) => void;
  deleteNode: (id: string) => void;
  /** Delete several nodes in one undo step. Regions release their children. */
  deleteNodes: (ids: string[]) => void;
  updateEdgeData: (id: string, patch: Record<string, any>) => void;
  deleteEdge: (id: string) => void;
  duplicateSelected: () => void;
  resetBoard: () => void;
  loadSnapshot: () => void;
  groupSelectedNodes: (title?: string, description?: string) => string | null;
  ungroupSelectedNodes: () => boolean;

  // Multiboard Slice
  boards: BoardMeta[];
  activeBoardId: string;
  switchBoard: (targetId: string) => void;
  createBoard: (name?: string) => string;
  deleteBoard: (id: string) => void;
  renameBoard: (id: string, newName: string) => void;

  // Annotations Slice
  annotations: Record<string, Annotation>;
  activeAnnotationId: string | null;
  setActiveAnnotationId: (id: string | null) => void;
  addAnnotation: (params: {
    anchor: AnnotationAnchor;
    body: string;
    kind?: AnnotationKind;
    author?: AnnotationAuthor;
    aiVisible?: boolean;
  }) => string;
  replyAnnotation: (params: {
    annotationId: string;
    body: string;
    author?: AnnotationAuthor;
  }) => boolean;
  editAnnotationMessage: (params: {
    annotationId: string;
    messageId: string;
    body: string;
  }) => boolean;
  setAnnotationStatus: (annotationId: string, status: "open" | "resolved") => void;
  setAnnotationKind: (annotationId: string, kind: AnnotationKind) => void;
  toggleAnnotationAiVisible: (annotationId: string) => void;
  deleteAnnotation: (annotationId: string) => void;
  moveAnnotationAnchor: (annotationId: string, anchor: AnnotationAnchor) => void;
}

const initialBoards = getInitialBoards();
const initialActiveBoardId = getInitialActiveBoardId(initialBoards);
const initialSnapshot = loadBoardSnapshotFromStorage(initialActiveBoardId);

export const useFlowCanvasStore = create<FlowCanvasState>()(
  temporal(
    (set, get) => ({
      boards: initialBoards,
      activeBoardId: initialActiveBoardId,
      nodes: initialSnapshot.nodes,
      edges: initialSnapshot.edges,
      annotations: initialSnapshot.annotations,
      activeAnnotationId: null,
      selectedNodeId: null,
      cursorPosition: null,
      setCursorPosition: (pos) => set({ cursorPosition: pos }),
      editingNodeId: null,
      setEditingNodeId: (id) => set({ editingNodeId: id }),
      setActiveAnnotationId: (id) => set({ activeAnnotationId: id }),
      activeFocusNodeId: null,
      timerSecondsRemaining: focusLengthSeconds(),
      isTimerRunning: false,

      setActiveFocusNodeId: (id, seconds) =>
        set((state) => ({
          activeFocusNodeId: id,
          isTimerRunning: id !== null,
          timerSecondsRemaining: seconds ?? focusLengthSeconds(),
          selectedNodeId: id || state.selectedNodeId,
        })),

      setTimerSecondsRemaining: (updater) =>
        set((state) => ({
          timerSecondsRemaining:
            typeof updater === "function" ? updater(state.timerSecondsRemaining) : updater,
        })),

      setIsTimerRunning: (updater) =>
        set((state) => ({
          isTimerRunning:
            typeof updater === "function" ? updater(state.isTimerRunning) : updater,
        })),

      setNodes: (updater) =>
        set((state) => ({
          nodes: typeof updater === "function" ? updater(state.nodes) : updater,
        })),

      setEdges: (updater) =>
        set((state) => ({
          edges: typeof updater === "function" ? updater(state.edges) : updater,
        })),

      setSelectedNodeId: (id) =>
        set({ selectedNodeId: id }),

      createTask: (props) => {
        const state = get();
        const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const maxZ = getMaxZIndex(state.nodes);
        const nextZ = Math.max(100, maxZ + 1);

        let parentId = props.parentId;
        let pos = props.position;

        if (!parentId && pos) {
          const frameMatch = findFrameAt(pos, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          }
        } else if (!parentId && !pos && state.cursorPosition) {
          const frameMatch = findFrameAt(state.cursorPosition, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          } else {
            pos = {
              x: Math.round(state.cursorPosition.x - 140),
              y: Math.round(state.cursorPosition.y - 41),
            };
          }
        }

        const parentFrame = parentId ? state.nodes.find((n) => n.id === parentId) : null;

        if (!pos) {
          const existingTasks = state.nodes.filter(
            (n) => n.parentId === parentId && n.type === "focusTask"
          );
          const defaultX = parentId ? 40 : 400 + Math.random() * 40;
          const defaultY = parentId
            ? 100 + existingTasks.length * 94
            : 280 + Math.random() * 40;
          pos = { x: defaultX, y: defaultY };
        }

        const taskW = 280;
        const taskH = 160;
        pos = findNonOverlappingPosition(pos, { w: taskW, h: taskH }, state.nodes, parentId);

        const taskStyle = { width: taskW, height: taskH, zIndex: nextZ };

        const newNode: Node = {
          id,
          type: "focusTask",
          parentId,
          position: pos,
          style: taskStyle,
          data: {
            title: props.title,
            status: props.status || "open",
            actionable: true,
            paper: props.paper || "cream",
            notes: props.notes || "",
            borderStyle: "solid",
            completedAt: props.status === "done" ? Date.now() : undefined,
            completedVia: props.status === "done" ? "manual" : undefined,
          },
          selected: true,
        };

        let clearedNodes = state.nodes.map((n) =>
          n.selected ? { ...n, selected: false } : n
        );

        // If child is placed inside a project frame and extends beyond bottom edge, expand frame!
        if (parentId && parentFrame) {
          const currentParentH = Number(parentFrame.style?.height ?? parentFrame.height ?? 440);
          const requiredH = Math.max(currentParentH, pos.y + taskH + 40);
          if (requiredH > currentParentH) {
            clearedNodes = clearedNodes.map((n) =>
              n.id === parentId
                ? { ...n, style: { ...n.style, height: requiredH }, height: requiredH }
                : n
            );
          }
        }

        if (parentId) {
          const parentIdx = clearedNodes.findIndex((n) => n.id === parentId);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (
              insertIdx < clearedNodes.length &&
              clearedNodes[insertIdx].parentId === parentId
            ) {
              insertIdx++;
            }
            const copy = [...clearedNodes];
            copy.splice(insertIdx, 0, newNode);
            set({ nodes: copy, selectedNodeId: id });
            return id;
          }
        }

        set({
          nodes: [...clearedNodes, newNode],
          selectedNodeId: id,
        });
        return id;
      },

      createProject: (props) => {
        const state = get();
        const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // Spawn position: explicit prop > current cursor position > fallback
        const spawnPos = props.position || state.cursorPosition || {
          x: 200 + Math.random() * 40,
          y: 200 + Math.random() * 40,
        };

        const projX = Math.round(spawnPos.x);
        const projY = Math.round(spawnPos.y);
        const defaultW = props.width || 680;
        const defaultH = props.height || 440;

        // 1. Identify unparented candidates in the vicinity ("bring inside what is the place its created")
        const candidates = state.nodes.filter(
          (n) => n.type !== "projectFrame" && !n.parentId
        );

        const getCandidateMetrics = (n: Node) => {
          const nw = Number(
            n.style?.width ?? (n.width ?? (n.type === "focusTask" ? 280 : n.type === "box" ? 220 : n.type === "circle" ? 160 : 180))
          );
          const nh = Number(
            n.style?.height ?? (n.height ?? (n.type === "focusTask" ? 160 : n.type === "box" ? 140 : n.type === "circle" ? 160 : 60))
          );
          const nx = n.position.x;
          const ny = n.position.y;
          const ncx = nx + nw / 2;
          const ncy = ny + nh / 2;
          return { nx, ny, nw, nh, ncx, ncy };
        };

        const explicitCaptureIds = props.captureNodeIds ? new Set(props.captureNodeIds) : null;

        const capturedNodes = candidates.filter((n) => {
          if (explicitCaptureIds) return explicitCaptureIds.has(n.id);
          if (n.selected) return true;
          const { nx, ny, nw, nh, ncx, ncy } = getCandidateMetrics(n);

          // Center inside default bounds (with small generous margin)
          const centerInside =
            ncx >= projX - 20 &&
            ncx <= projX + defaultW + 20 &&
            ncy >= projY - 20 &&
            ncy <= projY + defaultH + 20;

          // Bounding box overlap
          const bboxOverlap =
            nx < projX + defaultW &&
            nx + nw > projX &&
            ny < projY + defaultH &&
            ny + nh > projY;

          // Proximity to spawn cursor point
          const distToCursor = Math.hypot(ncx - spawnPos.x, ncy - spawnPos.y);
          const nearCursor = distToCursor < 180;

          return centerInside || bboxOverlap || nearCursor;
        });

        let frameX = projX;
        let frameY = projY;
        let frameW = defaultW;
        let frameH = defaultH;

        if (capturedNodes.length > 0) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;

          for (const n of capturedNodes) {
            const { nx, ny, nw, nh } = getCandidateMetrics(n);
            minX = Math.min(minX, nx);
            minY = Math.min(minY, ny);
            maxX = Math.max(maxX, nx + nw);
            maxY = Math.max(maxY, ny + nh);
          }

          // Frame envelops all captured nodes comfortably
          // Header sits in 0..48, so minY - 70 ensures child content sits below the header line
          frameX = Math.min(projX, minX - 28);
          frameY = Math.min(projY, minY - 70);
          frameW = Math.max(defaultW, maxX - frameX + 36);
          frameH = Math.max(defaultH, maxY - frameY + 36);
        }

        const capturedIds = new Set(capturedNodes.map((c) => c.id));
        const maxZ = getMaxZIndex(state.nodes);
        let childZ = Math.max(10, maxZ);

        // Reparent captured nodes relative to new frame position
        const childNodes: Node[] = capturedNodes.map((c) => {
          const relX = Math.round(c.position.x - frameX);
          const relY = Math.round(c.position.y - frameY);
          const updated = {
            ...c,
            parentId: id,
            position: { x: Math.max(24, relX), y: Math.max(68, relY) },
            style: {
              ...c.style,
              zIndex: typeof c.style?.zIndex === "number" ? Math.max(10, c.style.zIndex) : ++childZ,
            },
            selected: false,
          };
          delete (updated as any).extent;
          return updated;
        });

        // Project frame base container (zIndex: 0 so it stays underneath child tasks and shapes)
        const projectNode: Node = {
          id,
          type: "projectFrame",
          position: { x: frameX, y: frameY },
          style: { width: frameW, height: frameH, zIndex: 0 },
          data: {
            title: props.title,
            goal: props.goal || "",
            description: props.description || "",
            accent: props.accent || "blue",
            borderStyle: "solid",
          },
          selected: true,
        };

        const unaffectedNodes = state.nodes
          .filter((n) => !capturedIds.has(n.id))
          .map((n) => (n.selected ? { ...n, selected: false } : n));

        // In React Flow, parent node MUST precede its children in the nodes array
        const newNodes = [...unaffectedNodes, projectNode, ...childNodes];

        set({
          nodes: newNodes,
          selectedNodeId: id,
        });

        return id;
      },

      createBox: (props) => {
        const state = get();
        const id = `box-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const maxZ = getMaxZIndex(state.nodes);
        const nextZ = Math.max(100, maxZ + 1);

        let pos = props.position;
        let parentId: string | undefined = undefined;

        if (!pos && state.cursorPosition) {
          const frameMatch = findFrameAt(state.cursorPosition, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          } else {
            pos = {
              x: Math.round(state.cursorPosition.x - 110),
              y: Math.round(state.cursorPosition.y - 70),
            };
          }
        }

        if (!pos) {
          pos = {
            x: 300 + Math.random() * 40,
            y: 150 + Math.random() * 40,
          };
        }

        const newNode: Node = {
          id,
          type: "box",
          parentId,
          position: pos,
          style: { width: 220, height: 140, zIndex: nextZ },
          data: {
            label: props.label,
            color: props.color || "rgba(16, 185, 129, 0.08)",
            strokeColor: props.strokeColor || "#10b981",
            borderStyle: "solid",
            roughness: 1.8,
          },
          selected: true,
        };

        const clearedNodes = state.nodes.map((n) =>
          n.selected ? { ...n, selected: false } : n
        );

        if (parentId) {
          const parentIdx = clearedNodes.findIndex((n) => n.id === parentId);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (
              insertIdx < clearedNodes.length &&
              clearedNodes[insertIdx].parentId === parentId
            ) {
              insertIdx++;
            }
            const copy = [...clearedNodes];
            copy.splice(insertIdx, 0, newNode);
            set({ nodes: copy, selectedNodeId: id });
            return id;
          }
        }

        set({
          nodes: [...clearedNodes, newNode],
          selectedNodeId: id,
        });
        return id;
      },

      createNote: (props) => {
        const state = get();
        const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const maxZ = getMaxZIndex(state.nodes);
        const nextZ = Math.max(100, maxZ + 1);

        let parentId = props.parentId;
        let pos = props.position;

        if (!parentId && pos) {
          const frameMatch = findFrameAt(pos, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          }
        } else if (!parentId && !pos && state.cursorPosition) {
          const frameMatch = findFrameAt(state.cursorPosition, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          } else {
            pos = {
              x: Math.round(state.cursorPosition.x - 120),
              y: Math.round(state.cursorPosition.y - 90),
            };
          }
        }

        if (!pos) {
          const defaultX = parentId ? 40 : 360 + Math.random() * 40;
          const defaultY = parentId ? 100 : 220 + Math.random() * 40;
          pos = { x: defaultX, y: defaultY };
        }

        const isNew = !props.text && !props.title;
        const normalizedVariant = props.variant || (props.color === 'pink' ? 'rose' : props.color) || 'yellow';

        const newNode: Node = {
          id,
          type: "note",
          parentId,
          position: pos,
          style: { width: props.width || 240, height: props.height || 180, zIndex: nextZ },
          data: {
            title: props.title || "Note",
            text: props.text || "",
            variant: normalizedVariant,
            color: props.color,
            ...(props.corner ? { corner: props.corner } : {}),
            isNew,
            autoEdit: isNew,
          },
          selected: true,
        };

        const clearedNodes = state.nodes.map((n) =>
          n.selected ? { ...n, selected: false } : n
        );

        if (parentId) {
          const parentIdx = clearedNodes.findIndex((n) => n.id === parentId);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (
              insertIdx < clearedNodes.length &&
              clearedNodes[insertIdx].parentId === parentId
            ) {
              insertIdx++;
            }
            const copy = [...clearedNodes];
            copy.splice(insertIdx, 0, newNode);
            set({ nodes: copy, selectedNodeId: id });
            return id;
          }
        }

        set({
          nodes: [...clearedNodes, newNode],
          selectedNodeId: id,
        });
        return id;
      },

      createText: (props) => {
        const style = props.style || "plain";
        if (style === "card") {
          const [first, ...rest] = (props.text || "").split("\n");
          return get().createTask({
            title: first.trim() || "Untitled",
            notes: rest.join("\n").trim(),
            parentId: props.parentId,
            position: props.position,
          });
        }
        if (style === "sticky") {
          const id = get().createNote({
            text: props.text,
            parentId: props.parentId,
            position: props.position,
          });
          if (props.actionable) get().updateNodeData(id, { actionable: true, status: "open" });
          return id;
        }

        const state = get();
        const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const nextZ = Math.max(100, getMaxZIndex(state.nodes) + 1);
        let parentId = props.parentId;
        let pos = props.position || state.cursorPosition || { x: 360, y: 240 };
        if (!parentId) {
          const frameMatch = findFrameAt(pos, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          }
        }
        const autoEdit = props.autoEdit ?? !props.text;
        const newNode: Node = {
          id,
          type: "text",
          parentId,
          position: pos,
          style: { width: 260, zIndex: nextZ },
          data: {
            text: props.text || "",
            ...(props.actionable ? { actionable: true, status: "open" } : {}),
            ...(autoEdit ? { isNew: true, autoEdit: true } : {}),
          },
          selected: true,
        };
        const cleared = state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
        set({ nodes: orderParentsFirst([...cleared, newNode]), selectedNodeId: id });
        return id;
      },

      createImage: (props) => {
        const state = get();
        const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const maxZ = getMaxZIndex(state.nodes);
        const nextZ = Math.max(100, maxZ + 1);

        let parentId = props.parentId;
        let pos = props.position;

        if (!parentId && pos) {
          const frameMatch = findFrameAt(pos, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          }
        } else if (!parentId && !pos && state.cursorPosition) {
          const frameMatch = findFrameAt(state.cursorPosition, state.nodes);
          if (frameMatch) {
            parentId = frameMatch.frame.id;
            pos = { x: frameMatch.relX, y: frameMatch.relY };
          } else {
            pos = {
              x: Math.round(state.cursorPosition.x - (props.width ? props.width / 2 : 160)),
              y: Math.round(state.cursorPosition.y - (props.height ? props.height / 2 : 120)),
            };
          }
        }

        if (!pos) {
          pos = { x: 320, y: 220 };
        }

        const newNode: Node = {
          id,
          type: "image",
          parentId,
          position: pos,
          style: { width: props.width || 320, height: props.height || 240, zIndex: nextZ },
          data: {
            src: props.src,
            alt: props.alt || "Pasted Image",
          },
          selected: true,
        };

        const clearedNodes = state.nodes.map((n) =>
          n.selected ? { ...n, selected: false } : n
        );

        if (parentId) {
          const parentIdx = clearedNodes.findIndex((n) => n.id === parentId);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (
              insertIdx < clearedNodes.length &&
              clearedNodes[insertIdx].parentId === parentId
            ) {
              insertIdx++;
            }
            const copy = [...clearedNodes];
            copy.splice(insertIdx, 0, newNode);
            set({ nodes: copy, selectedNodeId: id });
            return id;
          }
        }

        set({
          nodes: [...clearedNodes, newNode],
          selectedNodeId: id,
        });
        return id;
      },

      sweepCompletedTasks: async (options) => {
        const state = get();
        // Focus protection guardrail: if focus timer is running, pause sweep
        if (state.isTimerRunning || state.activeFocusNodeId) {
          return null;
        }

        const workingHours = options?.workingHours || { startMin: 540, endMin: 1020 };
        const now = options?.now || new Date();
        const force = options?.force ?? false;

        const currentNodes = [...state.nodes];
        const currentEdges = [...state.edges];

        // 1. Identify completed actionable nodes (any text style)
        const doneTasks = currentNodes.filter(
          (n) => isActionable(n) && (n.data as any)?.status === "done"
        );

        if (doneTasks.length === 0) return null;

        // 2. Filter by eligibility unless forced
        const eligibleTasks: Array<{ node: Node; workdayId: string }> = [];
        for (const t of doneTasks) {
          const completedAt = (t.data as any)?.completedAt || Date.now();
          if (force) {
            eligibleTasks.push({
              node: t,
              workdayId: formatWorkdayId(new Date(completedAt)),
            });
          } else {
            const { eligible, workdayId } = isTaskEligibleForSweep(completedAt, now, workingHours);
            if (eligible) {
              eligibleTasks.push({ node: t, workdayId });
            }
          }
        }

        if (eligibleTasks.length === 0) return null;

        const sweptNodeIds = new Set(eligibleTasks.map((et) => et.node.id));
        const sweptNodes = eligibleTasks.map((et) => et.node);

        // Group by workdayId for logbook batching
        const tasksByWorkday = new Map<string, Node[]>();
        for (const { node, workdayId } of eligibleTasks) {
          const list = tasksByWorkday.get(workdayId) || [];
          list.push(node);
          tasksByWorkday.set(workdayId, list);
        }

        // 3. Find connected edges to be swept
        const sweptEdges = currentEdges.filter(
          (e) => sweptNodeIds.has(e.source) || sweptNodeIds.has(e.target)
        );

        // 4. Update live downstream dependents with resolvedDependencies
        const updatedNodes = currentNodes
          .filter((n) => !sweptNodeIds.has(n.id))
          .map((n) => {
            if (!isActionable(n)) return n;
            const d = (n.data || {}) as Record<string, any>;
            const liveDependencies = Array.isArray(d.dependencies) ? [...d.dependencies] : [];
            const resolvedList = Array.isArray(d.resolvedDependencies) ? [...d.resolvedDependencies] : [];

            let hasChange = false;
            for (const sweptNode of sweptNodes) {
              const sweptData = (sweptNode.data || {}) as Record<string, any>;
              const isDep = liveDependencies.includes(sweptNode.id);
              const hasEdgeFromSwept = currentEdges.some(
                (e) => e.source === sweptNode.id && e.target === n.id
              );

              if (isDep || hasEdgeFromSwept) {
                if (!resolvedList.some((r) => r.id === sweptNode.id)) {
                  resolvedList.push({
                    id: sweptNode.id,
                    title: nodeTitle(sweptNode) || "Untitled",
                    completedAt: sweptData.completedAt || Date.now(),
                  });
                  hasChange = true;
                }
              }
            }

            if (hasChange) {
              return {
                ...n,
                data: {
                  ...d,
                  resolvedDependencies: resolvedList,
                },
              };
            }
            return n;
          });

        // 5. Build LogbookEntry records and persist by workdayId
        for (const [workdayId, taskNodes] of tasksByWorkday.entries()) {
          const entries: LogbookEntry[] = taskNodes.map((node) => {
            const d = (node.data || {}) as Record<string, any>;
            const dependents = currentNodes
              .filter(
                (other) =>
                  other.id !== node.id &&
                  ((other.data as any)?.dependencies?.includes(node.id) ||
                    currentEdges.some((e) => e.source === node.id && e.target === other.id))
              )
              .map((other) => other.id);

            const parentFrame = node.parentId ? currentNodes.find((p) => p.id === node.parentId) : null;
            const isProject = parentFrame?.type === "projectFrame";

            const edgeLinks = currentEdges
              .filter((e) => e.source === node.id || e.target === node.id)
              .map((e) => (e.source === node.id ? e.target : e.source));

            return {
              id: node.id,
              title: nodeTitle(node) || "Untitled",
              notes: d.notes,
              completedAt: d.completedAt || Date.now(),
              completedVia: d.completedVia || "manual",
              focusSecondsSpent: d.focusSecondsSpent || 0,
              projectId: isProject ? parentFrame?.id : undefined,
              projectTitle: isProject ? (parentFrame?.data as any)?.title : undefined,
              githubRepo: d.githubRepo,
              githubIssueNumber: d.githubIssueNumber,
              relations: {
                dependents,
                dependencies: Array.isArray(d.dependencies) ? d.dependencies : [],
                edgeLinks,
                parentTaskId: d.parentTaskId,
              },
              lastPosition: {
                x: node.position.x,
                y: node.position.y,
                parentId: node.parentId,
              },
              node: {
                type: node.type,
                data: node.data as Record<string, unknown>,
                style: node.style as Record<string, unknown> | undefined,
              },
            };
          });

          await appendLogbookEntries({
            workdayId,
            window: workingHours,
            entries,
          });
        }

        // 6. Remove swept edges
        const remainingEdges = currentEdges.filter(
          (e) => !sweptNodeIds.has(e.source) && !sweptNodeIds.has(e.target)
        );

        const finalNodes = updatedNodes;

        set({
          nodes: finalNodes,
          edges: remainingEdges,
          selectedNodeId: sweptNodeIds.has(state.selectedNodeId || "") ? null : state.selectedNodeId,
        });

        return {
          sweptCount: sweptNodes.length,
          workdayId: Array.from(tasksByWorkday.keys())[0] || formatWorkdayId(now),
          sweptNodes,
          sweptEdges,
        };
      },

      restoreSweptTasks: async (sweptNodes, sweptEdges) => {
        const state = get();
        if (!sweptNodes || sweptNodes.length === 0) return false;

        const restoredIds = new Set(sweptNodes.map((n) => n.id));

        // 1. Remove entries from Logbook files
        for (const node of sweptNodes) {
          await removeLogbookEntry(node.id);
        }

        // 2. Re-insert nodes and edges onto canvas
        const existingNodeIds = new Set(state.nodes.map((n) => n.id));
        const nodesToAdd = sweptNodes.filter((n) => !existingNodeIds.has(n.id));

        const existingEdgeIds = new Set(state.edges.map((e) => e.id));
        const edgesToAdd = sweptEdges.filter((e) => !existingEdgeIds.has(e.id));

        // 3. Clean up resolvedDependencies on live nodes
        const updatedNodes = state.nodes.map((n) => {
          if (!isActionable(n)) return n;
          const d = (n.data || {}) as Record<string, any>;
          if (Array.isArray(d.resolvedDependencies)) {
            const nextResolved = d.resolvedDependencies.filter((r: any) => !restoredIds.has(r.id));
            if (nextResolved.length !== d.resolvedDependencies.length) {
              return {
                ...n,
                data: {
                  ...d,
                  resolvedDependencies: nextResolved,
                },
              };
            }
          }
          return n;
        });

        const mergedNodes = orderParentsFirst([...updatedNodes, ...nodesToAdd]);
        const mergedEdges = [...state.edges, ...edgesToAdd];

        set({
          nodes: mergedNodes,
          edges: mergedEdges,
        });

        return true;
      },

      updateNodeData: (id, patch) => {
        const state = get();
        const currentTask = state.nodes.find((n) => n.id === id);
        const wasDone = (currentTask?.data as any)?.status === "done";
        const isBecomingDone = patch.status === "done" && !wasDone;
        const isReopeningFromDone = wasDone && patch.status !== undefined && patch.status !== "done";

        // Auto-stamp completedAt on transition to done, and clear completedAt if reopened
        const enrichedPatch: Record<string, any> = { ...patch };
        if (isBecomingDone && enrichedPatch.completedAt === undefined) {
          enrichedPatch.completedAt = Date.now();
          if (!enrichedPatch.completedVia) {
            enrichedPatch.completedVia = "manual";
          }
        } else if (isReopeningFromDone && enrichedPatch.completedAt === undefined) {
          enrichedPatch.completedAt = undefined;
          enrichedPatch.completedVia = undefined;
        }

        const updatedNodes = state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...enrichedPatch } } : n
        );

        set({ nodes: updatedNodes });
      },

      deleteNode: (id) => get().deleteNodes([id]),

      deleteNodes: (ids) =>
        set((state) => {
          const deletedIds = new Set<string>(ids);
          if (deletedIds.size === 0) return {};
          const byId = new Map(state.nodes.map((n) => [n.id, n]));

          // Deleting a region never deletes what is inside it: children move
          // to the nearest surviving ancestor (usually the canvas) at the same spot.
          const releasedNodes = state.nodes.map((n) => {
            if (!n.parentId || !deletedIds.has(n.parentId) || deletedIds.has(n.id)) return n;
            let x = n.position.x;
            let y = n.position.y;
            let parent = byId.get(n.parentId);
            while (parent && deletedIds.has(parent.id)) {
              x += parent.position.x;
              y += parent.position.y;
              parent = parent.parentId ? byId.get(parent.parentId) : undefined;
            }
            const released: Node = { ...n, position: { x: Math.round(x), y: Math.round(y) } };
            if (parent) released.parentId = parent.id;
            else delete released.parentId;
            delete (released as any).extent;
            return released;
          });

          // Cascade deletion to any annotations anchored to the deleted nodes
          const nextAnnotations = { ...state.annotations };
          for (const [annId, ann] of Object.entries(nextAnnotations)) {
            if (ann.anchor.nodeId && deletedIds.has(ann.anchor.nodeId)) {
              delete nextAnnotations[annId];
            }
          }

          const nextActiveAnnId =
            state.activeAnnotationId && nextAnnotations[state.activeAnnotationId]
              ? state.activeAnnotationId
              : null;
          const focusDeleted = Boolean(state.activeFocusNodeId && deletedIds.has(state.activeFocusNodeId));

          return {
            nodes: releasedNodes.filter((n) => !deletedIds.has(n.id)),
            edges: state.edges.filter(
              (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
            ),
            annotations: nextAnnotations,
            activeAnnotationId: nextActiveAnnId,
            selectedNodeId: deletedIds.has(state.selectedNodeId || "") ? null : state.selectedNodeId,
            ...(focusDeleted ? { activeFocusNodeId: null, isTimerRunning: false } : {}),
          };
        }),

      updateEdgeData: (id, patch) =>
        set((state) => ({
          edges: state.edges.map((e) => {
            if (e.id !== id) return e;
            return {
              ...e,
              animated: patch.animated !== undefined ? Boolean(patch.animated) : e.animated,
              data: { ...e.data, ...patch },
            };
          }),
        })),

      deleteEdge: (id) =>
        set((state) => ({
          edges: state.edges.filter((e) => e.id !== id),
        })),

      duplicateSelected: () =>
        set((state) => {
          const selected = state.nodes.filter((n) => n.selected);
          if (!selected.length) return {};

          const OFFSET = 24;
          const idMap = new Map<string, string>();
          const maxZ = getMaxZIndex(state.nodes);
          let nextZ = Math.max(100, maxZ + 1);

          const clones: Node[] = selected.map((n) => {
            const newId = `${n.type ?? "node"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              selected: true,
              parentId: n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId)! : undefined,
              position: { x: n.position.x + OFFSET, y: n.position.y + OFFSET },
              style: {
                ...n.style,
                zIndex: n.type === "projectFrame" ? 0 : nextZ++,
              },
            };
          });

          return {
            nodes: [
              ...state.nodes.map((n) => ({ ...n, selected: false })),
              ...clones,
            ],
            selectedNodeId: clones.length === 1 ? clones[0].id : null,
          };
        }),

      switchBoard: (targetId: string) => {
        const state = get();
        if (targetId === state.activeBoardId) return;

        const storage = getCanvasStorage();

        // 1. Immediately snapshot current board
        const previous = storage.loadBoardSync(state.activeBoardId);
        storage.saveBoardSync(
          state.activeBoardId,
          nextBoardSnapshot({
            nodes: state.nodes,
            edges: state.edges,
            annotations: state.annotations,
            previous,
          })
        );

        // 2. Load target board nodes, edges, annotations
        const targetSnapshot = loadBoardSnapshotFromStorage(targetId);

        // 3. Update active-board pointers
        const targetBoard = state.boards.find((b) => b.id === targetId);
        storage.setActiveBoardIdSync(targetId, targetBoard?.name);

        // 4. Update store state
        set({
          activeBoardId: targetId,
          nodes: targetSnapshot.nodes,
          edges: targetSnapshot.edges,
          annotations: targetSnapshot.annotations,
          selectedNodeId: null,
          activeFocusNodeId: null,
          activeAnnotationId: null,
          isTimerRunning: false,
        });

        // 5. Clear undo/redo history for the clean switch
        try {
          useFlowCanvasStore.temporal.getState().clear();
        } catch {}

        // 6. Center canvas on new board
        if (typeof window !== "undefined") {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("foqz:flow-zoom-fit"));
          }, 50);
        }
      },

      createBoard: (name?: string) => {
        const state = get();
        const newId = `board-${Date.now()}`;
        const newName = name?.trim() || `Foqz Board ${state.boards.length + 1}`;
        const newEntry: BoardMeta = {
          id: newId,
          name: newName,
          createdAt: Date.now(),
        };
        const updatedBoards = [...state.boards, newEntry];

        getCanvasStorage().saveBoardCatalogSync(updatedBoards);

        set({ boards: updatedBoards });
        get().switchBoard(newId);
        return newId;
      },

      deleteBoard: (boardIdToDelete: string) => {
        const state = get();
        if (state.boards.length <= 1) return;

        const remaining = state.boards.filter((b) => b.id !== boardIdToDelete);
        const storage = getCanvasStorage();
        storage.saveBoardCatalogSync(remaining);
        storage.deleteBoardSync(boardIdToDelete);

        set({ boards: remaining });

        if (state.activeBoardId === boardIdToDelete) {
          get().switchBoard(remaining[0].id);
        }
      },

      renameBoard: (idToRename: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        const state = get();
        const updatedBoards = state.boards.map((b) =>
          b.id === idToRename ? { ...b, name: trimmed } : b
        );

        const storage = getCanvasStorage();
        storage.saveBoardCatalogSync(updatedBoards);
        if (idToRename === state.activeBoardId) {
          storage.setActiveBoardIdSync(idToRename, trimmed);
        }

        set({ boards: updatedBoards });
      },

      resetBoard: () => {
        const state = get();
        getCanvasStorage().deleteBoardSync(state.activeBoardId);
        if (
          state.activeBoardId === DEFAULT_BOARD_ID &&
          typeof window !== "undefined" &&
          window.focusStore?.clearBoardFile
        ) {
          try {
            window.focusStore.clearBoardFile();
          } catch {}
        }
        set({
          nodes: [],
          edges: [],
          annotations: {},
          activeAnnotationId: null,
          selectedNodeId: null,
          activeFocusNodeId: null,
          isTimerRunning: false,
        });
        try {
          useFlowCanvasStore.temporal.getState().clear();
        } catch {}
      },

      loadSnapshot: () => {
        try {
          const state = get();
          const snapshot = loadBoardSnapshotFromStorage(state.activeBoardId);
          set({
            nodes: snapshot.nodes,
            edges: snapshot.edges,
            annotations: snapshot.annotations,
          });
        } catch (err) {
          console.warn("Failed to load Flow snapshot:", err);
        }
      },

      groupSelectedNodes: (title?: string, description?: string) => {
        const state = get();
        const selected = state.nodes.filter(
          (n) => n.selected && n.type !== "projectFrame"
        );
        if (selected.length === 0) return null;

        const groupTitle = title || "Region";
        const groupId = state.createProject({
          title: groupTitle,
          description: description || "",
          goal: description || "",
          accent: "indigo",
          captureNodeIds: selected.map((s) => s.id),
        });

        return groupId;
      },

      ungroupSelectedNodes: () => {
        const state = get();
        const selectedFrames = state.nodes.filter(
          (n) => n.selected && n.type === "projectFrame"
        );
        if (selectedFrames.length === 0) return false;

        const frameIds = new Set(selectedFrames.map((f) => f.id));
        const framesMap = new Map(selectedFrames.map((f) => [f.id, f]));

        // Reparent children to canvas root by converting relative coordinates to absolute coordinates
        const updatedNodes: Node[] = [];
        for (const n of state.nodes) {
          if (frameIds.has(n.id)) {
            // Remove the grouping frame
            continue;
          }
          if (n.parentId && frameIds.has(n.parentId)) {
            const parent = framesMap.get(n.parentId)!;
            const absX = Math.round(parent.position.x + n.position.x);
            const absY = Math.round(parent.position.y + n.position.y);
            const copy = {
              ...n,
              parentId: undefined,
              position: { x: absX, y: absY },
              selected: true,
            };
            delete copy.parentId;
            updatedNodes.push(copy);
          } else {
            updatedNodes.push(n);
          }
        }

        set({
          nodes: updatedNodes,
          selectedNodeId: null,
        });
        return true;
      },

      addAnnotation: (params) => {
        const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = Date.now();
        const newAnnotation: Annotation = {
          id,
          anchor: params.anchor,
          kind: params.kind || 'comment',
          status: 'open',
          aiVisible: params.aiVisible !== false,
          createdAt: now,
          updatedAt: now,
          messages: [
            {
              id: messageId,
              author: params.author || 'user',
              body: params.body,
              createdAt: now,
            },
          ],
        };

        set((state) => ({
          annotations: {
            ...state.annotations,
            [id]: newAnnotation,
          },
          activeAnnotationId: id,
        }));

        return id;
      },

      replyAnnotation: (params) => {
        const state = get();
        const target = state.annotations[params.annotationId];
        if (!target) return false;

        const now = Date.now();
        const newMsg = {
          id: `msg-${now}-${Math.random().toString(36).slice(2, 6)}`,
          author: params.author || 'user',
          body: params.body,
          createdAt: now,
        };

        set({
          annotations: {
            ...state.annotations,
            [params.annotationId]: {
              ...target,
              updatedAt: now,
              messages: [...target.messages, newMsg],
            },
          },
        });
        return true;
      },

      editAnnotationMessage: (params) => {
        const state = get();
        const target = state.annotations[params.annotationId];
        if (!target) return false;

        const updatedMessages = target.messages.map((m) => {
          if (m.id !== params.messageId) return m;
          return {
            ...m,
            body: params.body,
            editedAt: Date.now(),
          };
        });

        set({
          annotations: {
            ...state.annotations,
            [params.annotationId]: {
              ...target,
              updatedAt: Date.now(),
              messages: updatedMessages,
            },
          },
        });
        return true;
      },

      setAnnotationStatus: (annotationId, status) => {
        set((state) => {
          const target = state.annotations[annotationId];
          if (!target) return {};
          return {
            annotations: {
              ...state.annotations,
              [annotationId]: {
                ...target,
                status,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setAnnotationKind: (annotationId, kind) => {
        set((state) => {
          const target = state.annotations[annotationId];
          if (!target) return {};
          return {
            annotations: {
              ...state.annotations,
              [annotationId]: {
                ...target,
                kind,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      toggleAnnotationAiVisible: (annotationId) => {
        set((state) => {
          const target = state.annotations[annotationId];
          if (!target) return {};
          return {
            annotations: {
              ...state.annotations,
              [annotationId]: {
                ...target,
                aiVisible: !target.aiVisible,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      deleteAnnotation: (annotationId) => {
        set((state) => {
          const next = { ...state.annotations };
          delete next[annotationId];
          return {
            annotations: next,
            activeAnnotationId:
              state.activeAnnotationId === annotationId ? null : state.activeAnnotationId,
          };
        });
      },

      moveAnnotationAnchor: (annotationId, anchor) => {
        set((state) => {
          const target = state.annotations[annotationId];
          if (!target) return {};
          return {
            annotations: {
              ...state.annotations,
              [annotationId]: {
                ...target,
                anchor,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
    }),
    {
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        annotations: state.annotations,
      }),
      equality: (pastState, currentState) =>
        pastState.nodes === currentState.nodes &&
        pastState.edges === currentState.edges &&
        pastState.annotations === currentState.annotations,
      limit: 100,
    }
  )
);

export function useTemporalFlowStore<T>(
  selector: (state: TemporalState<Pick<FlowCanvasState, "nodes" | "edges" | "annotations">>) => T,
  equality?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    useFlowCanvasStore.temporal,
    selector,
    equality
  );
}

if (typeof window !== "undefined") {
  (window as any).useFlowCanvasStore = useFlowCanvasStore;
}



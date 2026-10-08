import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { temporal, type TemporalState } from "zundo";
import type { Node, Edge } from "@xyflow/react";
import { RUNWAY_TEMPLATES, type RunwayTemplateId } from "@/types/canvas";
import type { Annotation, AnnotationKind, AnnotationAnchor, AnnotationAuthor } from "@/types/annotations";
import { findNonOverlappingPosition, arrangeLayout } from "@/lib/canvasLayout";

export const FLOW_STORAGE_KEY = "foqz_reactflow_poc_board_v1";
export const STORAGE_BOARDS_KEY = "foqz_multiboards_meta_v1";
export const ACTIVE_BOARD_KEY = "foqz_active_board_id";

export interface BoardEntry {
  id: string;
  name: string;
  createdAt: number;
}

export function getBoardStorageKey(boardId: string): string {
  return boardId === "board-default" ? FLOW_STORAGE_KEY : `foqz_board_snapshot_${boardId}`;
}

export function getInitialBoards(): BoardEntry[] {
  try {
    if (typeof localStorage === "undefined") {
      return [{ id: "board-default", name: "Foqz Board 1", createdAt: Date.now() }];
    }
    const raw = localStorage.getItem(STORAGE_BOARDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    const initialName = localStorage.getItem("foqz_board_name") || "Foqz Board 1";
    return [{ id: "board-default", name: initialName, createdAt: Date.now() }];
  } catch {
    return [{ id: "board-default", name: "Foqz Board 1", createdAt: Date.now() }];
  }
}

export function getInitialActiveBoardId(boards: BoardEntry[]): string {
  try {
    if (typeof localStorage === "undefined") return "board-default";
    const active = localStorage.getItem(ACTIVE_BOARD_KEY);
    if (active && boards.some((b) => b.id === active)) {
      return active;
    }
    return boards[0]?.id || "board-default";
  } catch {
    return boards[0]?.id || "board-default";
  }
}

export function loadBoardSnapshotFromStorage(boardId: string): {
  nodes: Node[];
  edges: Edge[];
  annotations: Record<string, Annotation>;
} {
  try {
    if (typeof localStorage === "undefined") {
      return {
        nodes: boardId === "board-default" ? INITIAL_NODES : [],
        edges: boardId === "board-default" ? INITIAL_EDGES : [],
        annotations: {},
      };
    }
    const key = getBoardStorageKey(boardId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        annotations: parsed.annotations && typeof parsed.annotations === "object" ? parsed.annotations : {},
      };
    }
    if (boardId === "board-default") {
      return { nodes: INITIAL_NODES, edges: INITIAL_EDGES, annotations: {} };
    }
    return { nodes: [], edges: [], annotations: {} };
  } catch {
    return {
      nodes: boardId === "board-default" ? INITIAL_NODES : [],
      edges: boardId === "board-default" ? INITIAL_EDGES : [],
      annotations: {},
    };
  }
}

export const INITIAL_NODES: Node[] = [
  {
    id: "proj-1",
    type: "projectFrame",
    position: { x: 80, y: 80 },
    style: { width: 720, height: 440 },
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
      priority: 1,
      paper: "sage",
      borderStyle: "solid",
      notes: "Double click me to edit title",
    },
  },
  {
    id: "task-2",
    type: "focusTask",
    parentId: "proj-1",
    position: { x: 40, y: 220 },
    style: { width: 280, height: 82 },
    data: {
      title: "Connect task cards to sketch boxes",
      status: "doing",
      priority: 2,
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
    data: { relation: "aggregates" },
  },
];

export function getMaxZIndex(nodes: Node[]): number {
  let maxZ = 10;
  for (const n of nodes) {
    if (n.type === "projectFrame" || n.type === "runwayFrame") continue;
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
  const frames = nodes.filter((n) => n.type === "projectFrame" || n.type === "runwayFrame");
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    const fx = f.position.x;
    const fy = f.position.y;
    const fw = Number(f.style?.width ?? f.width ?? 640);
    const fh = Number(f.style?.height ?? f.height ?? 420);

    if (pos.x >= fx && pos.x <= fx + fw && pos.y >= fy && pos.y <= fy + fh) {
      const isRunway =
        f.type === "runwayFrame" ||
        String((f.data as any)?.title || "").includes("Runway");

      if (isRunway) {
        const dropRelY = Math.round(pos.y - fy);
        const slotIdx = Math.max(0, Math.min(4, Math.round((dropRelY - 82) / 60)));
        return {
          frame: f,
          relX: 24,
          relY: 82 + slotIdx * 60,
        };
      }

      return {
        frame: f,
        relX: Math.max(20, Math.min(fw - 280 - 20, Math.round(pos.x - fx))),
        relY: Math.max(68, Math.min(fh - 90 - 20, Math.round(pos.y - fy))),
      };
    }
  }
  return null;
}

export function realignRunwayNodes(
  nodes: Node[],
  targetRunwayId: string,
  activeFocusId: string | null
): Node[] {
  const runway = nodes.find((n) => n.id === targetRunwayId);
  if (!runway) return nodes;

  const runwayTasks = nodes
    .filter((n) => n.parentId === targetRunwayId && n.type === "focusTask")
    .sort((a, b) => a.position.y - b.position.y);

  if (runwayTasks.length === 0) return nodes;

  const runwayW = Number(runway.style?.width ?? runway.width ?? 680);
  const taskW = Math.max(300, runwayW - 48);
  let currentY = 82;

  const taskUpdates = new Map<string, { y: number; h: number }>();

  for (const t of runwayTasks) {
    const isFocused = t.id === activeFocusId;
    const isExpanded = Boolean((t.data as any)?.isExpanded);
    let targetH = 50;
    if (isFocused || isExpanded) {
      const notes = (t.data as any)?.notes || "";
      const lines = notes.trim().length > 0 ? (notes.match(/\n/g) || []).length + 1 : 1;
      targetH = Math.max(140, Math.min(380, 96 + lines * 24));
    }
    taskUpdates.set(t.id, { y: currentY, h: targetH });
    currentY += targetH + 12;
  }

  const currentRunwayH = Number(runway.style?.height ?? runway.height ?? 420);
  const neededRunwayH = Math.max(currentRunwayH, currentY + 30);

  return nodes.map((n) => {
    if (n.id === targetRunwayId) {
      if (neededRunwayH !== currentRunwayH) {
        return {
          ...n,
          style: { ...n.style, height: neededRunwayH },
          height: neededRunwayH,
        };
      }
      return n;
    }
    const update = taskUpdates.get(n.id);
    if (update) {
      return {
        ...n,
        position: { x: 24, y: update.y },
        style: { ...n.style, width: taskW, height: update.h },
        width: taskW,
        height: update.h,
      };
    }
    return n;
  });
}

export function realignAllRunways(nodes: Node[], activeFocusId: string | null): Node[] {
  const runways = nodes.filter(
    (n) =>
      n.type === "runwayFrame" ||
      (n.type === "projectFrame" && String((n.data as any)?.title || "").includes("Runway"))
  );
  let updated = nodes;
  for (const rw of runways) {
    updated = realignRunwayNodes(updated, rw.id, activeFocusId);
  }
  return updated;
}

export interface FlowCanvasState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  cursorPosition: { x: number; y: number } | null;
  setCursorPosition: (pos: { x: number; y: number } | null) => void;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setSelectedNodeId: (id: string | null) => void;
  createTask: (props: {
    title: string;
    priority?: 1 | 2 | 3 | 4;
    status?: "open" | "doing" | "done";
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
  createImage: (props: {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    position?: { x: number; y: number };
    parentId?: string;
  }) => string;
  sweepToInbox: () => { inboxId: string; sweptCount: number };
  activeFocusNodeId: string | null;
  timerSecondsRemaining: number;
  isTimerRunning: boolean;
  setActiveFocusNodeId: (id: string | null) => void;
  setTimerSecondsRemaining: (updater: number | ((prev: number) => number)) => void;
  setIsTimerRunning: (updater: boolean | ((prev: boolean) => boolean)) => void;
  stageRunway: (options?: {
    templateId?: RunwayTemplateId;
    title?: string;
    dailyGoal?: string;
    position?: { x: number; y: number };
    forceNew?: boolean;
  }) => string;
  returnTaskToProject: (taskId: string) => boolean;
  sendTaskToRunway: (taskId: string, targetRunwayId?: string) => boolean;
  advanceRunwayFocus: (completedTaskId: string) => boolean;
  updateNodeData: (
    id: string,
    patch: Record<string, any>,
    options?: { skipAutoAdvance?: boolean }
  ) => void;
  deleteNode: (id: string) => void;
  updateEdgeData: (id: string, patch: Record<string, any>) => void;
  deleteEdge: (id: string) => void;
  duplicateSelected: () => void;
  resetBoard: () => void;
  loadSnapshot: () => void;
  arrangeLayout: () => void;
  groupSelectedNodes: (title?: string, description?: string) => string | null;
  ungroupSelectedNodes: () => boolean;

  // Multiboard Slice
  boards: BoardEntry[];
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
      setActiveAnnotationId: (id) => set({ activeAnnotationId: id }),
      activeFocusNodeId: null,
      timerSecondsRemaining: 25 * 60,
      isTimerRunning: false,

      setActiveFocusNodeId: (id) =>
        set((state) => {
          const updatedNodes = realignAllRunways(state.nodes, id);
          return {
            nodes: updatedNodes,
            activeFocusNodeId: id,
            isTimerRunning: id !== null,
            timerSecondsRemaining: 25 * 60,
            selectedNodeId: id || state.selectedNodeId,
          };
        }),

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

      stageRunway: (options) => {
        const state = get();
        const template = RUNWAY_TEMPLATES[options?.templateId || "rule_of_3"];

        if (!options?.forceNew) {
          const existingRunway = state.nodes.find(
            (n) =>
              (n.type === "runwayFrame" ||
                (n.type === "projectFrame" &&
                  String((n.data as any)?.title || "").includes("Runway"))) &&
              (!options?.templateId || (n.data as any)?.templateId === options.templateId)
          );
          if (existingRunway) {
            window.dispatchEvent(
              new CustomEvent("foqz:flow-center-on", { detail: { id: existingRunway.id } })
            );
            return existingRunway.id;
          }
        }

        const runwayId = `runway-${Date.now()}`;
        const spawnPos =
          options?.position ||
          (state.cursorPosition
            ? {
                x: Math.round(state.cursorPosition.x - 340),
                y: Math.round(state.cursorPosition.y - 120),
              }
            : { x: 100 + Math.random() * 60, y: 100 + Math.random() * 60 });

        const runwayNode: Node = {
          id: runwayId,
          type: "runwayFrame",
          position: spawnPos,
          style: { width: 680, height: 420, zIndex: 0 },
          data: {
            title: options?.title || template.title,
            templateId: template.id,
            date: new Date().toISOString().split("T")[0],
            dailyGoal: options?.dailyGoal || template.subtitle,
            capacitySlots: template.slots,
            targetSprintDuration: template.defaultDurationMinutes,
            accent: template.accent,
            borderStyle: "solid",
          },
        };

        const newNodes = [...state.nodes, runwayNode];
        set({ nodes: newNodes, selectedNodeId: runwayId });
        window.dispatchEvent(
          new CustomEvent("foqz:flow-center-on", { detail: { id: runwayId } })
        );
        return runwayId;
      },

      returnTaskToProject: (taskId) => {
        const state = get();
        const task = state.nodes.find((n) => n.id === taskId);
        if (!task || !task.data?.originProjectId) return false;

        const originProjId = task.data.originProjectId as string;
        let originProj = state.nodes.find((n) => n.id === originProjId);
        if (!originProj) {
          originProj = state.nodes.find((n) => n.type === "projectFrame");
        }
        if (!originProj) return false;
        const targetProjId = originProj.id;

        const returnPos =
          (task.data.originProjectPos as { x: number; y: number }) || { x: 40, y: 100 };

        const stowedEdges = ((task.data as any)?.stowedEdges as Edge[]) || [];

        const updatedNodes = state.nodes.map((n) => {
          if (n.id !== taskId) return n;
          const cleanData = { ...n.data };
          delete cleanData.originProjectId;
          delete cleanData.originProjectTitle;
          delete cleanData.originProjectAccent;
          delete cleanData.originProjectPos;
          delete cleanData.stagedAt;
          delete cleanData.stowedEdges;
          return {
            ...n,
            parentId: targetProjId,
            position: returnPos,
            style: { ...n.style, width: 280, height: 82 },
            data: cleanData,
          };
        });

        // Recreate stowed connections on move back to project
        const currentEdges = state.edges;
        const edgesToRestore = stowedEdges.filter(
          (se) => !currentEdges.some((e) => e.id === se.id)
        );
        const updatedEdges = [...currentEdges, ...edgesToRestore];
        const realignedNodes = realignAllRunways(updatedNodes, state.activeFocusNodeId);
        set({ nodes: realignedNodes, edges: updatedEdges, selectedNodeId: taskId });
        window.dispatchEvent(
          new CustomEvent("foqz:flow-center-on", { detail: { id: targetProjId } })
        );
        return true;
      },

      sendTaskToRunway: (taskId, targetRunwayId) => {
        const state = get();
        const task = state.nodes.find((n) => n.id === taskId);
        if (!task || task.type !== "focusTask") return false;

        let runwayNode: Node | undefined;
        let nodesList = [...state.nodes];

        if (targetRunwayId) {
          runwayNode = nodesList.find(
            (n) =>
              n.id === targetRunwayId &&
              (n.type === "runwayFrame" ||
                (n.type === "projectFrame" &&
                  String((n.data as any)?.title || "").includes("Runway")))
          );
        }

        if (!runwayNode) {
          runwayNode = nodesList.find(
            (n) =>
              n.type === "runwayFrame" ||
              (n.type === "projectFrame" &&
                String((n.data as any)?.title || "").includes("Runway"))
          );
        }

        // If no runway exists on the canvas, auto-stage Today's Runway
        if (!runwayNode) {
          const newRunwayId = state.stageRunway();
          const freshState = get();
          nodesList = [...freshState.nodes];
          runwayNode = nodesList.find((n) => n.id === newRunwayId);
        }

        if (!runwayNode) return false;

        const targetRunway = runwayNode;
        const runwayW = Number(targetRunway.style?.width ?? targetRunway.width ?? 680);

        // Find existing tasks in this runway to pick an open slot
        const existingRunwayTasks = nodesList.filter(
          (n) => n.id !== taskId && n.parentId === targetRunway.id && n.type === "focusTask"
        );
        const occupiedSlotIndices = new Set(
          existingRunwayTasks.map((t) => Math.round((t.position.y - 82) / 60))
        );

        let chosenSlot = 0;
        while (chosenSlot < 5 && occupiedSlotIndices.has(chosenSlot)) {
          chosenSlot++;
        }
        if (chosenSlot >= 5) {
          chosenSlot = existingRunwayTasks.length;
        }

        const snapX = 24;
        const snapY = 82 + chosenSlot * 60;
        const snapWidth = runwayW - 48;
        const snapHeight = 50;

        // Stow active canvas edges connected to this task
        const currentEdges = get().edges;
        const connectedEdges = currentEdges.filter(
          (e) => e.source === taskId || e.target === taskId
        );
        const existingStowed = ((task.data as any)?.stowedEdges as Edge[]) || [];
        const mergedStowed = [
          ...existingStowed,
          ...connectedEdges.filter((ce) => !existingStowed.some((se) => se.id === ce.id)),
        ];

        let updatedData: Record<string, any> = {
          ...task.data,
          stowedEdges: mergedStowed,
        };

        // Record origin project if coming from a projectFrame
        const currentParent = task.parentId
          ? nodesList.find((n) => n.id === task.parentId)
          : null;
        if (currentParent && currentParent.type === "projectFrame") {
          updatedData = {
            ...updatedData,
            originProjectId: currentParent.id,
            originProjectTitle: (currentParent.data as any)?.title || "Project",
            originProjectAccent: (currentParent.data as any)?.accent || "blue",
            originProjectPos: { x: task.position.x, y: task.position.y },
            stagedAt: Date.now(),
          };
        }

        const updatedTask: Node = {
          ...task,
          parentId: targetRunway.id,
          position: { x: snapX, y: snapY },
          style: { ...task.style, width: snapWidth, height: snapHeight },
          width: snapWidth,
          height: snapHeight,
          data: updatedData,
          selected: true,
        };
        delete (updatedTask as any).extent;

        // Insert updated task right after the runway or its children
        const withoutTask = nodesList.filter((n) => n.id !== taskId);
        const parentIdx = withoutTask.findIndex((n) => n.id === targetRunway.id);
        let finalNodes: Node[];
        if (parentIdx !== -1) {
          finalNodes = [...withoutTask];
          finalNodes.splice(parentIdx + 1, 0, updatedTask);
        } else {
          finalNodes = [...withoutTask, updatedTask];
        }

        // Remove stowed edges from active canvas edges
        const updatedEdges = currentEdges.filter(
          (e) => e.source !== taskId && e.target !== taskId
        );

        const realignedNodes = realignAllRunways(
          finalNodes.map((n) => (n.id === taskId ? updatedTask : { ...n, selected: false })),
          state.activeFocusNodeId
        );

        set({
          nodes: realignedNodes,
          edges: updatedEdges,
          selectedNodeId: taskId,
        });

        window.dispatchEvent(
          new CustomEvent("foqz:flow-center-on", { detail: { id: targetRunway.id } })
        );
        return true;
      },

      advanceRunwayFocus: (completedTaskId) => {
        const state = get();
        const completedTask = state.nodes.find((n) => n.id === completedTaskId);
        if (!completedTask || !completedTask.parentId) return false;

        // ONLY trigger if the completed task was the currently active focus target!
        if (state.activeFocusNodeId !== completedTaskId) {
          return false;
        }

        const parent = state.nodes.find((n) => n.id === completedTask.parentId);
        const isRunway = Boolean(
          parent &&
            (parent.type === "runwayFrame" ||
              String((parent.data as any)?.title || "").includes("Runway"))
        );

        // ONLY trigger if the task is inside a Runway!
        // Tasks in normal project frames or standalone canvas tasks will NEVER auto-advance.
        if (!isRunway || !parent) return false;

        const runwayTasks = state.nodes
          .filter((n) => n.parentId === parent.id && n.type === "focusTask")
          .sort((a, b) => a.position.y - b.position.y);

        const nextTask = runwayTasks.find(
          (t) => t.id !== completedTaskId && (t.data as any)?.status !== "done"
        );

        if (nextTask) {
          const sprintMinutes = Number((parent.data as any)?.targetSprintDuration) || 25;
          const nextSeconds = sprintMinutes * 60;

          const updatedNodes = state.nodes.map((n) => {
            if (n.id === nextTask.id) {
              return {
                ...n,
                data: { ...n.data, status: "doing" },
                selected: true,
              };
            }
            if (n.id === completedTaskId) {
              return { ...n, selected: false };
            }
            return n;
          });

          const realignedNodes = realignAllRunways(updatedNodes, nextTask.id);

          set({
            nodes: realignedNodes,
            activeFocusNodeId: nextTask.id,
            selectedNodeId: nextTask.id,
            timerSecondsRemaining: nextSeconds,
            isTimerRunning: true,
          });

          window.dispatchEvent(
            new CustomEvent("foqz:flow-center-on", { detail: { id: nextTask.id } })
          );
          window.dispatchEvent(
            new CustomEvent("foqz:set-focus-target", { detail: { shapeId: nextTask.id } })
          );
          window.dispatchEvent(
            new CustomEvent("foqz:runway-advanced", {
              detail: {
                fromTaskId: completedTaskId,
                toTaskId: nextTask.id,
                toTaskTitle: (nextTask.data as any)?.title || "Next Task",
                runwayTitle: (parent.data as any)?.title || "Runway",
              },
            })
          );
          return true;
        } else {
          // All tasks in the runway are completed!
          set({
            activeFocusNodeId: null,
            isTimerRunning: false,
            timerSecondsRemaining: 0,
          });
          window.dispatchEvent(
            new CustomEvent("foqz:runway-cleared", {
              detail: {
                runwayId: parent.id,
                runwayTitle: (parent.data as any)?.title || "Runway",
              },
            })
          );
          window.dispatchEvent(
            new CustomEvent("foqz:set-focus-target", { detail: { shapeId: null } })
          );
          return true;
        }
      },

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
        const isParentRunway = Boolean(
          parentFrame &&
            (parentFrame.type === "runwayFrame" ||
              String((parentFrame.data as any)?.title || "").includes("Runway"))
        );

        if (!pos) {
          const existingTasks = state.nodes.filter(
            (n) => n.parentId === parentId && n.type === "focusTask"
          );
          if (isParentRunway) {
            const slotIdx = Math.min(4, existingTasks.length);
            pos = { x: 24, y: 82 + slotIdx * 60 };
          } else {
            const defaultX = parentId ? 40 : 400 + Math.random() * 40;
            const defaultY = parentId
              ? 100 + existingTasks.length * 94
              : 280 + Math.random() * 40;
            pos = { x: defaultX, y: defaultY };
          }
        }

        const parentW = Number(parentFrame?.style?.width ?? parentFrame?.width ?? 680);
        const taskW = isParentRunway ? parentW - 48 : 280;
        const taskH = isParentRunway ? 50 : 82;

        if (!isParentRunway) {
          pos = findNonOverlappingPosition(pos, { w: taskW, h: taskH }, state.nodes, parentId);
        }

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
            priority: props.priority ?? 3,
            paper: props.paper || "cream",
            notes: props.notes || "",
            borderStyle: "solid",
          },
          selected: true,
        };

        let clearedNodes = state.nodes.map((n) =>
          n.selected ? { ...n, selected: false } : n
        );

        // If child is placed inside a project frame and extends beyond bottom edge, expand frame!
        if (parentId && parentFrame && !isParentRunway) {
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
            n.style?.height ?? (n.height ?? (n.type === "focusTask" ? 82 : n.type === "box" ? 140 : n.type === "circle" ? 160 : 60))
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
            corner: props.corner || "folded",
            foldPosition: "top-right",
            noise: true,
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

      sweepToInbox: () => {
        const state = get();
        // Find existing Inbox frame or create a new one
        let inboxFrame = state.nodes.find(
          (n) => n.type === "projectFrame" && String((n.data as any)?.title || "").toLowerCase().includes("inbox")
        );

        let inboxId = inboxFrame?.id;
        let nodesList = [...state.nodes];

        if (!inboxFrame) {
          inboxId = `inbox-${Date.now()}`;
          inboxFrame = {
            id: inboxId,
            type: "projectFrame",
            position: { x: 120, y: 120 },
            style: { width: 680, height: 460, zIndex: 0 },
            data: {
              title: "📥 Scratchpad Inbox (Swept Items)",
              goal: "Triage unassigned thoughts, stickies, and notes",
              accent: "zinc",
              borderStyle: "solid",
            },
          };
          nodesList.push(inboxFrame);
        }

        const targetInboxId = inboxId!;

        // Free-floating stickies & text items (unparented text, box, or unparented tasks)
        const unparentedItems = nodesList.filter(
          (n) => n.type !== "projectFrame" && !n.parentId && n.id !== targetInboxId
        );

        if (unparentedItems.length === 0) {
          window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id: targetInboxId } }));
          return { inboxId: targetInboxId, sweptCount: 0 };
        }

        const unparentedIds = new Set(unparentedItems.map((n) => n.id));
        let childZ = 10;

        const sweptChildren: Node[] = unparentedItems.map((item, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const relX = 30 + col * 310;
          const relY = 70 + row * 96;

          const updated: Node = {
            ...item,
            parentId: targetInboxId,
            position: { x: relX, y: relY },
            style: {
              ...item.style,
              zIndex: typeof item.style?.zIndex === "number" ? Math.max(10, item.style.zIndex) : ++childZ,
            },
            selected: false,
          };
          delete (updated as any).extent;
          return updated;
        });

        // Expand inbox height if needed
        const totalRows = Math.ceil(sweptChildren.length / 2);
        const neededHeight = Math.max(460, 90 + totalRows * 105);

        const updatedInboxNode: Node = {
          ...inboxFrame,
          style: {
            ...inboxFrame.style,
            height: neededHeight,
          },
        };

        const unaffectedNodes = nodesList
          .filter((n) => !unparentedIds.has(n.id) && n.id !== targetInboxId);

        // Parent frame must precede children in nodes list
        const finalNodes = [...unaffectedNodes, updatedInboxNode, ...sweptChildren];

        set({
          nodes: finalNodes,
          selectedNodeId: targetInboxId,
        });

        window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id: targetInboxId } }));
        return { inboxId: targetInboxId, sweptCount: unparentedItems.length };
      },

      updateNodeData: (id, patch, options) => {
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

        let updatedNodes = state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...enrichedPatch } } : n
        );

        if (patch.isExpanded !== undefined || patch.notes !== undefined || patch.status !== undefined) {
          updatedNodes = realignAllRunways(updatedNodes, state.activeFocusNodeId);
        }

        set({ nodes: updatedNodes });

        if (isBecomingDone && !options?.skipAutoAdvance) {
          get().advanceRunwayFocus(id);
        }
      },

      deleteNode: (id) =>
        set((state) => {
          const deletedIds = new Set<string>();
          deletedIds.add(id);
          state.nodes.forEach((n) => {
            if (n.parentId === id) deletedIds.add(n.id);
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

          return {
            nodes: state.nodes.filter((n) => !deletedIds.has(n.id)),
            edges: state.edges.filter(
              (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
            ),
            annotations: nextAnnotations,
            activeAnnotationId: nextActiveAnnId,
            selectedNodeId: deletedIds.has(state.selectedNodeId || "") ? null : state.selectedNodeId,
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

        // 1. Immediately snapshot current board
        const currentKey = getBoardStorageKey(state.activeBoardId);
        try {
          localStorage.setItem(
            currentKey,
            JSON.stringify({
              nodes: state.nodes,
              edges: state.edges,
              annotations: state.annotations,
              updatedAt: Date.now(),
            })
          );
        } catch (err) {
          console.warn("Failed to save snapshot before switch:", err);
        }

        // 2. Load target board nodes, edges, annotations
        const targetSnapshot = loadBoardSnapshotFromStorage(targetId);

        // 3. Update localStorage pointers
        try {
          localStorage.setItem(ACTIVE_BOARD_KEY, targetId);
          const targetBoard = state.boards.find((b) => b.id === targetId);
          if (targetBoard) {
            localStorage.setItem("foqz_board_name", targetBoard.name);
          }
        } catch {}

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
        const newEntry: BoardEntry = {
          id: newId,
          name: newName,
          createdAt: Date.now(),
        };
        const updatedBoards = [...state.boards, newEntry];

        try {
          localStorage.setItem(STORAGE_BOARDS_KEY, JSON.stringify(updatedBoards));
        } catch {}

        set({ boards: updatedBoards });
        get().switchBoard(newId);
        return newId;
      },

      deleteBoard: (boardIdToDelete: string) => {
        const state = get();
        if (state.boards.length <= 1) return;

        const remaining = state.boards.filter((b) => b.id !== boardIdToDelete);
        try {
          localStorage.setItem(STORAGE_BOARDS_KEY, JSON.stringify(remaining));
          localStorage.removeItem(getBoardStorageKey(boardIdToDelete));
        } catch {}

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

        try {
          localStorage.setItem(STORAGE_BOARDS_KEY, JSON.stringify(updatedBoards));
          if (idToRename === state.activeBoardId) {
            localStorage.setItem("foqz_board_name", trimmed);
          }
        } catch {}

        set({ boards: updatedBoards });
      },

      resetBoard: () => {
        const state = get();
        const key = getBoardStorageKey(state.activeBoardId);
        try {
          localStorage.removeItem(key);
        } catch {}
        if (state.activeBoardId === "board-default" && typeof window !== "undefined" && window.focusStore?.clearBoardFile) {
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

      arrangeLayout: () => {
        const state = get();
        const updated = arrangeLayout(state.nodes);
        set({ nodes: updated });
      },

      groupSelectedNodes: (title?: string, description?: string) => {
        const state = get();
        const selected = state.nodes.filter(
          (n) => n.selected && n.type !== "projectFrame" && n.type !== "runwayFrame"
        );
        if (selected.length === 0) return null;

        const groupTitle = title || "Semantic Group";
        const groupId = state.createProject({
          title: groupTitle,
          description: description || "",
          goal: description || "Semantic group cluster",
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


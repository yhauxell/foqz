import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { temporal, type TemporalState } from "zundo";
import type { Node, Edge } from "@xyflow/react";

export const FLOW_STORAGE_KEY = "foqz_reactflow_poc_board_v1";

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
      borderStyle: "dashed",
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
    sourceHandle: "bottom",
    target: "task-2",
    targetHandle: "top",
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
    accent?: string;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  }) => string;
  createBox: (props: {
    label: string;
    color?: string;
    strokeColor?: string;
    position?: { x: number; y: number };
  }) => string;
  createNote: (props: {
    text: string;
    position?: { x: number; y: number };
  }) => string;
  sweepToInbox: () => { inboxId: string; sweptCount: number };
  activeFocusNodeId: string | null;
  timerSecondsRemaining: number;
  isTimerRunning: boolean;
  setActiveFocusNodeId: (id: string | null) => void;
  setTimerSecondsRemaining: (updater: number | ((prev: number) => number)) => void;
  setIsTimerRunning: (updater: boolean | ((prev: boolean) => boolean)) => void;
  stageRunway: () => string;
  updateNodeData: (id: string, patch: Record<string, any>) => void;
  deleteNode: (id: string) => void;
  updateEdgeData: (id: string, patch: Record<string, any>) => void;
  deleteEdge: (id: string) => void;
  duplicateSelected: () => void;
  resetBoard: () => void;
  loadSnapshot: () => void;
}

export const useFlowCanvasStore = create<FlowCanvasState>()(
  temporal(
    (set, get) => ({
      nodes: INITIAL_NODES,
      edges: INITIAL_EDGES,
      selectedNodeId: null,
      cursorPosition: null,
      setCursorPosition: (pos) => set({ cursorPosition: pos }),
      activeFocusNodeId: null,
      timerSecondsRemaining: 25 * 60,
      isTimerRunning: false,

      setActiveFocusNodeId: (id) =>
        set((state) => ({
          activeFocusNodeId: id,
          isTimerRunning: id !== null,
          timerSecondsRemaining: 25 * 60,
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

      stageRunway: () => {
        const state = get();
        const existingRunway = state.nodes.find(
          (n) => n.type === "projectFrame" && String((n.data as any)?.title || "").includes("Runway")
        );
        if (existingRunway) {
          window.dispatchEvent(
            new CustomEvent("foqz:flow-center-on", { detail: { id: existingRunway.id } })
          );
          return existingRunway.id;
        }

        const runwayId = `runway-${Date.now()}`;
        const runwayNode: Node = {
          id: runwayId,
          type: "projectFrame",
          position: { x: 100, y: 100 },
          style: { width: 720, height: 420 },
          data: {
            title: "📌 Today's Runway (Focus Sprints)",
            goal: "Execute critical path milestones without interruption",
            accent: "rose",
            borderStyle: "dashed",
          },
        };

        const newNodes = [...state.nodes, runwayNode];
        set({ nodes: newNodes, selectedNodeId: runwayId });
        window.dispatchEvent(
          new CustomEvent("foqz:flow-center-on", { detail: { id: runwayId } })
        );
        return runwayId;
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

        const newNode: Node = {
          id,
          type: "focusTask",
          parentId,
          position: pos,
          style: { width: 280, height: 82, zIndex: nextZ },
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

        const capturedNodes = candidates.filter((n) => {
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
            accent: props.accent || "blue",
            borderStyle: "dashed",
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
        const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
              x: Math.round(state.cursorPosition.x - 70),
              y: Math.round(state.cursorPosition.y - 20),
            };
          }
        }

        if (!pos) {
          pos = {
            x: 320 + Math.random() * 40,
            y: 200 + Math.random() * 40,
          };
        }

        const newNode: Node = {
          id,
          type: "text",
          parentId,
          position: pos,
          style: { zIndex: nextZ },
          data: {
            text: props.text,
            isNew: !props.text,
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
              borderStyle: "dashed",
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

      updateNodeData: (id, patch) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
          ),
        })),

      deleteNode: (id) =>
        set((state) => {
          const deletedIds = new Set<string>();
          deletedIds.add(id);
          state.nodes.forEach((n) => {
            if (n.parentId === id) deletedIds.add(n.id);
          });
          return {
            nodes: state.nodes.filter((n) => !deletedIds.has(n.id)),
            edges: state.edges.filter(
              (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
            ),
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

      resetBoard: () => {
        try {
          localStorage.removeItem(FLOW_STORAGE_KEY);
        } catch {}
        set({
          nodes: INITIAL_NODES,
          edges: INITIAL_EDGES,
          selectedNodeId: null,
        });
      },

      loadSnapshot: () => {
        try {
          const raw = localStorage.getItem(FLOW_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.nodes)) {
              set({ nodes: parsed.nodes });
            }
            if (Array.isArray(parsed.edges)) {
              set({ edges: parsed.edges });
            }
          }
        } catch (err) {
          console.warn("Failed to load Flow snapshot:", err);
        }
      },
    }),
    {
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
      equality: (pastState, currentState) =>
        pastState.nodes === currentState.nodes && pastState.edges === currentState.edges,
      limit: 100,
    }
  )
);

export function useTemporalFlowStore<T>(
  selector: (state: TemporalState<Pick<FlowCanvasState, "nodes" | "edges">>) => T,
  equality?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    useFlowCanvasStore.temporal,
    selector,
    equality
  );
}


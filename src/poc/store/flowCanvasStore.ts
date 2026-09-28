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

export interface FlowCanvasState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
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
  }) => string;
  createBox: (props: {
    label: string;
    color?: string;
    strokeColor?: string;
    position?: { x: number; y: number };
  }) => string;
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
        const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const existingTasks = get().nodes.filter((n) => n.parentId === props.parentId && n.type === "focusTask");
        const defaultX = props.parentId ? 40 : 400 + Math.random() * 40;
        const defaultY = props.parentId
          ? 100 + existingTasks.length * 94
          : 280 + Math.random() * 40;

        const newNode: Node = {
          id,
          type: "focusTask",
          parentId: props.parentId,
          position: props.position || { x: defaultX, y: defaultY },
          style: { width: 280, height: 82 },
          data: {
            title: props.title,
            status: props.status || "open",
            priority: props.priority ?? 3,
            paper: props.paper || "cream",
            notes: props.notes || "",
            borderStyle: "solid",
          },
        };
        set((state) => ({
          nodes: [
            ...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            { ...newNode, selected: true },
          ],
          selectedNodeId: id,
        }));
        return id;
      },

      createProject: (props) => {
        const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: Node = {
          id,
          type: "projectFrame",
          position: props.position || {
            x: 200 + Math.random() * 40,
            y: 200 + Math.random() * 40,
          },
          style: { width: 640, height: 400 },
          data: {
            title: props.title,
            goal: props.goal || "",
            accent: props.accent || "blue",
            borderStyle: "dashed",
          },
        };
        set((state) => ({
          nodes: [
            ...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            { ...newNode, selected: true },
          ],
          selectedNodeId: id,
        }));
        return id;
      },

      createBox: (props) => {
        const id = `box-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: Node = {
          id,
          type: "box",
          position: props.position || {
            x: 300 + Math.random() * 40,
            y: 150 + Math.random() * 40,
          },
          style: { width: 220, height: 140 },
          data: {
            label: props.label,
            color: props.color || "rgba(16, 185, 129, 0.08)",
            strokeColor: props.strokeColor || "#10b981",
            borderStyle: "solid",
            roughness: 1.8,
          },
        };
        set((state) => ({
          nodes: [
            ...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            { ...newNode, selected: true },
          ],
          selectedNodeId: id,
        }));
        return id;
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

          const clones: Node[] = selected.map((n) => {
            const newId = `${n.type ?? "node"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              selected: true,
              parentId: n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId)! : undefined,
              position: { x: n.position.x + OFFSET, y: n.position.y + OFFSET },
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


import type { Editor, TLShape, TLShapeId } from "tldraw";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";

export interface NormalizedCanvasItem {
  id: string;
  type: "focus-task" | "project-frame" | "box" | "text" | "pencil" | string;
  title: string;
  status?: "open" | "doing" | "done";
  priority?: 1 | 2 | 3 | 4;
  parentId?: string;
  notes?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  data?: Record<string, unknown>;
}

export interface CanvasEngineAdapter {
  readonly engineType: "tldraw" | "reactflow";
  getItems(): NormalizedCanvasItem[];
  getSelectedIds(): string[];
  select(id: string): void;
  deselectAll(): void;
  createTask(props: {
    title: string;
    priority?: 1 | 2 | 3 | 4;
    status?: "open" | "doing" | "done";
    parentId?: string;
    position?: { x: number; y: number };
  }): string;
  createProject(props: {
    title: string;
    goal?: string;
    accent?: string;
    position?: { x: number; y: number };
  }): string;
  createBox(props: {
    label: string;
    color?: string;
    position?: { x: number; y: number };
  }): string;
  centerOn(id: string): void;
  zoomToFit(): void;
}

/**
 * Creates a CanvasEngineAdapter for React Flow using the central flowCanvasStore
 */
export function createReactFlowAdapter(): CanvasEngineAdapter {
  return {
    engineType: "reactflow",

    getItems: () => {
      const nodes = useFlowCanvasStore.getState().nodes;
      return nodes.map((n) => {
        const d = (n.data || {}) as Record<string, any>;
        let title = "Untitled";
        if (n.type === "focusTask") title = d.title || "Task";
        else if (n.type === "projectFrame") title = d.title || "Project";
        else if (n.type === "box") title = d.label || "Box";
        else if (n.type === "text") title = d.text || "Text Note";

        return {
          id: n.id,
          type:
            n.type === "focusTask"
              ? "focus-task"
              : n.type === "projectFrame"
              ? "project-frame"
              : n.type || "unknown",
          title,
          status: d.status,
          priority: d.priority,
          parentId: n.parentId,
          notes: d.notes,
          bounds: {
            x: n.position.x,
            y: n.position.y,
            width: Number(n.style?.width ?? 280),
            height: Number(n.style?.height ?? 82),
          },
          data: d,
        };
      });
    },

    getSelectedIds: () => {
      const selected = useFlowCanvasStore.getState().selectedNodeId;
      return selected ? [selected] : [];
    },

    select: (id: string) => {
      useFlowCanvasStore.getState().setSelectedNodeId(id);
    },

    deselectAll: () => {
      useFlowCanvasStore.getState().setSelectedNodeId(null);
    },

    createTask: (props) => {
      return useFlowCanvasStore.getState().createTask(props);
    },

    createProject: (props) => {
      return useFlowCanvasStore.getState().createProject(props);
    },

    createBox: (props) => {
      return useFlowCanvasStore.getState().createBox(props);
    },

    centerOn: (id: string) => {
      useFlowCanvasStore.getState().setSelectedNodeId(id);
      window.dispatchEvent(
        new CustomEvent("foqz:flow-center-on", { detail: { id } })
      );
    },

    zoomToFit: () => {
      window.dispatchEvent(new CustomEvent("foqz:flow-fit-view"));
    },
  };
}

/**
 * Creates a CanvasEngineAdapter for tldraw using the tldraw Editor instance
 */
export function createTldrawAdapter(editor: Editor): CanvasEngineAdapter {
  return {
    engineType: "tldraw",

    getItems: () => {
      const shapes = editor.getCurrentPageShapes();
      return shapes.map((s) => {
        const props = (s.props || {}) as Record<string, any>;
        const bounds = editor.getShapePageBounds(s.id);
        let title = "Shape";
        if (s.type === "focus-task") title = props.title || "Task";
        else if (s.type === "project-frame") title = props.title || "Project";
        else if (s.type === "text" || s.type === "note") title = props.text || "Note";

        return {
          id: s.id,
          type: s.type,
          title,
          status: props.status,
          priority: props.priority,
          parentId: s.parentId?.startsWith("shape:") ? s.parentId : undefined,
          notes: props.notes,
          bounds: bounds
            ? { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h }
            : undefined,
          data: props,
        };
      });
    },

    getSelectedIds: () => {
      return editor.getSelectedShapeIds();
    },

    select: (id: string) => {
      editor.select(id as TLShapeId);
    },

    deselectAll: () => {
      editor.selectNone();
    },

    createTask: (props) => {
      window.dispatchEvent(
        new CustomEvent("foqz:new-task", { detail: props })
      );
      return "";
    },

    createProject: (props) => {
      window.dispatchEvent(
        new CustomEvent("foqz:new-project", { detail: props })
      );
      return "";
    },

    createBox: () => "",

    centerOn: (id: string) => {
      editor.select(id as TLShapeId);
      editor.zoomToSelection({ animation: { duration: 260 } });
    },

    zoomToFit: () => {
      editor.zoomToFit({ animation: { duration: 260 } });
    },
  };
}

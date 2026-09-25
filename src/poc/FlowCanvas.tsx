import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ConnectionMode,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import { FlowZoomControls } from "./components/FlowZoomControls";
import { FlowShapeMenu } from "./components/FlowShapeMenu";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { useFlowCanvasShortcuts } from "./hooks/useFlowCanvasShortcuts";
import {
  Plus,
  FolderPlus,
  Box as BoxIcon,
  Type as TypeIcon,
  Pencil,
  Pointer,
  Sparkles,
  RotateCcw,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveTool = "select" | "box" | "text" | "pencil";

const INITIAL_NODES: Node[] = [
  {
    id: "proj-1",
    type: "projectFrame",
    position: { x: 80, y: 80 },
    style: { width: 720, height: 440 },
    data: {
      title: "React Flow Migration Milestone",
      goal: "Goal: Validate sketchy style, themes & connections",
      accent: "blue",
      connectors: { githubRepo: "yhauxell/foqz" },
    },
  },
  {
    id: "task-1",
    type: "focusTask",
    parentId: "proj-1",
    extent: "parent",
    position: { x: 40, y: 100 },
    style: { width: 280, height: 82 },
    data: {
      title: "Setup `@xyflow/react` and sketch engine",
      status: "done",
      priority: 1,
      paper: "sage",
      notes: "Double click me to edit title",
    },
  },
  {
    id: "task-2",
    type: "focusTask",
    parentId: "proj-1",
    extent: "parent",
    position: { x: 40, y: 220 },
    style: { width: 280, height: 82 },
    data: {
      title: "Connect task cards to sketch boxes",
      status: "doing",
      priority: 2,
      paper: "cream",
      notes: "Drag line from task handles to box handles",
    },
  },
  {
    id: "box-demo",
    type: "box",
    parentId: "proj-1",
    extent: "parent",
    position: { x: 400, y: 120 },
    style: { width: 260, height: 180 },
    data: {
      label: "Architecture Notes (Double-click to write)",
      color: "rgba(16, 185, 129, 0.08)",
      strokeColor: "#10b981",
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

const INITIAL_EDGES: Edge[] = [
  {
    id: "e1-2",
    source: "task-1",
    target: "task-2",
    animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2 },
  },
  {
    id: "e2-box",
    source: "task-2",
    target: "box-demo",
    animated: true,
    style: { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "4 4" },
  },
];

const FLOW_STORAGE_KEY = "foqz_reactflow_poc_board_v1";

export function FlowCanvasApp() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const isDrawing = useRef(false);
  const currentPencilPoints = useRef<{ x: number; y: number }[]>([]);

  const { screenToFlowPosition, fitView } = useReactFlow();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // 1. Persistence Bridge: Restore snapshot on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FLOW_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          setNodes(parsed.nodes);
        }
        if (Array.isArray(parsed.edges)) {
          setEdges(parsed.edges);
        }
      }
    } catch (err) {
      console.warn("Failed to load React Flow snapshot:", err);
    }
  }, [setNodes, setEdges]);

  // 2. Persistence Bridge: Debounced auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          FLOW_STORAGE_KEY,
          JSON.stringify({ nodes, edges, updatedAt: Date.now() })
        );
      } catch (err) {
        console.warn("Failed to save React Flow snapshot:", err);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  // Reset to initial demo board
  const handleResetSampleBoard = useCallback(() => {
    if (window.confirm("Reset React Flow canvas to sample demo board?")) {
      setNodes(INITIAL_NODES);
      setEdges(INITIAL_EDGES);
      try {
        localStorage.removeItem(FLOW_STORAGE_KEY);
      } catch {}
    }
  }, [setNodes, setEdges]);

  // Find currently selected node for the floating color menu
  const selectedNode = nodes.find((n) => n.selected) || null;

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#475569", strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: "#475569",
            },
          },
          eds
        )
      ),
    [setEdges]
  );

  // 3. Subflow Containment: Auto-assign or detach parentId on drag stop
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "projectFrame") return;

      setNodes((currentNodes) => {
        const frames = currentNodes.filter((n) => n.type === "projectFrame");
        const currentParent = frames.find((f) => f.id === node.parentId);

        const absX = currentParent
          ? currentParent.position.x + node.position.x
          : node.position.x;
        const absY = currentParent
          ? currentParent.position.y + node.position.y
          : node.position.y;

        // Check if dropped inside a project frame
        const targetFrame = frames.find((f) => {
          const fx = f.position.x;
          const fy = f.position.y;
          const fw = Number(f.style?.width ?? (f.width ?? 640));
          const fh = Number(f.style?.height ?? (f.height ?? 420));
          return absX >= fx && absX <= fx + fw && absY >= fy && absY <= fy + fh;
        });

        if (targetFrame) {
          const relX = Math.round(absX - targetFrame.position.x);
          const relY = Math.max(55, Math.round(absY - targetFrame.position.y));

          return currentNodes.map((n) => {
            if (n.id !== node.id) return n;
            return {
              ...n,
              parentId: targetFrame.id,
              position: { x: relX, y: relY },
            };
          });
        } else if (node.parentId) {
          // Detach from parent frame if dragged outside
          return currentNodes.map((n) => {
            if (n.id !== node.id) return n;
            const detached = { ...n };
            delete detached.parentId;
            delete detached.extent;
            return {
              ...detached,
              position: { x: Math.round(absX), y: Math.round(absY) },
            };
          });
        }

        return currentNodes;
      });
    },
    [setNodes]
  );

  const handleCreateTask = useCallback(() => {
    const id = `task-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "focusTask",
      position: { x: 400 + Math.random() * 50, y: 300 + Math.random() * 50 },
      style: { width: 280, height: 82 },
      data: {
        title: "New Task Card",
        status: "open",
        priority: 3,
        paper: "cream",
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleCreateProject = useCallback(() => {
    const id = `proj-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "projectFrame",
      position: { x: 200 + Math.random() * 40, y: 200 + Math.random() * 40 },
      style: { width: 640, height: 400 },
      data: {
        title: "New Project Workspace",
        goal: "Goal: Define new workspace milestone",
        accent: "emerald",
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleCreateBox = useCallback(() => {
    const id = `box-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "box",
      position: { x: 300 + Math.random() * 40, y: 150 + Math.random() * 40 },
      style: { width: 220, height: 140 },
      data: {
        label: "Sketch Box",
        color: "rgba(16, 185, 129, 0.08)",
        strokeColor: "#10b981",
        roughness: 2.0,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleCreateTextAt = useCallback(
    (pos: { x: number; y: number }) => {
      const id = `text-${Date.now()}`;
      const newNode: Node = {
        id,
        type: "text",
        position: pos,
        data: {
          text: "Type something...",
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const handleDeleteSelected = useCallback(() => {
    setNodes((nds) => {
      const selected = nds.filter((n) => n.selected);
      if (selected.length === 0) return nds;
      const selectedIds = new Set(selected.map((n) => n.id));
      return nds.filter(
        (n) =>
          !selectedIds.has(n.id) &&
          (!n.parentId || !selectedIds.has(n.parentId))
      );
    });
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, [setNodes, setEdges]);

  const handleEscape = useCallback(() => {
    setActiveTool("select");
    setNodes((nds) =>
      nds.map((n) => (n.selected ? { ...n, selected: false } : n))
    );
  }, [setNodes]);

  // Keyboard Shortcuts Hook
  useFlowCanvasShortcuts({
    onSelectTool: () => setActiveTool("select"),
    onCreateBox: handleCreateBox,
    onCreateText: () =>
      handleCreateTextAt({
        x: 400 + Math.random() * 40,
        y: 250 + Math.random() * 40,
      }),
    onPencilTool: () => setActiveTool("pencil"),
    onCreateTask: handleCreateTask,
    onCreateProject: handleCreateProject,
    onDeleteSelected: handleDeleteSelected,
    onFitView: () => fitView({ duration: 300 }),
    onToggleShortcutsModal: () => setShortcutsOpen((prev) => !prev),
    onEscape: handleEscape,
  });

  // Double Click Canvas to Create Text Node
  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      handleCreateTextAt(pos);
    },
    [screenToFlowPosition, handleCreateTextAt]
  );

  // Handle Freehand Pencil Mouse/Pointer Events on Canvas Pane
  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool !== "pencil") return;
    isDrawing.current = true;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    currentPencilPoints.current = [{ x: pos.x, y: pos.y }];
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || activeTool !== "pencil") return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    currentPencilPoints.current.push({ x: pos.x, y: pos.y });

    // Live update pencil stroke node
    const id = "pencil-active";
    const points = [...currentPencilPoints.current];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    setNodes((nds) => {
      const filtered = nds.filter((n) => n.id !== id);
      return [
        ...filtered,
        {
          id,
          type: "pencil",
          position: { x: minX, y: minY },
          data: {
            points,
            color: "#ef4444",
            size: 6,
          },
        },
      ];
    });
  };

  const handlePointerUp = () => {
    if (!isDrawing.current || activeTool !== "pencil") return;
    isDrawing.current = false;
    // Finalize active pencil line into permanent node
    const finalId = `pencil-${Date.now()}`;
    setNodes((nds) =>
      nds.map((n) => (n.id === "pencil-active" ? { ...n, id: finalId } : n))
    );
    setActiveTool("select");
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden bg-zinc-50 dark:bg-zinc-950"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Floating Shape Popover Menu for Selected Node (Color & Delete) */}
      <FlowShapeMenu selectedNode={selectedNode} />

      {/* Engine Switcher / Status & Shape Toolbar */}
      <div className="absolute top-3 left-16 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel shadow-sm">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mr-1">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          React Flow Canvas
        </span>

        <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

        {/* Pointer / Select */}
        <Button
          size="sm"
          variant={activeTool === "select" ? "secondary" : "ghost"}
          onClick={() => setActiveTool("select")}
          className="h-6 text-[11px] gap-1 px-2"
          title="Select / Move (V)"
        >
          <Pointer className="size-3" /> Select
          <kbd className="text-[9px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 ml-0.5">V</kbd>
        </Button>

        {/* Hand-Drawn Box */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateBox}
          className="h-6 text-[11px] gap-1 px-2 text-emerald-600 dark:text-emerald-400 font-medium"
          title="Add Hand-Drawn Sketch Box (B)"
        >
          <BoxIcon className="size-3 text-emerald-500" /> Box
          <kbd className="text-[9px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 ml-0.5">B</kbd>
        </Button>

        {/* Text Label */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            handleCreateTextAt({
              x: 350 + Math.random() * 40,
              y: 200 + Math.random() * 40,
            })
          }
          className="h-6 text-[11px] gap-1 px-2"
          title="Add Text Label (T)"
        >
          <TypeIcon className="size-3 text-amber-500" /> Text
          <kbd className="text-[9px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 ml-0.5">T</kbd>
        </Button>

        {/* Freehand Pencil */}
        <Button
          size="sm"
          variant={activeTool === "pencil" ? "secondary" : "ghost"}
          onClick={() => setActiveTool("pencil")}
          className={`h-6 text-[11px] gap-1 px-2 ${
            activeTool === "pencil"
              ? "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-semibold"
              : ""
          }`}
          title="Freehand Pencil Drawing (P)"
        >
          <Pencil className="size-3 text-rose-500" /> Pencil
          <kbd className="text-[9px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 ml-0.5">P</kbd>
        </Button>

        <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateTask}
          className="h-6 text-[11px] gap-1 px-2"
          title="Add Focus Task (N)"
        >
          <Plus className="size-3" /> Task
          <kbd className="text-[9px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 ml-0.5">N</kbd>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateProject}
          className="h-6 text-[11px] gap-1 px-2"
          title="Add Project Frame (F)"
        >
          <FolderPlus className="size-3" /> Project
          <kbd className="text-[9px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 ml-0.5">F</kbd>
        </Button>

        <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShortcutsOpen(true)}
          className="h-6 text-[11px] gap-1 px-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          title="Keyboard Shortcuts (?)"
        >
          <Keyboard className="size-3" />
          <kbd className="text-[9px] font-mono opacity-50">?</kbd>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleResetSampleBoard}
          className="h-6 text-[11px] gap-1 px-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          title="Reset board to sample demo"
        >
          <RotateCcw className="size-3" />
        </Button>
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        connectionMode={ConnectionMode.Loose}
        onDoubleClick={handlePaneDoubleClick}
        panOnDrag={activeTool === "select"}
        selectionOnDrag={activeTool === "select"}
        onlyRenderVisibleElements={true}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <FlowZoomControls />
        <MiniMap
          style={{ height: 100, width: 140 }}
          zoomable
          pannable
          className="!bottom-4 !right-4 !rounded-xl !border !border-zinc-200 dark:!border-zinc-800 !bg-white/80 dark:!bg-zinc-900/80 backdrop-blur-xs"
        />
      </ReactFlow>
    </div>
  );
}

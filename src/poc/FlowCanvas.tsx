import React, { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import { FlowZoomControls } from "./components/FlowZoomControls";
import {
  Plus,
  FolderPlus,
  Square,
  Type as TypeIcon,
  Pencil,
  Pointer,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveTool = "select" | "rectangle" | "text" | "pencil";

const INITIAL_NODES: Node[] = [
  {
    id: "proj-1",
    type: "projectFrame",
    position: { x: 100, y: 80 },
    style: { width: 720, height: 440 },
    data: {
      title: "React Flow Migration Milestone",
      goal: "Goal: Validate subflows, performance and drawing customizability",
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
    data: {
      title: "Setup `@xyflow/react` in Foqz PoC branch",
      status: "done",
      priority: 1,
      paper: "sage",
      notes: "Installed v12 package successfully",
    },
  },
  {
    id: "task-2",
    type: "focusTask",
    parentId: "proj-1",
    extent: "parent",
    position: { x: 40, y: 220 },
    data: {
      title: "Implement custom `FocusTaskNode` & `ProjectFrameNode`",
      status: "done",
      priority: 2,
      paper: "cream",
      notes: "Testing nested subflows and drag mechanics",
    },
  },
  {
    id: "rect-demo",
    type: "rectangle",
    parentId: "proj-1",
    extent: "parent",
    position: { x: 420, y: 100 },
    style: { width: 240, height: 160 },
    data: {
      label: "Architecture Boundary",
      color: "rgba(59, 130, 246, 0.08)",
      strokeColor: "#3b82f6",
    },
  },
  {
    id: "text-demo",
    type: "text",
    position: { x: 860, y: 90 },
    data: {
      text: "✏️ Double click to edit freeform text",
      fontSize: 14,
    },
  },
  {
    id: "pencil-demo",
    type: "pencil",
    position: { x: 860, y: 140 },
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
      strokeWidth: 3,
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
];

export function FlowCanvasApp() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const isDrawing = useRef(false);
  const currentPencilPoints = useRef<{ x: number; y: number }[]>([]);

  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleCreateTask = useCallback(() => {
    const id = `task-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "focusTask",
      position: { x: 400 + Math.random() * 50, y: 300 + Math.random() * 50 },
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
        title: "New Project Container",
        goal: "Goal: Define new workspace milestone",
        accent: "emerald",
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleCreateRectangle = useCallback(() => {
    const id = `rect-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "rectangle",
      position: { x: 300 + Math.random() * 40, y: 150 + Math.random() * 40 },
      style: { width: 200, height: 120 },
      data: {
        label: "Rectangle Shape",
        color: "rgba(244, 114, 182, 0.12)",
        strokeColor: "#ec4899",
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleCreateText = useCallback(() => {
    const id = `text-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "text",
      position: { x: 350 + Math.random() * 40, y: 200 + Math.random() * 40 },
      data: {
        text: "New text label",
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

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
            strokeWidth: 3,
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
          title="Select / Move"
        >
          <Pointer className="size-3" /> Select
        </Button>

        {/* Rectangle Shape */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateRectangle}
          className="h-6 text-[11px] gap-1 px-2"
          title="Add Clean Rectangle"
        >
          <Square className="size-3 text-blue-500" /> Rectangle
        </Button>

        {/* Hand-Drawn Sketch Box */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const id = `hand-${Date.now()}`;
            const newNode: Node = {
              id,
              type: "handDrawnRect",
              position: { x: 320 + Math.random() * 40, y: 180 + Math.random() * 40 },
              style: { width: 220, height: 130 },
              data: {
                label: "Hand-drawn Sketch Box",
                color: "rgba(16, 185, 129, 0.08)",
                strokeColor: "#10b981",
                roughness: 2.2,
              },
            };
            setNodes((nds) => [...nds, newNode]);
          }}
          className="h-6 text-[11px] gap-1 px-2 text-emerald-600 dark:text-emerald-400"
          title="Add Hand-Drawn Sketch Box"
        >
          <Sparkles className="size-3 text-emerald-500" /> Sketch Box
        </Button>

        {/* Text Label */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateText}
          className="h-6 text-[11px] gap-1 px-2"
          title="Add Text Label"
        >
          <TypeIcon className="size-3 text-amber-500" /> Text
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
          title="Freehand Pencil Drawing"
        >
          <Pencil className="size-3 text-rose-500" /> Pencil
        </Button>

        <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateTask}
          className="h-6 text-[11px] gap-1 px-2"
        >
          <Plus className="size-3" /> Task
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateProject}
          className="h-6 text-[11px] gap-1 px-2"
        >
          <FolderPlus className="size-3" /> Project
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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

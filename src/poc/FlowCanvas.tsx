import React, { useCallback, useState } from "react";
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
import { Plus, FolderPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const INITIAL_NODES: Node[] = [
  {
    id: "proj-1",
    type: "projectFrame",
    position: { x: 100, y: 80 },
    style: { width: 720, height: 440 },
    data: {
      title: "React Flow Migration Milestone",
      goal: "Goal: Validate subflows, performance and node customizability",
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
      status: "doing",
      priority: 2,
      paper: "cream",
      notes: "Testing nested subflows and drag mechanics",
    },
  },
  {
    id: "task-3",
    type: "focusTask",
    position: { x: 860, y: 140 },
    data: {
      title: "Benchmark memory usage vs tldraw baseline",
      status: "open",
      priority: 3,
      paper: "fog",
      notes: "Standalone canvas task outside project frame",
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

  return (
    <div className="w-full h-full relative overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Engine Switcher / Status Toolbar */}
      <div className="absolute top-3 left-16 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel shadow-sm">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          React Flow PoC Engine
        </span>

        <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700 mx-1" />

        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateTask}
          className="h-6 text-[11px] gap-1 px-2"
        >
          <Plus className="size-3" /> New Task
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateProject}
          className="h-6 text-[11px] gap-1 px-2"
        >
          <FolderPlus className="size-3" /> New Project
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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

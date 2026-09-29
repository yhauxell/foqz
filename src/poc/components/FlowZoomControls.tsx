import React from "react";
import { useReactFlow } from "@xyflow/react";
import { Minus, Plus, Maximize2, Undo2, Redo2 } from "lucide-react";
import { useFlowCanvasStore, useTemporalFlowStore } from "../store/flowCanvasStore";

interface FlowZoomControlsProps {
  sidebarOpen?: boolean;
}

export function FlowZoomControls({ sidebarOpen = false }: FlowZoomControlsProps) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();

  // Subscribe to temporal history state for live disabled/active button states
  const pastCount = useTemporalFlowStore((state) => state.pastStates.length);
  const futureCount = useTemporalFlowStore((state) => state.futureStates.length);
  const canUndo = pastCount > 0;
  const canRedo = futureCount > 0;

  const handleUndo = () => {
    useFlowCanvasStore.temporal.getState().undo();
  };

  const handleRedo = () => {
    useFlowCanvasStore.temporal.getState().redo();
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "18px",
        left: "18px",
        zIndex: 25,
      }}
      className="flex items-center gap-1 h-8.5 px-2.5 rounded-full glass-panel shadow-2xl backdrop-blur-2xl backdrop-saturate-150 border border-white/60 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-sans text-xs select-none pointer-events-auto transition-all duration-200"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Undo (⌘Z)"
        disabled={!canUndo}
        onClick={handleUndo}
        className={`size-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
          canUndo
            ? "hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            : "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
        }`}
      >
        <Undo2 className="size-3.5" />
      </button>

      <button
        type="button"
        title="Redo (⌘⇧Z)"
        disabled={!canRedo}
        onClick={handleRedo}
        className={`size-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
          canRedo
            ? "hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            : "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
        }`}
      >
        <Redo2 className="size-3.5" />
      </button>

      <div className="w-[1px] h-3.5 bg-black/[0.08] dark:bg-white/[0.12] mx-0.5 rounded-full" />

      <button
        type="button"
        title="Zoom Out"
        onClick={() => zoomOut()}
        className="size-6 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Minus className="size-3.5" />
      </button>

      <button
        type="button"
        title="Reset Zoom to 100%"
        onClick={() => zoomTo(1)}
        className="px-2 py-0.5 rounded-full text-[11px] font-mono hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer min-w-[36px] text-center font-medium"
      >
        Reset
      </button>

      <button
        type="button"
        title="Zoom In"
        onClick={() => zoomIn()}
        className="size-6 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Plus className="size-3.5" />
      </button>

      <div className="w-[1px] h-3.5 bg-black/[0.08] dark:bg-white/[0.12] mx-0.5 rounded-full" />

      <button
        type="button"
        title="Fit All Nodes (0)"
        onClick={() => fitView({ padding: 0.2 })}
        className="size-6 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Maximize2 className="size-3.5" />
      </button>
    </div>
  );
}

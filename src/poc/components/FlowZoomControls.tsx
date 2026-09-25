import React from "react";
import { useReactFlow } from "@xyflow/react";
import { Minus, Plus, Maximize2 } from "lucide-react";

interface FlowZoomControlsProps {
  sidebarOpen?: boolean;
}

export function FlowZoomControls({ sidebarOpen = false }: FlowZoomControlsProps) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();

  return (
    <div
      style={{
        position: "absolute",
        bottom: "16px",
        left: sidebarOpen ? "344px" : "16px",
        zIndex: 25,
      }}
      className="flex items-center gap-1 h-7.5 px-2 rounded-full glass-panel shadow-md text-zinc-700 dark:text-zinc-300 font-sans text-xs select-none pointer-events-auto transition-[left] duration-200 ease-out"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Zoom Out"
        onClick={() => zoomOut()}
        className="size-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Minus className="size-3" />
      </button>

      <button
        type="button"
        title="Reset Zoom to 100%"
        onClick={() => zoomTo(1)}
        className="px-1.5 py-0.5 rounded-full text-[11px] font-mono hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer min-w-[36px] text-center"
      >
        Reset
      </button>

      <button
        type="button"
        title="Zoom In"
        onClick={() => zoomIn()}
        className="size-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Plus className="size-3" />
      </button>

      <div className="w-[1px] h-3 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

      <button
        type="button"
        title="Fit All Nodes"
        onClick={() => fitView({ padding: 0.2 })}
        className="size-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Maximize2 className="size-3" />
      </button>
    </div>
  );
}

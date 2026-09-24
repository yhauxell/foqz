import React from "react";
import { useEditor, useValue } from "tldraw";
import { Minus, Plus, Maximize2 } from "lucide-react";

interface CanvasZoomControlsProps {
  sidebarOpen?: boolean;
}

export function CanvasZoomControls({ sidebarOpen = false }: CanvasZoomControlsProps) {
  const editor = useEditor();
  const zoom = useValue(
    "zoom",
    () => {
      try {
        return Math.round(editor.getZoomLevel() * 100);
      } catch {
        return 100;
      }
    },
    [editor],
  );

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
        title="Zoom Out (⌘-)"
        onClick={() => editor.zoomOut()}
        className="size-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Minus className="size-3" />
      </button>

      <button
        type="button"
        title="Reset Zoom to 100% (Shift+0)"
        onClick={() => editor.resetZoom()}
        className="px-1.5 py-0.5 rounded-full text-[11px] font-mono hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer min-w-[36px] text-center"
      >
        {zoom}%
      </button>

      <button
        type="button"
        title="Zoom In (⌘+)"
        onClick={() => editor.zoomIn()}
        className="size-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <Plus className="size-3" />
      </button>

      <div className="h-3 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

      <button
        type="button"
        title="Zoom to Fit All (Shift+1)"
        onClick={() => editor.zoomToFit()}
        className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
      >
        <Maximize2 className="size-3" />
      </button>
    </div>
  );
}

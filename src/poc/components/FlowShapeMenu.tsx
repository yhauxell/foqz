import React, { memo } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { Palette, Trash2, ArrowRight } from "lucide-react";
import { ALL_PROJECT_ACCENTS, type ProjectAccent } from "@/shapes/projectFrame/ProjectFrameShapeUtil";
import { type TaskPaperTheme } from "@/shapes/focusTask/FocusTaskShapeUtil";

interface FlowShapeMenuProps {
  selectedNode: Node | null;
}

const COLOR_PRESETS = [
  { name: "Blue", hex: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)", accent: "blue", paper: "fog" },
  { name: "Emerald", hex: "#10b981", bg: "rgba(16, 185, 129, 0.12)", accent: "emerald", paper: "sage" },
  { name: "Amber", hex: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", accent: "amber", paper: "cream" },
  { name: "Rose", hex: "#f43f5e", bg: "rgba(244, 63, 94, 0.12)", accent: "rose", paper: "bloom" },
  { name: "Indigo", hex: "#6366f1", bg: "rgba(99, 102, 241, 0.12)", accent: "indigo", paper: "fog" },
  { name: "Zinc", hex: "#71717a", bg: "rgba(113, 113, 122, 0.12)", accent: "zinc", paper: "cream" },
];

export const FlowShapeMenu = memo(function FlowShapeMenu({ selectedNode }: FlowShapeMenuProps) {
  const { setNodes } = useReactFlow();

  if (!selectedNode) return null;

  const handleColorChange = (color: typeof COLOR_PRESETS[0]) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;

        if (node.type === "box") {
          return {
            ...node,
            data: {
              ...node.data,
              strokeColor: color.hex,
              color: color.bg,
            },
          };
        }

        if (node.type === "projectFrame") {
          return {
            ...node,
            data: {
              ...node.data,
              accent: color.accent as ProjectAccent,
            },
          };
        }

        if (node.type === "focusTask") {
          return {
            ...node,
            data: {
              ...node.data,
              paper: color.paper as TaskPaperTheme,
            },
          };
        }

        if (node.type === "text") {
          return {
            ...node,
            data: {
              ...node.data,
              color: color.hex,
            },
          };
        }

        if (node.type === "pencil") {
          return {
            ...node,
            data: {
              ...node.data,
              color: color.hex,
            },
          };
        }

        return node;
      })
    );
  };

  const handleDelete = () => {
    setNodes((nodes) => nodes.filter((n) => n.id !== selectedNode.id && n.parentId !== selectedNode.id));
  };

  return (
    <div
      className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel shadow-lg select-none pointer-events-auto border border-white/60 dark:border-zinc-800/80 animate-in fade-in zoom-in-95 duration-150"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 mr-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 capitalize">
        <Palette className="size-3 text-zinc-500" />
        <span>{selectedNode.type}</span>
      </div>

      {/* Color Palette Buttons */}
      <div className="flex items-center gap-1">
        {COLOR_PRESETS.map((color) => (
          <button
            key={color.name}
            type="button"
            title={`Set color: ${color.name}`}
            onClick={() => handleColorChange(color)}
            className="size-5 rounded-full border border-black/10 dark:border-white/20 transition-transform hover:scale-120 cursor-pointer shadow-2xs"
            style={{ backgroundColor: color.hex }}
          />
        ))}
      </div>

      <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700 mx-1" />

      {/* Delete button */}
      <button
        type="button"
        title="Delete shape (Del/Backspace)"
        onClick={handleDelete}
        className="size-5 rounded-full flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-950/80 text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
});

import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  useReactFlow,
  NodeToolbar,
  Position,
  type Node,
} from "@xyflow/react";
import { Copy, MessageSquare, Trash2 } from "lucide-react";
import { type ProjectAccent, type TaskPaperTheme } from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

interface FlowShapeMenuProps {
  selectedNode: Node | null;
}

const COLOR_PRESETS = [
  { name: "Blue",    hex: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)",  accent: "blue",    paper: "fog"   },
  { name: "Emerald", hex: "#10b981", bg: "rgba(16, 185, 129, 0.12)",  accent: "emerald", paper: "sage"  },
  { name: "Amber",   hex: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)",  accent: "amber",   paper: "cream" },
  { name: "Rose",    hex: "#f43f5e", bg: "rgba(244, 63, 94, 0.12)",   accent: "rose",    paper: "bloom" },
  { name: "Indigo",  hex: "#6366f1", bg: "rgba(99, 102, 241, 0.12)",  accent: "indigo",  paper: "fog"   },
  { name: "Zinc",    hex: "#71717a", bg: "rgba(113, 113, 122, 0.12)", accent: "zinc",    paper: "cream" },
];

const BORDER_STYLES = [
  {
    id: "solid" as const,
    label: "Solid",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none">
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dashed" as const,
    label: "Dashed",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none">
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3.2 2.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dotted" as const,
    label: "Dotted",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none">
        <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="2.4" strokeDasharray="0.1 3.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

function useOutsideClick(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [ref, onClose]);
}

export const FlowShapeMenu = memo(function FlowShapeMenu({ selectedNode }: FlowShapeMenuProps) {
  const { setNodes, getInternalNode, deleteElements } = useReactFlow();
  const [colorOpen, setColorOpen] = useState(false);
  const [borderOpen, setBorderOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);

  const closeColor = useCallback(() => setColorOpen(false), []);
  const closeBorder = useCallback(() => setBorderOpen(false), []);
  useOutsideClick(colorRef, closeColor);
  useOutsideClick(borderRef, closeBorder);

  if (!selectedNode) return null;

  // Derive current color hex from node type
  const currentHex = (() => {
    if (selectedNode.type === "box" || selectedNode.type === "circle") {
      return (selectedNode.data?.strokeColor as string) || "#3b82f6";
    }
    if (selectedNode.type === "projectFrame") {
      const accent = (selectedNode.data?.accent as string) || "blue";
      return COLOR_PRESETS.find((c) => c.accent === accent)?.hex || "#3b82f6";
    }
    if (selectedNode.type === "focusTask") {
      const paper = (selectedNode.data?.paper as string) || "cream";
      return COLOR_PRESETS.find((c) => c.paper === paper)?.hex || "#f59e0b";
    }
    return (selectedNode.data?.color as string) || "#71717a";
  })();

  const handleColorChange = (color: typeof COLOR_PRESETS[0]) => {
    setColorOpen(false);
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        if (node.type === "box" || node.type === "circle") {
          return { ...node, data: { ...node.data, strokeColor: color.hex, color: color.bg } };
        }
        if (node.type === "projectFrame") {
          return { ...node, data: { ...node.data, accent: color.accent as ProjectAccent } };
        }
        if (node.type === "focusTask") {
          return { ...node, data: { ...node.data, paper: color.paper as TaskPaperTheme } };
        }
        return { ...node, data: { ...node.data, color: color.hex } };
      })
    );
  };

  const isFillEligible = selectedNode.type === "box" || selectedNode.type === "circle";
  const currentFillStyle = (selectedNode.data?.fillStyle as "hachure" | "solid" | "none") || "hachure";

  const handleFillStyleChange = (fillStyle: "hachure" | "solid" | "none") => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        return { ...node, data: { ...node.data, fillStyle } };
      })
    );
  };

  const isBorderEligible =
    selectedNode.type === "box" ||
    selectedNode.type === "circle" ||
    selectedNode.type === "focusTask" ||
    selectedNode.type === "projectFrame";

  const currentBorderStyle: "solid" | "dashed" | "dotted" =
    (selectedNode.data?.borderStyle as "solid" | "dashed" | "dotted") ||
    (selectedNode.type === "projectFrame" ? "dashed" : "solid");

  const currentBorderIcon = BORDER_STYLES.find((s) => s.id === currentBorderStyle)?.icon ?? BORDER_STYLES[0].icon;

  const handleBorderStyleChange = (borderStyle: "solid" | "dashed" | "dotted") => {
    setBorderOpen(false);
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        return { ...node, data: { ...node.data, borderStyle } };
      })
    );
  };

  const handleDelete = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    useFlowCanvasStore.getState().deleteNode(selectedNode.id);
    deleteElements({ nodes: [{ id: selectedNode.id }] }).catch(() => {});
  };

  const nodeInternal = getInternalNode(selectedNode.id);
  const nodeAbsY = nodeInternal?.internals?.positionAbsolute?.y ?? selectedNode.position.y;
  const toolbarPosition = nodeAbsY < 70 ? Position.Bottom : Position.Top;

  return (
    <NodeToolbar nodeId={selectedNode.id} isVisible={true} position={toolbarPosition} offset={10} align="center">
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full glass-panel shadow-2xl select-none pointer-events-auto border border-white/60 dark:border-zinc-800/80 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color swatch button → opens popover */}
        <div className="relative" ref={colorRef}>
          <button
            type="button"
            title="Change color"
            onClick={() => { setColorOpen((v) => !v); setBorderOpen(false); }}
            className="size-5 rounded-full border-2 border-white/90 dark:border-zinc-600 shadow-xs transition-transform hover:scale-110 cursor-pointer ring-1 ring-black/10 dark:ring-white/10"
            style={{ backgroundColor: currentHex }}
          />
          {colorOpen && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 flex flex-col gap-1.5 p-1.5 rounded-2xl glass-panel shadow-2xl border border-white/60 dark:border-zinc-800 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 z-50 bg-white/90 dark:bg-zinc-900/90"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    title={color.name}
                    onClick={() => handleColorChange(color)}
                    className={`size-5 rounded-full border border-black/10 dark:border-white/20 transition-transform hover:scale-125 cursor-pointer shadow-2xs ${
                      currentHex === color.hex ? "ring-2 ring-offset-1 ring-white dark:ring-zinc-700 scale-110" : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>

              {/* Fill style selector for Box / Circle */}
              {isFillEligible && (
                <div className="flex items-center gap-1 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => handleFillStyleChange("hachure")}
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer text-center ${
                      currentFillStyle === "hachure"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                    title="Sketchy cross-hatch fill"
                  >
                    Sketch
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillStyleChange("solid")}
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer text-center ${
                      currentFillStyle === "solid"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                    title="Soft translucent tint fill"
                  >
                    Tint
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillStyleChange("none")}
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer text-center ${
                      currentFillStyle === "none"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                    title="Transparent border outline only"
                  >
                    Outline
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Border style swatch → opens popover */}
        {isBorderEligible && (
          <>
            <div className="w-[1px] h-3.5 bg-zinc-300/70 dark:bg-zinc-700/70" />
            <div className="relative" ref={borderRef}>
              <button
                type="button"
                title={`Border: ${currentBorderStyle}`}
                onClick={() => { setBorderOpen((v) => !v); setColorOpen(false); }}
                className="size-5 rounded flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                {currentBorderIcon}
              </button>
              {borderOpen && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 flex items-center gap-0.5 p-1 rounded-xl glass-panel shadow-2xl border border-white/60 dark:border-zinc-800 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 z-50"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {BORDER_STYLES.map((style) => {
                    const isActive = currentBorderStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        title={style.label}
                        onClick={() => handleBorderStyleChange(style.id)}
                        className={`size-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
                          isActive
                            ? "bg-white dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100 shadow-xs"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        }`}
                      >
                        {style.icon}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <div className="w-[1px] h-3.5 bg-zinc-300/70 dark:bg-zinc-700/70" />

        <button
          type="button"
          title="Chat with Element (C)"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("foqz:open-inline-chat", {
                detail: { shapeId: selectedNode.id },
              })
            );
          }}
          className="h-6 px-2 rounded-full flex items-center gap-1 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer text-[11px] font-medium"
        >
          <MessageSquare className="size-3" />
          <span>Chat</span>
        </button>

        <button
          type="button"
          title="Duplicate (⌘D)"
          onClick={(e) => {
            e.stopPropagation();
            useFlowCanvasStore.getState().duplicateSelected();
          }}
          className="size-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <Copy className="size-3" />
        </button>

        <button
          type="button"
          title="Delete (Del/Backspace)"
          onClick={handleDelete}
          className="size-5 rounded-full flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-950/80 text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </NodeToolbar>
  );
});

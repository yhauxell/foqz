import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  useReactFlow,
  NodeToolbar,
  Position,
  type Node,
} from "@xyflow/react";
import {
  Copy,
  Crosshair,
  GitPullRequest,
  MessageSquare,
  Trash2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link2,
  Highlighter,
  RemoveFormatting,
  Minus,
  Plus,
} from "lucide-react";
import { type ProjectAccent, type TaskPaperTheme } from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type TextFormatType,
  applyFormattingToString,
  applyFormattingToTextarea,
} from "../utils/textFormatting";

interface FlowShapeMenuProps {
  selectedNode: Node | null;
}

export const COLOR_PRESETS = [
  { name: "Blue",    hex: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)",  solidLight: "#eff6ff", solidDark: "#172554", accent: "blue",    paper: "fog"   },
  { name: "Emerald", hex: "#10b981", bg: "rgba(16, 185, 129, 0.12)",  solidLight: "#ecfdf5", solidDark: "#064e3b", accent: "emerald", paper: "sage"  },
  { name: "Amber",   hex: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)",  solidLight: "#fffbeb", solidDark: "#451a03", accent: "amber",   paper: "cream" },
  { name: "Rose",    hex: "#f43f5e", bg: "rgba(244, 63, 94, 0.12)",   solidLight: "#fff1f2", solidDark: "#4c0519", accent: "rose",    paper: "bloom" },
  { name: "Indigo",  hex: "#6366f1", bg: "rgba(99, 102, 241, 0.12)",  solidLight: "#eef2ff", solidDark: "#1e1b4b", accent: "indigo",  paper: "fog"   },
  { name: "Zinc",    hex: "#71717a", bg: "rgba(113, 113, 122, 0.12)", solidLight: "#f4f4f5", solidDark: "#27272a", accent: "zinc",    paper: "cream" },
  { name: "White",   hex: "#ffffff", bg: "rgba(255, 255, 255, 0.8)",  solidLight: "#ffffff", solidDark: "#18181b", accent: "zinc",    paper: "fog"   },
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
      if (ref.current && !ref.current.contains(e.target as unknown as globalThis.Node)) onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [ref, onClose]);
}

export const FlowShapeMenu = memo(function FlowShapeMenu({ selectedNode }: FlowShapeMenuProps) {
  const { setNodes, getInternalNode, deleteElements, fitView } = useReactFlow();
  const [colorOpen, setColorOpen] = useState(false);
  const [borderOpen, setBorderOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("https://");

  const colorRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);

  const closeColor = useCallback(() => setColorOpen(false), []);
  const closeBorder = useCallback(() => setBorderOpen(false), []);
  const closeHighlight = useCallback(() => setHighlightOpen(false), []);
  const closeLink = useCallback(() => setLinkOpen(false), []);

  useOutsideClick(colorRef, closeColor);
  useOutsideClick(borderRef, closeBorder);
  useOutsideClick(highlightRef, closeHighlight);
  useOutsideClick(linkRef, closeLink);

  const handleCenter = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!selectedNode) return;
      fitView({
        nodes: [{ id: selectedNode.id }],
        duration: 300,
        maxZoom: 1.15,
        padding: 0.25,
      });
    },
    [fitView, selectedNode]
  );

  const handleDelete = useCallback(
    (e?: React.MouseEvent | React.PointerEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (!selectedNode?.id) return;
      const idToDelete = selectedNode.id;
      useFlowCanvasStore.getState().deleteNode(idToDelete);
      deleteElements({ nodes: [{ id: idToDelete }] }).catch(() => {});
    },
    [selectedNode, deleteElements]
  );

  const handleFormatAction = useCallback(
    (format: TextFormatType, options?: { url?: string; color?: HighlightColor }) => {
      if (!selectedNode) return;
      const id = selectedNode.id;
      let textarea = document.getElementById(`text-node-input-${id}`) as HTMLTextAreaElement | null;
      if (
        !textarea &&
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLTextAreaElement &&
        document.activeElement.id.startsWith("text-node-input-")
      ) {
        textarea = document.activeElement;
      }

      if (textarea) {
        const updated = applyFormattingToTextarea(textarea, format, options);
        useFlowCanvasStore.getState().updateNodeData(id, { text: updated });
        setNodes((nodes) =>
          nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: updated } } : n))
        );
      } else {
        const currentText = (selectedNode.data?.text as string) || "";
        const updated = applyFormattingToString(currentText, format, options);
        useFlowCanvasStore.getState().updateNodeData(id, { text: updated });
        setNodes((nodes) =>
          nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: updated } } : n))
        );
      }
    },
    [selectedNode, setNodes]
  );

  const handleFontSizeDelta = useCallback(
    (delta: number) => {
      if (!selectedNode) return;
      const currentSize = (selectedNode.data?.fontSize as number) || 16;
      const newSize = Math.min(72, Math.max(10, currentSize + delta));
      useFlowCanvasStore.getState().updateNodeData(selectedNode.id, { fontSize: newSize });
      setNodes((nodes) =>
        nodes.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, fontSize: newSize } } : n))
      );
    },
    [selectedNode, setNodes]
  );

  if (!selectedNode) return null;

  const isText = selectedNode.type === "text";
  const isArrow = selectedNode.type === "arrow";
  const isFillEligible = selectedNode.type === "box" || selectedNode.type === "circle";
  const isBorderEligible =
    selectedNode.type === "box" ||
    selectedNode.type === "circle" ||
    selectedNode.type === "focusTask" ||
    selectedNode.type === "projectFrame" ||
    selectedNode.type === "arrow";

  // Derive current color hex from node type
  const currentHex = (() => {
    if (selectedNode.type === "arrow") {
      return (selectedNode.data?.strokeColor as string) || (selectedNode.data?.color as string) || "#6366f1";
    }
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
    if (selectedNode.type === "note") {
      const variant = (selectedNode.data?.variant as string) || "yellow";
      return COLOR_PRESETS.find((c) => c.accent === variant)?.hex || (selectedNode.data?.color as string) || "#f59e0b";
    }
    return (selectedNode.data?.color as string) || "#71717a";
  })();

  const currentFontSize = (selectedNode.data?.fontSize as number) || 16;

  const handleColorChange = (color: typeof COLOR_PRESETS[0]) => {
    setColorOpen(false);
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        if (node.type === "arrow") {
          return { ...node, data: { ...node.data, strokeColor: color.hex, color: color.hex } };
        }
        if (node.type === "box" || node.type === "circle") {
          const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
          const isSolid = node.data?.fillStyle === "solid";
          const solidColor = isDark ? color.solidDark : color.solidLight;
          return {
            ...node,
            data: {
              ...node.data,
              strokeColor: color.hex,
              color: isSolid ? solidColor : color.bg,
              solidColor: isSolid ? solidColor : undefined,
            },
          };
        }
        if (node.type === "projectFrame") {
          return { ...node, data: { ...node.data, accent: color.accent as ProjectAccent } };
        }
        if (node.type === "focusTask") {
          return { ...node, data: { ...node.data, paper: color.paper as TaskPaperTheme } };
        }
        if (node.type === "note") {
          return {
            ...node,
            data: {
              ...node.data,
              variant: color.accent,
              color: undefined,
              bg: undefined,
            },
          };
        }
        return { ...node, data: { ...node.data, color: color.hex } };
      })
    );
  };

  const currentSpear = ((selectedNode.data?.spear as string) || "end") as "end" | "start" | "both" | "none";

  const handleSpearChange = (spear: "end" | "start" | "both" | "none") => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        return { ...node, data: { ...node.data, spear } };
      })
    );
  };

  const currentFillStyle = (selectedNode.data?.fillStyle as "hachure" | "tint" | "solid" | "none") || "hachure";

  const handleFillStyleChange = (fillStyle: "hachure" | "tint" | "solid" | "none") => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
        const preset = COLOR_PRESETS.find((c) => c.hex === currentHex) || COLOR_PRESETS[0];
        const solidColor = isDark ? preset.solidDark : preset.solidLight;

        if (fillStyle === "solid") {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "solid",
              solidColor,
              color: solidColor,
            },
          };
        } else if (fillStyle === "tint") {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "tint",
              solidColor: undefined,
              color: preset.bg,
            },
          };
        } else if (fillStyle === "hachure") {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "hachure",
              solidColor: undefined,
              color: preset.bg,
            },
          };
        } else {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "none",
              solidColor: undefined,
            },
          };
        }
      })
    );
  };

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
        {/* TEXT SPECIFIC CONTROLS */}
        {isText && (
          <>
            {/* Font Size (+-) controls */}
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-full px-1.5 py-0.5">
              <button
                type="button"
                title="Decrease font size"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFontSizeDelta(-2);
                }}
                className="size-5 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <Minus className="size-3" />
              </button>

              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 min-w-[28px] text-center font-mono">
                {currentFontSize}px
              </span>

              <button
                type="button"
                title="Increase font size"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFontSizeDelta(2);
                }}
                className="size-5 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <Plus className="size-3" />
              </button>
            </div>

            <div className="w-[1px] h-3.5 bg-zinc-300/70 dark:bg-zinc-700/70" />

            {/* Bold */}
            <button
              type="button"
              title="Bold (**text**)"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatAction("bold");
              }}
              className="size-6 rounded flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Bold className="size-3.5" />
            </button>

            {/* Italic */}
            <button
              type="button"
              title="Italic (*text*)"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatAction("italic");
              }}
              className="size-6 rounded flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Italic className="size-3.5" />
            </button>

            {/* Underline */}
            <button
              type="button"
              title="Underline (<u>text</u>)"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatAction("underline");
              }}
              className="size-6 rounded flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Underline className="size-3.5" />
            </button>

            {/* Strikethrough */}
            <button
              type="button"
              title="Strikethrough (~~text~~)"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatAction("strike");
              }}
              className="size-6 rounded flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Strikethrough className="size-3.5" />
            </button>

            {/* Add Link */}
            <div className="relative" ref={linkRef}>
              <button
                type="button"
                title="Add Link ([text](url))"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLinkOpen((v) => !v);
                  setHighlightOpen(false);
                  setColorOpen(false);
                }}
                className={`size-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
                  linkOpen
                    ? "bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <Link2 className="size-3.5" />
              </button>

              {linkOpen && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 p-2 rounded-2xl glass-panel shadow-2xl border border-white/60 dark:border-zinc-800 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 z-50 bg-white/95 dark:bg-zinc-900/95 flex items-center gap-1.5"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="url"
                    value={linkInput}
                    autoFocus
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://example.com"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleFormatAction("link", { url: linkInput });
                        setLinkOpen(false);
                      } else if (e.key === "Escape") {
                        setLinkOpen(false);
                      }
                    }}
                    className="w-48 px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleFormatAction("link", { url: linkInput });
                      setLinkOpen(false);
                    }}
                    className="px-2 py-1 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            {/* Highlight with Color Popover */}
            <div className="relative" ref={highlightRef}>
              <button
                type="button"
                title="Highlight text"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHighlightOpen((v) => !v);
                  setLinkOpen(false);
                  setColorOpen(false);
                }}
                className={`size-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
                  highlightOpen
                    ? "bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <Highlighter className="size-3.5" />
              </button>

              {highlightOpen && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 p-1.5 rounded-2xl glass-panel shadow-2xl border border-white/60 dark:border-zinc-800 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 z-50 bg-white/95 dark:bg-zinc-900/95 flex flex-col gap-1.5"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5 px-1 pt-0.5">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        title={`Highlight ${c.name}`}
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFormatAction("highlight", { color: c });
                          setHighlightOpen(false);
                        }}
                        className="size-5 rounded-full border border-black/10 dark:border-white/20 transition-transform hover:scale-125 cursor-pointer shadow-2xs"
                        style={{ backgroundColor: c.bg }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFormatAction("clear");
                      setHighlightOpen(false);
                    }}
                    className="w-full text-center text-[10px] text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 py-0.5 hover:bg-black/5 dark:hover:bg-white/5 rounded cursor-pointer transition-colors"
                  >
                    Remove Highlight
                  </button>
                </div>
              )}
            </div>

            {/* Clear Formatting */}
            <button
              type="button"
              title="Clear formatting"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFormatAction("clear");
              }}
              className="size-6 rounded flex items-center justify-center text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RemoveFormatting className="size-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-300/70 dark:bg-zinc-700/70" />
          </>
        )}

        {/* Color swatch button → opens popover */}
        <div className="relative" ref={colorRef}>
          <button
            type="button"
            title="Change color"
            onClick={() => {
              setColorOpen((v) => !v);
              setBorderOpen(false);
              setHighlightOpen(false);
              setLinkOpen(false);
            }}
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

              {/* Fill style selector for Box / Circle (Solid, Tint, Sketch, Outline) */}
              {isFillEligible && (
                <div className="flex items-center gap-1 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => handleFillStyleChange("solid")}
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer text-center ${
                      currentFillStyle === "solid"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                    title="Solid opaque background (no transparent)"
                  >
                    Solid
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillStyleChange("tint")}
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer text-center ${
                      currentFillStyle === "tint"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                    title="Soft translucent tint fill"
                  >
                    Tint
                  </button>
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
                onClick={() => {
                  setBorderOpen((v) => !v);
                  setColorOpen(false);
                  setHighlightOpen(false);
                  setLinkOpen(false);
                }}
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

        {/* Arrowhead Spear Direction selector for Arrow nodes */}
        {isArrow && (
          <>
            <div className="w-[1px] h-3.5 bg-zinc-300/70 dark:bg-zinc-700/70" />
            <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/5 rounded-lg p-0.5">
              <button
                type="button"
                title="Arrowhead pointing right (end)"
                onClick={() => handleSpearChange("end")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                  currentSpear === "end"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                End →
              </button>
              <button
                type="button"
                title="Arrowhead pointing left (start)"
                onClick={() => handleSpearChange("start")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                  currentSpear === "start"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                ← Start
              </button>
              <button
                type="button"
                title="Double spearheads (both)"
                onClick={() => handleSpearChange("both")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                  currentSpear === "both"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                ↔ Both
              </button>
            </div>
          </>
        )}

        <div className="w-[1px] h-3.5 bg-zinc-300/70 dark:bg-zinc-700/70" />

        <button
          type="button"
          title="Chat with Element"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("foqz:open-inline-chat", {
                detail: { shapeId: selectedNode.id },
              })
            );
          }}
          className="size-5 rounded-full flex items-center justify-center hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
        >
          <MessageSquare className="size-3" />
        </button>

        <button
          type="button"
          title="Annotate Element"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent('foqz:open-annotation-composer', {
                detail: { nodeId: selectedNode.id },
              })
            );
          }}
          className="px-1.5 h-5 rounded-full flex items-center gap-1 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 transition-colors cursor-pointer text-[10px] font-medium"
        >
          <MessageSquare className="size-2.5" />
          <span>Annotate</span>
        </button>

        {selectedNode.type === "focusTask" && (
          <button
            type="button"
            title={(selectedNode.data as any)?.githubIssueNumber ? `GitHub #${(selectedNode.data as any).githubIssueNumber}` : "Create GitHub Issue"}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              const issueUrl = (selectedNode.data as any)?.githubIssueUrl;
              if (issueUrl) {
                window.open(issueUrl, "_blank", "noopener,noreferrer");
              } else {
                window.dispatchEvent(
                  new CustomEvent("foqz:open-create-github-issue", {
                    detail: { taskId: selectedNode.id },
                  })
                );
              }
            }}
            className="size-5 rounded-full flex items-center justify-center hover:bg-purple-50 dark:hover:bg-purple-950/40 text-purple-600 dark:text-purple-400 transition-colors cursor-pointer"
          >
            <GitPullRequest className="size-3" />
          </button>
        )}

        <button
          type="button"
          title="Center on Screen (⇧C)"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={handleCenter}
          className="size-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <Crosshair className="size-3" />
        </button>

        <button
          type="button"
          title="Duplicate (⌘D)"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
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
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDelete(e);
          }}
          onClick={handleDelete}
          className="size-5 rounded-full flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-950/80 text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </NodeToolbar>
  );
});

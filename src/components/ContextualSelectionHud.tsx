import React, { useState, useRef, useEffect } from "react";
import {
  useEditor,
  useValue,
  useRelevantStyles,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
  type TLDefaultSizeStyle,
} from "tldraw";
import {
  Copy,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";

const TLDRAW_COLOR_MAP: Record<
  string,
  { name: string; bg: string; dotHex: string }
> = {
  black: { name: "Black", bg: "bg-zinc-900 dark:bg-zinc-100", dotHex: "#18181b" },
  grey: { name: "Grey", bg: "bg-zinc-400 dark:bg-zinc-500", dotHex: "#a1a1aa" },
  "light-violet": { name: "Light Violet", bg: "bg-purple-300 dark:bg-purple-400", dotHex: "#d8b4fe" },
  violet: { name: "Violet", bg: "bg-violet-600 dark:bg-violet-500", dotHex: "#8b5cf6" },
  blue: { name: "Blue", bg: "bg-blue-600 dark:bg-blue-500", dotHex: "#3b82f6" },
  "light-blue": { name: "Light Blue", bg: "bg-sky-400 dark:bg-sky-400", dotHex: "#38bdf8" },
  yellow: { name: "Yellow", bg: "bg-amber-400 dark:bg-amber-400", dotHex: "#facc15" },
  orange: { name: "Orange", bg: "bg-orange-500 dark:bg-orange-500", dotHex: "#f97316" },
  green: { name: "Green", bg: "bg-emerald-600 dark:bg-emerald-500", dotHex: "#10b981" },
  "light-green": { name: "Light Green", bg: "bg-emerald-300 dark:bg-emerald-400", dotHex: "#6ee7b7" },
  "light-red": { name: "Light Red", bg: "bg-rose-300 dark:bg-rose-400", dotHex: "#fda4af" },
  red: { name: "Red", bg: "bg-red-600 dark:bg-red-500", dotHex: "#ef4444" },
};

const COLOR_ORDER: TLDefaultColorStyle[] = [
  "black",
  "grey",
  "light-violet",
  "violet",
  "blue",
  "light-blue",
  "yellow",
  "orange",
  "green",
  "light-green",
  "light-red",
  "red",
];

const FILL_OPTIONS: Array<{
  id: TLDefaultFillStyle;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: "none",
    label: "None",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      </svg>
    ),
  },
  {
    id: "semi",
    label: "Semi",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.5">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      </svg>
    ),
  },
  {
    id: "solid",
    label: "Solid",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      </svg>
    ),
  },
  {
    id: "pattern",
    label: "Pattern",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" />
        <line x1="3" y1="13" x2="13" y2="3" strokeWidth="1.2" />
        <line x1="7" y1="13" x2="13" y2="7" strokeWidth="1.2" />
        <line x1="3" y1="9" x2="9" y2="3" strokeWidth="1.2" />
      </svg>
    ),
  },
];

const DASH_OPTIONS: Array<{
  id: TLDefaultDashStyle;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: "draw",
    label: "Draw",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 10C5 6 10 12 14 6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "solid",
    label: "Solid",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="2" y1="8" x2="14" y2="8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dashed",
    label: "Dashed",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2">
        <line x1="2" y1="8" x2="14" y2="8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dotted",
    label: "Dotted",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 2.5">
        <line x1="2" y1="8" x2="14" y2="8" strokeLinecap="round" />
      </svg>
    ),
  },
];

const SIZE_OPTIONS: Array<{ id: TLDefaultSizeStyle; label: string }> = [
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
  { id: "xl", label: "XL" },
];

const PRIORITY_OPTIONS = [
  { id: 1, label: "P1", name: "Urgent" },
  { id: 2, label: "P2", name: "High" },
  { id: 3, label: "P3", name: "Normal" },
  { id: 4, label: "P4", name: "Low" },
];

export function ContextualSelectionHud() {
  const editor = useEditor();
  const [activeMenu, setActiveMenu] = useState<"color" | "fill" | "dash" | "size" | "opacity" | "priority" | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const [isForceCollapsed, setIsForceCollapsed] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  const isExpanded = !isForceCollapsed && (isHovered || isManuallyExpanded || activeMenu !== null);

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Close menus and collapse when clicking outside
  useEffect(() => {
    const handleDown = (e: PointerEvent) => {
      if (hudRef.current && !hudRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
        setIsHovered(false);
        setIsManuallyExpanded(false);
        setIsForceCollapsed(false);
      }
    };
    window.addEventListener("pointerdown", handleDown);
    return () => window.removeEventListener("pointerdown", handleDown);
  }, []);

  // Track selection, screen bounds, viewport bounds, and read-only status
  const selectedShapeIds = useValue("selectedShapeIds", () => editor.getSelectedShapeIds(), [editor]);
  const selectedShapes = useValue("selectedShapes", () => editor.getSelectedShapes(), [editor]);
  const selectionBounds = useValue("selectionBounds", () => editor.getSelectionRotatedScreenBounds(), [editor]);
  const viewportBounds = useValue("viewportBounds", () => editor.getViewportScreenBounds(), [editor]);
  const isReadonly = useValue("isReadonly", () => editor.getInstanceState().isReadonly, [editor]);
  const opacity = useValue("sharedOpacity", () => editor.getSharedOpacity(), [editor]);

  const styles = useRelevantStyles();

  // Stable selection key so cursor movement and store ticks never reset hover state
  const selectionKey = selectedShapeIds.slice().sort().join(",");
  const prevSelectionKeyRef = useRef(selectionKey);

  // Reset to default collapsed ONLY when the selection actually changes (different shapes selected)
  useEffect(() => {
    if (prevSelectionKeyRef.current !== selectionKey) {
      prevSelectionKeyRef.current = selectionKey;
      setActiveMenu(null);
      setIsHovered(false);
      setIsManuallyExpanded(false);
      setIsForceCollapsed(false);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    }
  }, [selectionKey]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
    setIsForceCollapsed(false);
  };

  const handleMouseMove = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (!isHovered && !isForceCollapsed) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (activeMenu !== null) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
      setIsManuallyExpanded(false);
      setIsForceCollapsed(false);
    }, 350);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpanded) {
      setIsForceCollapsed(true);
      setIsManuallyExpanded(false);
      setActiveMenu(null);
    } else {
      setIsForceCollapsed(false);
      setIsManuallyExpanded(true);
    }
  };

  if (isReadonly || !selectionBounds || !viewportBounds || selectedShapes.length === 0) {
    return null;
  }

  // Check supported styles from relevantStyles
  const colorStyle = styles?.get(DefaultColorStyle);
  const fillStyle = styles?.get(DefaultFillStyle);
  const dashStyle = styles?.get(DefaultDashStyle);
  const sizeStyle = styles?.get(DefaultSizeStyle);

  const hasColor = colorStyle !== undefined;
  const hasFill = fillStyle !== undefined;
  const hasDash = dashStyle !== undefined;
  const hasSize = sizeStyle !== undefined;
  const hasOpacity = opacity !== undefined;

  const isSingleTask = selectedShapes.length === 1 && selectedShapes[0].type === "focus-task";
  const singleTask = isSingleTask ? (selectedShapes[0] as TLFocusTaskShape) : null;

  // Change styles helper
  const handleColorChange = (color: TLDefaultColorStyle) => {
    editor.run(() => {
      editor.setStyleForSelectedShapes(DefaultColorStyle, color);
      editor.setStyleForNextShapes(DefaultColorStyle, color);
    });
    setActiveMenu(null);
  };

  const handleFillChange = (fill: TLDefaultFillStyle) => {
    editor.run(() => {
      editor.setStyleForSelectedShapes(DefaultFillStyle, fill);
      editor.setStyleForNextShapes(DefaultFillStyle, fill);
    });
    setActiveMenu(null);
  };

  const handleDashChange = (dash: TLDefaultDashStyle) => {
    editor.run(() => {
      editor.setStyleForSelectedShapes(DefaultDashStyle, dash);
      editor.setStyleForNextShapes(DefaultDashStyle, dash);
    });
    setActiveMenu(null);
  };

  const handleSizeChange = (size: TLDefaultSizeStyle) => {
    editor.run(() => {
      editor.setStyleForSelectedShapes(DefaultSizeStyle, size);
      editor.setStyleForNextShapes(DefaultSizeStyle, size);
    });
    setActiveMenu(null);
  };

  const handleOpacityChange = (val: number) => {
    editor.run(() => {
      editor.setOpacityForSelectedShapes(val);
      editor.setOpacityForNextShapes(val);
    });
  };

  const handleDuplicate = () => {
    editor.duplicateShapes(editor.getSelectedShapeIds());
  };

  const handleDelete = () => {
    editor.deleteShapes(editor.getSelectedShapeIds());
  };

  const handleOpenCopilot = () => {
    const primaryId = selectedShapes[0]?.id;
    window.dispatchEvent(
      new CustomEvent("foqz:open-copilot", {
        detail: { shapeId: primaryId },
      }),
    );
  };

  const handleTaskPriority = (priority: number) => {
    if (!singleTask) return;
    editor.updateShape({
      id: singleTask.id,
      type: "focus-task",
      props: { priority },
    });
    setActiveMenu(null);
  };

  const handleTaskStatus = (status: "open" | "doing" | "done") => {
    if (!singleTask) return;
    editor.updateShape({
      id: singleTask.id,
      type: "focus-task",
      props: { status },
    });
  };

  // Determine current active values
  const currentColor = colorStyle?.type === "shared" ? colorStyle.value : "black";
  const currentFill = fillStyle?.type === "shared" ? fillStyle.value : "none";
  const currentDash = dashStyle?.type === "shared" ? dashStyle.value : "draw";
  const currentSize = sizeStyle?.type === "shared" ? sizeStyle.value : "m";
  const currentOpacityVal = opacity?.type === "shared" ? opacity.value : 1;

  // Viewport calculation & clamping relative to tldraw viewport container
  const HUD_HEIGHT = 36;
  const GAP = 10;
  const TOP_RESERVE = 12; // Margin inside top of canvas
  const BOTTOM_RESERVE = 76; // Margin above bottom toolbar

  // Translate screen bounds to tldraw container coordinates
  const relMinY = selectionBounds.minY - viewportBounds.y;
  const relMaxY = selectionBounds.maxY - viewportBounds.y;
  const relMidX = selectionBounds.midX - viewportBounds.x;

  const preferTop = relMinY - HUD_HEIGHT - GAP >= TOP_RESERVE;
  const topPos = preferTop
    ? Math.round(relMinY - HUD_HEIGHT - GAP)
    : Math.round(Math.min(viewportBounds.h - BOTTOM_RESERVE, relMaxY + GAP));

  // Stable horizontal clamping so the pill NEVER shifts horizontally when expanding or collapsing
  const maxContentHalfWidth = isSingleTask ? 195 : 135;
  const minLeft = maxContentHalfWidth + 16;
  const maxLeft = Math.max(minLeft, viewportBounds.w - maxContentHalfWidth - 16);
  const leftPos = Math.round(Math.max(minLeft, Math.min(maxLeft, relMidX)));

  const activeColorMeta = TLDRAW_COLOR_MAP[currentColor] || TLDRAW_COLOR_MAP.black;

  return (
    <div
      ref={hudRef}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: `${topPos}px`,
        left: `${leftPos}px`,
        transform: "translateX(-50%)",
        zIndex: 1000,
      }}
      className="select-none py-1.5 px-1 -my-1.5 -mx-1 pointer-events-auto"
    >
      {/* Floating Pill Container with Smooth Spring Expansion */}
      <div
        className={`flex items-center h-9 rounded-full border border-zinc-200/90 dark:border-zinc-800/90 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-lg text-zinc-800 dark:text-zinc-200 font-sans text-xs transition-[box-shadow,border-color,padding] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isExpanded
            ? "px-2 shadow-2xl"
            : "px-2.5 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-xl"
        }`}
      >
        {/* Left: Swatch / Primary Style Indicator */}
        <div className="relative shrink-0 flex items-center">
          {hasColor ? (
            <button
              type="button"
              title={isExpanded ? "Change Color" : "Format selection (hover to expand)"}
              onClick={() => {
                if (!isExpanded) {
                  setIsManuallyExpanded(true);
                } else {
                  setActiveMenu(activeMenu === "color" ? null : "color");
                }
              }}
              className="flex items-center p-0.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
            >
              <span
                className="size-3.5 rounded-full border border-black/10 dark:border-white/20 shrink-0 shadow-xs transition-transform hover:scale-110"
                style={{ backgroundColor: activeColorMeta.dotHex }}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsManuallyExpanded((v) => !v)}
              title="Format selection (hover to expand)"
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <SlidersHorizontal className="size-3.5" />
            </button>
          )}

          {/* Color Palette Popover */}
          {activeMenu === "color" && hasColor && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 px-0.5">
                Color
              </div>
              <div className="grid grid-cols-6 gap-1.5 w-44">
                {COLOR_ORDER.map((c) => {
                  const meta = TLDRAW_COLOR_MAP[c];
                  const isSelected = currentColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      title={meta.name}
                      onClick={() => handleColorChange(c)}
                      className={`size-6 rounded-full flex items-center justify-center border transition-transform hover:scale-110 ${
                        isSelected
                          ? "border-zinc-900 dark:border-white ring-2 ring-violet-500/40 scale-105"
                          : "border-black/10 dark:border-white/10"
                      }`}
                      style={{ backgroundColor: meta.dotHex }}
                    >
                      {isSelected && (
                        <Check
                          className={`size-3 ${
                            c === "black"
                              ? "text-white"
                              : c === "yellow" || c === "light-green"
                              ? "text-zinc-900"
                              : "text-white"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Expandable Tools Section with Fluid Spring Reveal */}
        <div
          className={`flex items-center transition-[max-width,opacity] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isExpanded
              ? isSingleTask
                ? "max-w-[390px] opacity-100 overflow-visible"
                : "max-w-[270px] opacity-100 overflow-visible"
              : "max-w-0 opacity-0 overflow-hidden pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-1 shrink-0 whitespace-nowrap px-0.5">
          {/* Fill Mode */}
          {hasFill && (
            <div className="relative">
              <button
                type="button"
                title={`Fill: ${currentFill}`}
                onClick={() => setActiveMenu(activeMenu === "fill" ? null : "fill")}
                className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                {FILL_OPTIONS.find((f) => f.id === currentFill)?.icon || FILL_OPTIONS[0].icon}
              </button>

              {/* Fill Popover */}
              {activeMenu === "fill" && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl flex items-center gap-1 z-50 animate-in fade-in zoom-in-95 duration-75">
                  {FILL_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      title={f.label}
                      onClick={() => handleFillChange(f.id)}
                      className={`p-1.5 rounded-lg text-xs flex items-center justify-center transition-colors ${
                        currentFill === f.id
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {f.icon}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dash / Stroke */}
          {hasDash && (
            <div className="relative">
              <button
                type="button"
                title={`Stroke Dash: ${currentDash}`}
                onClick={() => setActiveMenu(activeMenu === "dash" ? null : "dash")}
                className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                {DASH_OPTIONS.find((d) => d.id === currentDash)?.icon || DASH_OPTIONS[0].icon}
              </button>

              {/* Dash Popover */}
              {activeMenu === "dash" && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl flex items-center gap-1 z-50 animate-in fade-in zoom-in-95 duration-75">
                  {DASH_OPTIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      title={d.label}
                      onClick={() => handleDashChange(d.id)}
                      className={`p-1.5 rounded-lg text-xs flex items-center justify-center transition-colors ${
                        currentDash === d.id
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {d.icon}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Size Pills (S, M, L, XL) */}
          {hasSize && (
            <div className="flex items-center gap-0.5 px-0.5 bg-zinc-100/80 dark:bg-zinc-900/80 rounded-full p-0.5 border border-zinc-200/50 dark:border-zinc-800/50">
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={`Size ${s.label}`}
                  onClick={() => handleSizeChange(s.id)}
                  className={`w-5 h-5 rounded-full text-[10px] font-mono flex items-center justify-center transition-all ${
                    currentSize === s.id
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Focus Task Card Controls */}
          {isSingleTask && singleTask && (
            <>
              <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

              {/* Task Priority Chip */}
              <div className="relative">
                <button
                  type="button"
                  title="Change Priority"
                  onClick={() => setActiveMenu(activeMenu === "priority" ? null : "priority")}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  <span>P{singleTask.props.priority || 3}</span>
                  <ChevronDown className="size-2.5 opacity-50" />
                </button>

                {/* Priority Menu */}
                {activeMenu === "priority" && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col gap-1 w-28 z-50 animate-in fade-in zoom-in-95 duration-75">
                    {PRIORITY_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleTaskPriority(p.id)}
                        className={`flex items-center justify-between px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                          singleTask.props.priority === p.id
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        <span className="font-mono">{p.label}</span>
                        <span className="text-[10px] opacity-70">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Task Status Toggle */}
              <button
                type="button"
                title={`Status: ${singleTask.props.status} (click to cycle)`}
                onClick={() => {
                  const nextStatus =
                    singleTask.props.status === "open"
                      ? "doing"
                      : singleTask.props.status === "doing"
                      ? "done"
                      : "open";
                  handleTaskStatus(nextStatus);
                }}
                className="capitalize px-1.5 py-0.5 rounded text-[10px] font-medium border bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                {singleTask.props.status}
              </button>

              {/* Copilot Action */}
              <button
                type="button"
                title="Focus in Copilot (⌘J)"
                onClick={handleOpenCopilot}
                className="p-1 rounded-md hover:bg-violet-50 dark:hover:bg-violet-950/40 text-violet-600 dark:text-violet-400 transition-colors"
              >
                <Sparkles className="size-3.5" />
              </button>
            </>
          )}

          {/* Opacity Slider Popover */}
          {hasOpacity && (
            <div className="relative">
              <button
                type="button"
                title={`Opacity: ${Math.round(currentOpacityVal * 100)}%`}
                onClick={() => setActiveMenu(activeMenu === "opacity" ? null : "opacity")}
                className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <SlidersHorizontal className="size-3.5" />
              </button>

              {/* Opacity Popover */}
              {activeMenu === "opacity" && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl w-44 z-50 animate-in fade-in zoom-in-95 duration-75 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                    <span>OPACITY</span>
                    <span>{Math.round(currentOpacityVal * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={currentOpacityVal}
                    onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                    className="w-full accent-zinc-900 dark:accent-white h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
                  />
                  <div className="grid grid-cols-4 gap-1 pt-1">
                    {[0.25, 0.5, 0.75, 1].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleOpacityChange(pct)}
                        className={`text-[10px] font-mono py-0.5 rounded border transition-colors ${
                          Math.abs(currentOpacityVal - pct) < 0.05
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-bold border-transparent"
                            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {pct * 100}%
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

          {/* Duplicate */}
          <button
            type="button"
            title="Duplicate (⌘D)"
            onClick={handleDuplicate}
            className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <Copy className="size-3.5" />
          </button>

          {/* Delete */}
          <button
            type="button"
            title="Delete (⌫)"
            onClick={handleDelete}
            className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="size-3.5" />
          </button>

            <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />
          </div>
        </div>

        {/* Chevron Button */}
        <button
          type="button"
          onClick={handleToggleExpand}
          title={isExpanded ? "Collapse format bar" : "Expand format bar (or hover)"}
          className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex items-center justify-center shrink-0"
        >
          <ChevronDown
            className={`size-3 transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isExpanded
                ? "rotate-180 text-zinc-600 dark:text-zinc-300"
                : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-200"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

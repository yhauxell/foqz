import React, { memo, useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeToolbar,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { Ban, Link2, Package, Trash2, Zap } from "lucide-react";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export type SemanticRelation = "depends" | "blocks" | "aggregates";

export interface SemanticEdgeData {
  relation?: SemanticRelation;
  label?: string;
  animated?: boolean;
  [key: string]: unknown;
}

export type SemanticEdgeType = Edge<SemanticEdgeData, "semantic">;

const RELATION_CONFIG: Record<
  SemanticRelation,
  {
    label: string;
    stroke: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    dashArray?: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  depends: {
    label: "depends on",
    stroke: "#3b82f6",
    badgeBg: "bg-blue-50/90 dark:bg-blue-950/90",
    badgeText: "text-blue-700 dark:text-blue-300",
    badgeBorder: "border-blue-200 dark:border-blue-800",
    icon: Link2,
  },
  blocks: {
    label: "blocks",
    stroke: "#ef4444",
    badgeBg: "bg-rose-50/90 dark:bg-rose-950/90",
    badgeText: "text-rose-700 dark:text-rose-300",
    badgeBorder: "border-rose-200 dark:border-rose-800",
    dashArray: "6 3",
    icon: Ban,
  },
  aggregates: {
    label: "relates to",
    stroke: "#10b981",
    badgeBg: "bg-emerald-50/90 dark:bg-emerald-950/90",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    badgeBorder: "border-emerald-200 dark:border-emerald-800",
    dashArray: "3 3",
    icon: Package,
  },
};

export const SemanticEdge = memo(function SemanticEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: EdgeProps<SemanticEdgeType>) {
  const { deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const isAnimated = Boolean(data?.animated);
  const relation: SemanticRelation = data?.relation || "depends";
  const config = RELATION_CONFIG[relation] || RELATION_CONFIG.depends;
  const IconComponent = config.icon;

  let strokeColor: string;
  let strokeDasharray = "none";
  let strokeLinecap: "round" | "butt" = "butt";
  let isSolid = false;

  if (relation === "depends") {
    strokeColor = selected ? "#2563eb" : "#3b82f6";
    isSolid = true;
  } else if (relation === "blocks") {
    strokeColor = selected ? "#dc2626" : "#ef4444";
    strokeDasharray = "6 3";
  } else {
    // aggregates
    strokeColor = selected ? "#059669" : "#10b981";
    strokeDasharray = "2 4";
    strokeLinecap = "round";
  }

  let animationStyle: string | undefined = undefined;
  if (isAnimated) {
    if (isSolid) {
      animationStyle = "pulse-edge-solid 1.6s ease-in-out infinite";
    } else {
      animationStyle = "dash-edge-flow 1s linear infinite";
    }
  }

  const updateEdgeData = useFlowCanvasStore((s) => s.updateEdgeData);
  const deleteEdge = useFlowCanvasStore((s) => s.deleteEdge);

  // Auto-dismiss context menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!menuOpen) return;

    const handleOutsideClick = (e: MouseEvent | PointerEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const handleSelectRelation = (newRel: SemanticRelation, e: React.MouseEvent) => {
    e.stopPropagation();
    updateEdgeData(id, { relation: newRel });
  };

  const handleToggleAnimated = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateEdgeData(id, { animated: !isAnimated });
  };

  const handleDelete = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    deleteEdge(id);
    deleteElements({ edges: [{ id }] }).catch(() => {});
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray,
          strokeLinecap,
          animation: animationStyle ?? "none",
          transition: "stroke 150ms ease, stroke-width 150ms ease",
        }}
      />

      {/* Contextual Floating Toolbar directly above the selected arrow */}
      {selected && !menuOpen && (
        <EdgeToolbar
          edgeId={id}
          x={labelX}
          y={labelY}
          isVisible={true}
          alignX="center"
          alignY="bottom"
        >
          <div
            className="mb-5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full glass-panel shadow-2xl select-none pointer-events-auto border border-white/60 dark:border-zinc-800/80 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap nodrag nopan"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated Toggle (Icon Only) */}
            <button
              type="button"
              title={
                isAnimated
                  ? "Disable animation"
                  : isSolid
                  ? "Enable pulse animation"
                  : "Enable moving flow animation"
              }
              onClick={handleToggleAnimated}
              className={`size-5 rounded flex items-center justify-center transition-all cursor-pointer ${
                isAnimated
                  ? "bg-indigo-600 text-white shadow-2xs font-semibold ring-1 ring-indigo-400/40"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <Zap className={`size-3.5 ${isAnimated ? "fill-white" : ""}`} />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700" />

            {/* Delete button */}
            <button
              type="button"
              title="Delete arrow (Del/Backspace)"
              onClick={handleDelete}
              className="size-5 rounded-full flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-950/80 text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </EdgeToolbar>
      )}

      <EdgeLabelRenderer>
        <div
          ref={menuContainerRef}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
            zIndex: menuOpen ? 10000 : selected ? 1002 : 1000,
          }}
          className="nodrag nopan"
        >
          {/* Main Clickable Relation Pill */}
          <div
            className="relative group"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Select edge so that Del/Backspace shortcut and selection ring work
                useFlowCanvasStore.getState().setEdges((eds) =>
                  eds.map((edge) => ({ ...edge, selected: edge.id === id }))
                );
                useFlowCanvasStore.getState().setNodes((nds) =>
                  nds.map((node) => (node.selected ? { ...node, selected: false } : node))
                );
                useFlowCanvasStore.getState().setSelectedNodeId(null);
                setMenuOpen((v) => !v);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shadow-xs border transition-all cursor-pointer backdrop-blur-xs select-none ${
                config.badgeBg
              } ${config.badgeText} ${config.badgeBorder} ${
                selected ? "ring-2 ring-blue-500/80" : "hover:scale-105"
              }`}
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
              title="Click to change relationship, style, animation, or disconnect"
            >
              <svg className="size-2.5 opacity-50" viewBox="0 0 10 10" fill="none">
                <path d="M1 5h8M6 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <IconComponent className="size-3 shrink-0" />
              <span>{config.label}</span>
              {isAnimated && (
                <Zap className="size-2.5 text-indigo-500 fill-indigo-500 ml-0.5" />
              )}
            </button>

            {/* Quick Relation & Customization Popover */}
            {menuOpen && (
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 flex flex-col gap-1 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xl backdrop-blur-md min-w-[160px] ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <div className="text-[10px] uppercase font-mono px-1 py-0.5 text-zinc-400 font-semibold tracking-wider">
                  Relation Type
                </div>

                <button
                  type="button"
                  onClick={(e) => handleSelectRelation("depends", e)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    relation === "depends"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <svg className="size-2.5 opacity-50 shrink-0" viewBox="0 0 10 10" fill="none">
                    <path d="M1 5h8M6 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <Link2 className="size-3 text-blue-500 shrink-0" />
                  <span>Depends on</span>
                  <svg className="ml-auto size-8 h-2.5" viewBox="0 0 32 10" fill="none">
                    <line x1="0" y1="5" x2="32" y2="5" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleSelectRelation("blocks", e)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    relation === "blocks"
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-semibold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <svg className="size-2.5 opacity-50 shrink-0" viewBox="0 0 10 10" fill="none">
                    <path d="M1 5h8M6 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <Ban className="size-3 text-rose-500 shrink-0" />
                  <span>Blocks</span>
                  <svg className="ml-auto size-8 h-2.5" viewBox="0 0 32 10" fill="none">
                    <line x1="0" y1="5" x2="32" y2="5" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleSelectRelation("aggregates", e)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    relation === "aggregates"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <svg className="size-2.5 opacity-50 shrink-0" viewBox="0 0 10 10" fill="none">
                    <path d="M1 5h8M6 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <Package className="size-3 text-emerald-500 shrink-0" />
                  <span>Relates to</span>
                  <svg className="ml-auto size-8 h-2.5" viewBox="0 0 32 10" fill="none">
                    <line x1="0" y1="5" x2="32" y2="5" stroke="#10b981" strokeWidth="2" strokeDasharray="1 3" strokeLinecap="round" />
                  </svg>
                </button>

                <div className="h-[1px] bg-zinc-200 dark:bg-zinc-800 my-0.5" />

                {/* Animated Toggle */}
                <button
                  type="button"
                  onClick={handleToggleAnimated}
                  className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer mt-0.5 ${
                    isAnimated
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                  title={
                    isSolid
                      ? "Pulsing animation: smoothly fades to half opacity/color in and out"
                      : "Flowing animation: dashes flow continuously along the line"
                  }
                >
                  <span className="flex items-center gap-1.5">
                    <Zap className={`size-3 text-indigo-500 ${isAnimated ? "fill-indigo-500" : ""}`} />
                    <span>Animated Flow</span>
                  </span>
                  <span className="text-[10px] uppercase font-mono tracking-wide px-1 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 rounded">
                    {isAnimated ? (isSolid ? "Pulse" : "Flow") : "Off"}
                  </span>
                </button>

                <div className="h-[1px] bg-zinc-200 dark:bg-zinc-800 my-0.5" />

                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                >
                  <Trash2 className="size-3" />
                  <span>Disconnect</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

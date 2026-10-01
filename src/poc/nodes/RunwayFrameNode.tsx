import React, { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { NodeResizer, Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { PlaneTakeoff, Zap, GitBranch, Flame, Sparkles, CheckCircle2, Target, Play, Pause } from "lucide-react";
import {
  ACCENT_STYLES,
  type ProjectAccent,
  type RunwayFrameNodeData,
  RUNWAY_TEMPLATES,
} from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { extractChecklistStats } from "@/lib/markdown";

export type RunwayFrameNodeType = Node<RunwayFrameNodeData, "runwayFrame">;

const ACCENT_GLASS_BG: Record<ProjectAccent, string> = {
  blue: "bg-blue-50/20 dark:bg-blue-950/25",
  emerald: "bg-emerald-50/20 dark:bg-emerald-950/25",
  amber: "bg-amber-50/20 dark:bg-amber-950/25",
  rose: "bg-rose-50/20 dark:bg-rose-950/25",
  indigo: "bg-indigo-50/20 dark:bg-indigo-950/25",
  cyan: "bg-cyan-50/20 dark:bg-cyan-950/25",
  orange: "bg-orange-50/20 dark:bg-orange-950/25",
  zinc: "bg-zinc-50/20 dark:bg-zinc-900/25",
};

export const RunwayFrameNode = memo(function RunwayFrameNode({
  id,
  data,
  selected,
  width = 680,
  height = 420,
}: NodeProps<RunwayFrameNodeType>) {
  const currentAccent: ProjectAccent = data.accent || "rose";
  const accent = ACCENT_STYLES[currentAccent] || ACCENT_STYLES.rose;
  const glassBg = ACCENT_GLASS_BG[currentAccent] || ACCENT_GLASS_BG.rose;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(data.title || "🛫 Today's Runway");
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalVal, setGoalVal] = useState(data.dailyGoal || "");

  const w = Math.max(360, width);
  const h = Math.max(220, height);

  // Compute stats of tasks inside this runway using primitive number selectors
  const taskCount = useFlowCanvasStore(
    useCallback(
      (s) => s.nodes.filter((n) => n.parentId === id && n.type === "focusTask").length,
      [id]
    )
  );

  const doneCount = useFlowCanvasStore(
    useCallback(
      (s) =>
        s.nodes.filter(
          (n) => n.parentId === id && n.type === "focusTask" && (n.data as any)?.status === "done"
        ).length,
      [id]
    )
  );

  const totalSlots = data.capacitySlots || 3;
  const progressPercent = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;

  const templateConfig = data.templateId ? RUNWAY_TEMPLATES[data.templateId] : null;

  const activeFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId);
  const allNodes = useFlowCanvasStore((s) => s.nodes);

  const runwayTasks = useMemo(
    () =>
      allNodes
        .filter((n) => n.parentId === id && n.type === "focusTask")
        .sort((a, b) => a.position.y - b.position.y),
    [allNodes, id]
  );

  const activeFlight = useMemo(() => {
    return (
      runwayTasks.find((t) => t.id === activeFocusNodeId) ||
      runwayTasks.find((t) => (t.data as any)?.status === "doing") ||
      runwayTasks.find((t) => (t.data as any)?.status !== "done") ||
      null
    );
  }, [runwayTasks, activeFocusNodeId]);

  const activeFlightSlot = useMemo(() => {
    if (!activeFlight) return 1;
    const idx = runwayTasks.findIndex((t) => t.id === activeFlight.id);
    return idx !== -1 ? idx + 1 : 1;
  }, [runwayTasks, activeFlight]);

  const isFlightFocused = Boolean(activeFlight && activeFocusNodeId === activeFlight.id);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const fragment = document.createDocumentFragment();

    const rc = rough.svg(svg);
    const borderStyle = data.borderStyle || "solid";
    let dashArray: number[] | undefined;
    if (borderStyle === "dashed") dashArray = [8, 5];
    else if (borderStyle === "dotted") dashArray = [2, 4];

    const nodeSeed =
      Math.abs(
        id.split("").reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)
      ) || 7;

    // 1. Runway Outer Perimeter (Solid organic stroke by default)
    const outerRect = rc.rectangle(3, 3, w - 6, h - 6, {
      seed: nodeSeed,
      roughness: 1.1,
      stroke: accent.dotHex || "#f43f5e",
      strokeWidth: 1.8,
      strokeLineDash: dashArray,
      fill: "transparent",
    });
    fragment.appendChild(outerRect);

    // 2. Header separator line (placed cleanly below header text at y=66)
    const headerLine = rc.line(4, 66, w - 4, 66, {
      seed: nodeSeed + 1,
      roughness: 1.1,
      stroke: accent.dotHex || "#f43f5e",
      strokeWidth: 1.2,
    });
    fragment.appendChild(headerLine);

    svg.replaceChildren(fragment);
  }, [id, w, h, accent.dotHex, data.borderStyle]);

  // Template icon rendering
  const renderTemplateIcon = () => {
    const iconName = templateConfig?.iconName || "PlaneTakeoff";
    if (iconName === "Zap") return <Zap className="size-3.5 text-amber-500 shrink-0" />;
    if (iconName === "GitBranch") return <GitBranch className="size-3.5 text-indigo-500 shrink-0" />;
    if (iconName === "Flame") return <Flame className="size-3.5 text-emerald-500 shrink-0" />;
    return <PlaneTakeoff className="size-3.5 text-rose-500 shrink-0" />;
  };

  return (
    <div
      className={`relative w-full h-full select-none rounded-2xl backdrop-blur-md transition-all ${glassBg} ${
        selected ? "ring-2 ring-rose-500/80 shadow-xl" : "shadow-xs"
      }`}
      style={{ contain: "layout style" }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <NodeResizer minWidth={360} minHeight={220} isVisible={selected} />

      {/* Rough.js Sketch Border & Header Line */}
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {/* 4 Multi-Directional Handles on all sides */}
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-rose-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-rose-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-rose-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-rose-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />

      {/* Runway Header Row */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-3.5 pb-1">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="size-6 rounded-lg bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center shrink-0 border border-rose-500/30">
            {renderTemplateIcon()}
          </div>

          {isEditingTitle ? (
            <input
              type="text"
              value={titleVal}
              autoFocus
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false);
                useFlowCanvasStore.getState().updateNodeData(id, { title: titleVal });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingTitle(false);
                  useFlowCanvasStore.getState().updateNodeData(id, { title: titleVal });
                }
              }}
              className="bg-transparent border-b border-rose-500 outline-none font-bold text-base text-zinc-900 dark:text-zinc-100 flex-1 min-w-[140px]"
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              className="font-bold text-base tracking-tight truncate text-zinc-900 dark:text-zinc-100 cursor-text"
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
              title="Double-click to edit runway title"
            >
              {data.title || "🛫 Today's Runway"}
            </span>
          )}
        </div>

        {/* Right Header Status Pills */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {/* Capacity Slots Indicator */}
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-400 shadow-2xs"
            title={`${taskCount} staged / ${totalSlots} max WIP slots`}
          >
            {taskCount}/{totalSlots} Slots
          </span>

          {/* Clearance Progress Badge */}
          {taskCount > 0 && (
            <span
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border shadow-2xs ${
                doneCount === taskCount
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
            >
              {doneCount === taskCount && <CheckCircle2 className="size-2.5" />}
              <span>
                {doneCount}/{taskCount} ({progressPercent}%)
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Goal Sub-header Row */}
      <div className="relative z-10 px-6 pb-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Sparkles className="size-3 text-rose-500 shrink-0" />
          {isEditingGoal ? (
            <input
              type="text"
              value={goalVal}
              autoFocus
              onChange={(e) => setGoalVal(e.target.value)}
              onBlur={() => {
                setIsEditingGoal(false);
                useFlowCanvasStore.getState().updateNodeData(id, { dailyGoal: goalVal });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingGoal(false);
                  useFlowCanvasStore.getState().updateNodeData(id, { dailyGoal: goalVal });
                }
              }}
              placeholder="Add daily flight objective / outcome..."
              className="bg-transparent border-b border-rose-500 outline-none text-xs text-zinc-800 dark:text-zinc-200 flex-1"
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingGoal(true);
              }}
              className="truncate cursor-text"
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
              title="Double-click to edit flight objective"
            >
              {data.dailyGoal || "Double-click to set flight objective..."}
            </span>
          )}
        </div>

        {/* Active Flight Status Indicator */}
        {activeFlight && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[10px] font-mono shrink-0 select-none">
            <span className={`size-1.5 rounded-full bg-rose-500 ${isFlightFocused ? 'animate-ping' : ''}`} />
            <span className="font-semibold uppercase">Flight 0{activeFlightSlot}:</span>
            <span className="truncate max-w-[140px] font-sans font-medium text-zinc-800 dark:text-zinc-200">
              {(activeFlight.data as any)?.title || 'Untitled'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                useFlowCanvasStore.getState().setActiveFocusNodeId(activeFlight.id);
                useFlowCanvasStore.getState().setIsTimerRunning(true);
                window.dispatchEvent(
                  new CustomEvent("foqz:set-focus-target", { detail: { shapeId: activeFlight.id } })
                );
                window.dispatchEvent(
                  new CustomEvent("foqz:flow-center-on", { detail: { id: activeFlight.id } })
                );
              }}
              className="hover:underline text-rose-600 dark:text-rose-400 font-bold ml-1 cursor-pointer"
            >
              {isFlightFocused ? "In Focus" : "Focus Flight"}
            </button>
          </div>
        )}
      </div>

      {/* Watermark Slot Guidelines (Only shown when no tasks are staged) */}
      {taskCount === 0 && (
        <div className="absolute inset-x-6 top-[82px] bottom-4 pointer-events-none flex flex-col justify-start gap-2.5 opacity-30">
          {Array.from({ length: totalSlots }).map((_, idx) => (
            <div
              key={idx}
              className="h-[50px] rounded-xl border border-dashed border-zinc-400 dark:border-zinc-500 bg-black/[0.015] dark:bg-white/[0.015] flex items-center justify-between px-4 text-[10px] font-mono tracking-wider text-zinc-500 dark:text-zinc-400 select-none"
            >
              <span className="font-semibold">SLOT 0{idx + 1}</span>
              <span className="text-[9px] uppercase tracking-widest opacity-75">
                {idx === 0 ? "READY FOR TAKEOFF" : "STANDBY"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Subflow containment drop target zone */}
      <div className="w-full h-[calc(100%-80px)] pointer-events-none" />
    </div>
  );
});

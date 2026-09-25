import React, { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { Check, FileText } from "lucide-react";
import { renderMarkdownInline } from "@/lib/markdown";
import {
  focusTaskShellColorForPriority,
  type TaskPaperTheme,
} from "@/shapes/focusTask/FocusTaskShapeUtil";

export interface FocusTaskNodeData {
  title: string;
  status: "open" | "doing" | "done";
  priority: 1 | 2 | 3 | 4;
  notes?: string;
  paper?: TaskPaperTheme;
  trackedMs?: number;
  [key: string]: unknown;
}

export type FocusTaskNodeType = Node<FocusTaskNodeData, "focusTask">;

const PAPER_COLORS: Record<TaskPaperTheme, { bg: string; fill: string }> = {
  cream: { bg: "#fefcf6", fill: "rgba(254, 252, 246, 0.95)" },
  fog: { bg: "#f6f8fb", fill: "rgba(246, 248, 251, 0.95)" },
  bloom: { bg: "#fdf5f8", fill: "rgba(253, 245, 248, 0.95)" },
  sage: { bg: "#f4f9f6", fill: "rgba(244, 249, 246, 0.95)" },
};

export const FocusTaskNode = memo(function FocusTaskNode({
  data,
  selected,
}: NodeProps<FocusTaskNodeType>) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.title || "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDone = data.status === "done";
  const priorityHex = focusTaskShellColorForPriority(data.priority || 3);
  const theme = PAPER_COLORS[data.paper || "cream"] || PAPER_COLORS.cream;

  // Render Rough.js hand-drawn card container and checkbox box
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rc = rough.svg(svg);

    // 1. Organic Hand-drawn Card Background & Border
    const cardRect = rc.rectangle(3, 3, 254, 76, {
      roughness: 1.2,
      stroke: isDone ? "#94a3b8" : "#475569",
      strokeWidth: 1.5,
      fill: theme.fill,
      fillStyle: "solid",
    });
    svg.appendChild(cardRect);

    // 2. Hand-drawn Left Priority Accent Tab
    const priorityBar = rc.rectangle(4, 8, 4, 30, {
      roughness: 1.0,
      stroke: priorityHex,
      strokeWidth: 2,
      fill: priorityHex,
      fillStyle: "solid",
    });
    svg.appendChild(priorityBar);

    // 3. Hand-drawn Checkbox outline
    const checkOutline = rc.rectangle(16, 12, 16, 16, {
      roughness: 1.4,
      stroke: isDone ? "#16a34a" : "#64748b",
      strokeWidth: 1.5,
      fill: isDone ? "rgba(22, 163, 74, 0.15)" : "transparent",
    });
    svg.appendChild(checkOutline);
  }, [isDone, priorityHex, theme.fill]);

  const toggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.status = data.status === "done" ? "open" : "done";
    // Trigger re-render by touching titleDraft
    setTitleDraft((d) => d);
  };

  return (
    <div
      className={`relative w-[260px] h-[82px] select-none ${
        selected ? "ring-2 ring-blue-500/80 rounded-lg" : ""
      }`}
      style={{ contain: "layout style" }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {/* 4 Handles for Connecting Tasks to other shapes / boxes / text */}
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-zinc-400" />
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-zinc-400" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-zinc-400" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-zinc-400" />

      {/* Rough.js Organic Sketch Container */}
      <svg
        ref={svgRef}
        width={260}
        height={82}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {/* Card Content Overlay */}
      <div className="relative z-10 flex items-start gap-2.5 px-4 pt-3 h-full">
        {/* Checkbox Click Target (overlaps the hand-drawn checkbox SVG) */}
        <button
          type="button"
          onClick={toggleStatus}
          className="size-4.5 mt-0.5 flex items-center justify-center cursor-pointer shrink-0"
        >
          {isDone && (
            <Check className="size-3.5 stroke-[3] text-emerald-600 dark:text-emerald-400" />
          )}
        </button>

        {/* Task Title & Notes */}
        <div className="flex-1 min-w-0 pr-1">
          {isEditing ? (
            <input
              type="text"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                setIsEditing(false);
                data.title = titleDraft;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditing(false);
                  data.title = titleDraft;
                }
              }}
              className="w-full bg-transparent border-b border-blue-500 outline-none text-[13px] text-zinc-900 dark:text-zinc-100"
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
            />
          ) : (
            <div
              className={`text-[13px] leading-snug break-words ${
                isDone ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-100"
              }`}
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
            >
              {data.title || titleDraft ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownInline(data.title || titleDraft),
                  }}
                />
              ) : (
                <span className="text-zinc-400 italic">Double-click to write task</span>
              )}
            </div>
          )}

          {data.notes && (
            <div
              className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400"
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{data.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

import React, { memo, useEffect, useRef } from "react";
import { NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { GitBranch, Sparkles } from "lucide-react";
import {
  ACCENT_STYLES,
  type ProjectAccent,
} from "@/shapes/projectFrame/ProjectFrameShapeUtil";

export interface ProjectFrameNodeData {
  title: string;
  goal?: string;
  accent?: ProjectAccent;
  connectors?: {
    githubRepo?: string;
    notionWorkspace?: string;
    sentryProject?: string;
  };
  [key: string]: unknown;
}

export type ProjectFrameNodeType = Node<ProjectFrameNodeData, "projectFrame">;

export const ProjectFrameNode = memo(function ProjectFrameNode({
  data,
  selected,
  width = 640,
  height = 420,
}: NodeProps<ProjectFrameNodeType>) {
  const accent = ACCENT_STYLES[data.accent || "blue"] || ACCENT_STYLES.blue;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const w = Math.max(360, width);
  const h = Math.max(240, height);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rc = rough.svg(svg);

    // 1. Hand-drawn outer dashed frame container
    const outerRect = rc.rectangle(3, 3, w - 6, h - 6, {
      roughness: 1.5,
      stroke: accent.dotHex || "#3b82f6",
      strokeWidth: 2,
      strokeLineDash: [6, 4],
      fill: "rgba(255, 255, 255, 0.4)",
      fillStyle: "solid",
    });
    svg.appendChild(outerRect);

    // 2. Hand-drawn header divider line
    const headerLine = rc.line(4, 46, w - 4, 46, {
      roughness: 1.8,
      stroke: accent.dotHex || "#3b82f6",
      strokeWidth: 1.5,
    });
    svg.appendChild(headerLine);
  }, [w, h, accent.dotHex]);

  return (
    <div
      className={`relative w-full h-full select-none ${
        selected ? "ring-2 ring-blue-500/80 rounded-xl" : ""
      }`}
      style={{ contain: "layout style" }}
    >
      <NodeResizer minWidth={360} minHeight={240} isVisible={selected} />

      {/* Rough.js Sketch Background & Border */}
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {/* Frame Header Content */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-3.5 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: accent.dotHex || "#3b82f6" }}
          />
          <span
            className="font-bold text-base tracking-tight truncate text-zinc-900 dark:text-zinc-100"
            style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
          >
            {data.title || "Project Frame"}
          </span>
        </div>

        {data.connectors?.githubRepo && (
          <div
            className="flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border border-zinc-300/80 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 font-mono shadow-2xs"
            style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
          >
            <GitBranch className="size-3" />
            <span className="truncate max-w-[140px]">
              {data.connectors.githubRepo}
            </span>
          </div>
        )}
      </div>

      {/* Goal Sub-header */}
      {data.goal && (
        <div
          className="relative z-10 px-5 pt-2 text-[12px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5"
          style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
        >
          <Sparkles className="size-3 text-amber-500 shrink-0" />
          <span className="truncate">{data.goal}</span>
        </div>
      )}

      {/* Subflow containment drop target zone */}
      <div className="w-full h-[calc(100%-60px)] pointer-events-none" />
    </div>
  );
});

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

export const ProjectFrameNode = memo(function ProjectFrameNode({
  data,
  selected,
  width = 640,
  height = 420,
}: NodeProps<ProjectFrameNodeType>) {
  const currentAccent: ProjectAccent = data.accent || "blue";
  const accent = ACCENT_STYLES[currentAccent] || ACCENT_STYLES.blue;
  const glassBg = ACCENT_GLASS_BG[currentAccent] || ACCENT_GLASS_BG.blue;
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
      fill: "transparent",
    });
    svg.appendChild(outerRect);

    // 2. Hand-drawn header divider line
    const headerLine = rc.line(4, 48, w - 4, 48, {
      roughness: 1.8,
      stroke: accent.dotHex || "#3b82f6",
      strokeWidth: 1.5,
    });
    svg.appendChild(headerLine);
  }, [w, h, accent.dotHex]);

  return (
    <div
      className={`relative w-full h-full select-none rounded-2xl backdrop-blur-md transition-all ${glassBg} ${
        selected ? "ring-2 ring-blue-500/80 shadow-lg" : "shadow-xs"
      }`}
      style={{ contain: "layout style" }}
    >
      <NodeResizer minWidth={360} minHeight={240} isVisible={selected} />

      {/* Rough.js Sketch Border & Header Line */}
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
            className="size-3 rounded-full shadow-2xs"
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
            className="flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border border-zinc-300/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/70 text-zinc-700 dark:text-zinc-300 font-mono shadow-2xs backdrop-blur-xs"
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
          className="relative z-10 px-5 pt-2.5 text-[12px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5"
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

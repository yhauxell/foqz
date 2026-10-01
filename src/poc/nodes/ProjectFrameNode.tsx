import React, { memo, useEffect, useRef, useState } from "react";
import { NodeResizer, Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { GitBranch, GitPullRequest, Sparkles } from "lucide-react";
import {
  ACCENT_STYLES,
  type ProjectAccent,
} from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export interface ProjectFrameNodeData {
  title: string;
  goal?: string;
  accent?: ProjectAccent;
  borderStyle?: "solid" | "dashed" | "dotted";
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
  id,
  data,
  selected,
  width = 640,
  height = 420,
}: NodeProps<ProjectFrameNodeType>) {
  const currentAccent: ProjectAccent = data.accent || "blue";
  const accent = ACCENT_STYLES[currentAccent] || ACCENT_STYLES.blue;
  const glassBg = ACCENT_GLASS_BG[currentAccent] || ACCENT_GLASS_BG.blue;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(data.title || "Project Frame");
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalVal, setGoalVal] = useState(data.goal || "");

  const w = Math.max(360, width);
  const h = Math.max(240, height);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const fragment = document.createDocumentFragment();

    const rc = rough.svg(svg);
    const borderStyle = data.borderStyle || "solid";
    let dashArray: number[] | undefined;
    if (borderStyle === "dashed") dashArray = [6, 4];
    else if (borderStyle === "dotted") dashArray = [2, 4];

    const nodeSeed =
      Math.abs(
        id.split("").reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)
      ) || 1;

    // 1. Hand-drawn outer frame container (solid border by default)
    const outerRect = rc.rectangle(3, 3, w - 6, h - 6, {
      seed: nodeSeed,
      roughness: 1.2,
      stroke: accent.dotHex || "#3b82f6",
      strokeWidth: 1.8,
      strokeLineDash: dashArray,
      fill: "transparent",
    });
    fragment.appendChild(outerRect);

    // 2. Hand-drawn header divider line (cleanly below header content at y=66)
    const headerLine = rc.line(4, 66, w - 4, 66, {
      seed: nodeSeed + 1,
      roughness: 1.2,
      stroke: accent.dotHex || "#3b82f6",
      strokeWidth: 1.2,
    });
    fragment.appendChild(headerLine);
    svg.replaceChildren(fragment);
  }, [id, w, h, accent.dotHex, data.borderStyle]);

  return (
    <div
      className={`relative w-full h-full select-none rounded-2xl backdrop-blur-md transition-all ${glassBg} ${
        selected ? "ring-2 ring-blue-500/80 shadow-lg" : "shadow-xs"
      }`}
      style={{ contain: "layout style" }}
      onDoubleClick={(e) => {
        // Prevent background double-click from creating orphaned text inside the frame
        e.stopPropagation();
      }}
    >
      <NodeResizer minWidth={360} minHeight={240} isVisible={selected} />

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
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-125 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />

      {/* Frame Header Content */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-3.5 pb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="size-3 rounded-full shadow-2xs shrink-0"
            style={{ backgroundColor: accent.dotHex || "#3b82f6" }}
          />
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
              className="bg-transparent border-b border-blue-500 outline-none font-bold text-base text-zinc-900 dark:text-zinc-100 flex-1 min-w-[120px]"
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
              title="Double-click to edit project title"
            >
              {data.title || "Project Frame"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("foqz:open-project-connectors", {
                detail: { shapeId: id },
              })
            );
          }}
          className={`flex items-center justify-center transition-all cursor-pointer shadow-2xs ml-2 shrink-0 ${
            data.connectors?.githubRepo
              ? "px-2 py-0.5 rounded-full gap-1 border border-zinc-300/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/70 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]"
              : "size-6 rounded-full border border-zinc-300/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
          style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
          title={
            data.connectors?.githubRepo
              ? `Connected repo: ${data.connectors.githubRepo}`
              : "Configure project connectors & AI context"
          }
        >
          <GitBranch className="size-3 shrink-0" />
          {data.connectors?.githubRepo && (
            <span className="truncate max-w-[120px]">{data.connectors.githubRepo}</span>
          )}
        </button>

        {data.connectors?.githubRepo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("foqz:open-github-issues", {
                  detail: { projectId: id, githubRepo: data.connectors?.githubRepo },
                })
              );
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-mono text-[10px] transition-colors cursor-pointer shadow-2xs ml-1.5 shrink-0"
            title="Browse and import GitHub issues into this project"
          >
            <GitPullRequest className="size-3 shrink-0 text-purple-500" />
            <span>Issues</span>
          </button>
        )}
      </div>

      {/* Goal Sub-header */}
      <div className="relative z-10 px-5 pt-0.5 pb-2.5 text-[12px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
        <Sparkles className="size-3 text-amber-500 shrink-0" />
        {isEditingGoal ? (
          <input
            type="text"
            value={goalVal}
            autoFocus
            onChange={(e) => setGoalVal(e.target.value)}
            onBlur={() => {
              setIsEditingGoal(false);
              useFlowCanvasStore.getState().updateNodeData(id, { goal: goalVal });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setIsEditingGoal(false);
                useFlowCanvasStore.getState().updateNodeData(id, { goal: goalVal });
              }
            }}
            placeholder="Add a milestone goal..."
            className="bg-transparent border-b border-amber-500 outline-none text-xs text-zinc-800 dark:text-zinc-200 flex-1"
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
            title="Double-click to edit goal"
          >
            {data.goal || "Double-click to set milestone goal..."}
          </span>
        )}
      </div>

      {/* Subflow containment drop target zone */}
      <div className="w-full h-[calc(100%-60px)] pointer-events-none" />
    </div>
  );
});

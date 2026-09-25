import React, { memo } from "react";
import { NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { Folder, GitBranch, Sparkles } from "lucide-react";
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
}: NodeProps<ProjectFrameNodeType>) {
  const accent = ACCENT_STYLES[data.accent || "blue"] || ACCENT_STYLES.blue;

  return (
    <div
      className={`relative w-full h-full min-w-[360px] min-h-[240px] rounded-2xl border-2 transition-all ${
        accent.headerBorder
      } bg-white/40 dark:bg-zinc-950/40 backdrop-blur-xs ${
        selected ? "ring-2 ring-blue-500/80 shadow-lg" : "shadow-sm"
      }`}
      style={{ contain: "layout style" }}
    >
      <NodeResizer minWidth={360} minHeight={240} isVisible={selected} />

      {/* Header Bar */}
      <div
        className={`flex items-center justify-between px-3.5 py-2.5 rounded-t-[14px] border-b ${accent.headerBg} ${accent.headerBorder}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="size-4 text-blue-500 shrink-0" />
          <span className="font-semibold text-xs tracking-tight truncate text-zinc-900 dark:text-zinc-100">
            {data.title || "Project Frame"}
          </span>
        </div>

        {data.connectors?.githubRepo && (
          <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 font-mono">
            <GitBranch className="size-3" />
            <span className="truncate max-w-[120px]">
              {data.connectors.githubRepo}
            </span>
          </div>
        )}
      </div>

      {/* Goal Sub-header */}
      {data.goal && (
        <div className="px-3.5 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Sparkles className="size-3 text-amber-500 shrink-0" />
          <span className="truncate">{data.goal}</span>
        </div>
      )}

      {/* Container area for nested subflow nodes */}
      <div className="w-full h-[calc(100%-60px)] pointer-events-none" />
    </div>
  );
});

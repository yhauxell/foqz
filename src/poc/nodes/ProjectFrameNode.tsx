import React, { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { NodeResizer, Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import {
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Sparkles,
  PlaneTakeoff,
  ExternalLink,
  Undo2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import {
  ACCENT_STYLES,
  type ProjectAccent,
} from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export interface ProjectFrameNodeData {
  title: string;
  goal?: string;
  description?: string;
  accent?: ProjectAccent;
  borderStyle?: "solid" | "dashed" | "dotted";
  connectors?: {
    githubRepo?: string;
    githubToken?: string;
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
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);

  const allNodes = useFlowCanvasStore((s) => s.nodes);

  const stagedRunwayTasks = useMemo(() => {
    return allNodes
      .filter((n) => {
        if (n.type !== "focusTask") return false;
        const d = n.data as any;
        return d?.originProjectId === id && n.parentId !== id;
      })
      .map((n) => {
        const parentRunway = allNodes.find((r) => r.id === n.parentId);
        const runwayTitle = (parentRunway?.data as any)?.title || "Runway";
        return {
          task: n,
          runwayId: n.parentId,
          runwayTitle,
        };
      });
  }, [allNodes, id]);

  const handleJumpToTask = useCallback((e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    useFlowCanvasStore.getState().setSelectedNodeId(taskId);
    window.dispatchEvent(
      new CustomEvent("foqz:flow-center-on", { detail: { id: taskId, fullSpace: true } })
    );
  }, []);

  const handleReturnTask = useCallback((e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    useFlowCanvasStore.getState().returnTaskToProject(taskId);
  }, []);

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

        {stagedRunwayTasks.length > 0 && isRibbonCollapsed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsRibbonCollapsed(false);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-mono text-[10px] transition-colors cursor-pointer shadow-2xs ml-2 shrink-0"
            title="Expand runway tasks ribbon"
          >
            <PlaneTakeoff className="size-3 text-rose-500" />
            <span>{stagedRunwayTasks.length} in flight</span>
            <ChevronRight className="size-2.5" />
          </button>
        )}

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

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("foqz:open-inline-chat", {
                detail: { nodeId: id },
              })
            );
          }}
          className="size-6 rounded-full border border-zinc-300/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center transition-all cursor-pointer shadow-2xs ml-1.5 shrink-0"
          title="Chat with this project/group via AI Copilot (Scope: Group)"
          aria-label="Chat with project or group"
        >
          <MessageSquare className="size-3 shrink-0" />
        </button>
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

      {/* Mini-Card Flight Ribbon */}
      {stagedRunwayTasks.length > 0 && !isRibbonCollapsed && (
        <div className="relative z-10 px-5 pb-2">
          <div className="flex flex-col gap-1.5 w-full bg-rose-500/5 dark:bg-rose-950/25 border border-rose-500/20 dark:border-rose-900/40 rounded-xl p-2 backdrop-blur-xs transition-all shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                <PlaneTakeoff className="size-3 text-rose-500 shrink-0" />
                <span>In Flight / Runway ({stagedRunwayTasks.length})</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRibbonCollapsed(true);
                }}
                className="p-0.5 rounded hover:bg-rose-200/50 dark:hover:bg-rose-900/50 text-rose-500 transition-colors cursor-pointer"
                title="Collapse flight ribbon"
              >
                <ChevronDown className="size-3" />
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              {stagedRunwayTasks.map(({ task, runwayTitle }) => {
                const taskData = task.data as any;
                const status = taskData?.status || "open";
                const isDone = status === "done";
                const isDoing = status === "doing";

                return (
                  <div
                    key={task.id}
                    onClick={(e) => handleJumpToTask(e, task.id)}
                    className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white/85 dark:bg-zinc-800/85 hover:bg-white dark:hover:bg-zinc-700/85 hover:border-rose-400/60 dark:hover:border-rose-500/60 transition-all shadow-2xs cursor-pointer shrink-0 max-w-[220px]"
                    title={`Staged in "${runwayTitle}". Click to fly camera to runway.`}
                  >
                    {/* Status indicator */}
                    {isDone ? (
                      <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                    ) : isDoing ? (
                      <span className="size-2 rounded-full bg-blue-500 ring-2 ring-blue-400/30 animate-pulse shrink-0" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-rose-400 shrink-0" />
                    )}

                    {/* Title */}
                    <span
                      className={`text-[11px] font-medium truncate flex-1 leading-tight ${
                        isDone
                          ? "line-through text-zinc-400 dark:text-zinc-500"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {taskData?.title || "Untitled Task"}
                    </span>

                    {/* Target Runway pill */}
                    <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-[60px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700/60 shrink-0">
                      {runwayTitle}
                    </span>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleJumpToTask(e, task.id)}
                        className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                        title="Jump to runway"
                      >
                        <ExternalLink className="size-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleReturnTask(e, task.id)}
                        className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/50 text-zinc-400 hover:text-blue-500 transition-colors cursor-pointer"
                        title="Return task back to project"
                      >
                        <Undo2 className="size-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Subflow containment drop target zone */}
      <div className="w-full h-[calc(100%-60px)] pointer-events-none" />
    </div>
  );
});

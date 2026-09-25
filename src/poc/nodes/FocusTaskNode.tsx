import React, { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
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

const PAPER_THEME_CLASSES: Record<TaskPaperTheme, string> = {
  cream: "bg-[#faf8f5] dark:bg-zinc-900 border-amber-200/60 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100",
  fog: "bg-[#f4f6f8] dark:bg-zinc-900 border-slate-200/60 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100",
  bloom: "bg-[#faf4f6] dark:bg-zinc-900 border-rose-200/60 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100",
  sage: "bg-[#f3f7f4] dark:bg-zinc-900 border-emerald-200/60 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100",
};

export const FocusTaskNode = memo(function FocusTaskNode({
  data,
  selected,
}: NodeProps<FocusTaskNodeType>) {
  const paperClass =
    PAPER_THEME_CLASSES[data.paper || "cream"] || PAPER_THEME_CLASSES.cream;
  const isDone = data.status === "done";
  const priorityHex = focusTaskShellColorForPriority(data.priority || 3);

  return (
    <div
      className={`relative min-w-[240px] max-w-[320px] rounded-xl border p-3 shadow-sm transition-all select-none ${paperClass} ${
        selected ? "ring-2 ring-blue-500/80 ring-offset-2 dark:ring-offset-zinc-950" : ""
      }`}
      style={{ contain: "layout style" }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-zinc-400" />
      
      {/* Priority Bar Indicator */}
      <div
        className="absolute top-3 left-0 w-1 h-5 rounded-r-full"
        style={{ backgroundColor: priorityHex }}
      />

      <div className="flex items-start gap-2 pl-1.5">
        {/* Status Checkbox */}
        <button
          type="button"
          className={`mt-0.5 size-4 rounded flex items-center justify-center border transition-colors cursor-pointer ${
            isDone
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "border-zinc-300 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 hover:border-zinc-400"
          }`}
        >
          {isDone && <Check className="size-3 stroke-[3]" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div
            className={`text-xs font-medium leading-snug break-words ${
              isDone ? "line-through text-zinc-400 dark:text-zinc-500" : ""
            }`}
          >
            {data.title ? (
              <span
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownInline(data.title),
                }}
              />
            ) : (
              <span className="text-zinc-400 italic">Untitled Task</span>
            )}
          </div>

          {data.notes && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{data.notes}</span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-400" />
    </div>
  );
});

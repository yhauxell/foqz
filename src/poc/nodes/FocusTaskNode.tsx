import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NodeResizer, Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { Check, FileText, Plus, Play, Pause, Target } from "lucide-react";
import {
  renderMarkdownInline,
  renderMarkdownBlock,
  toggleCheckboxInMarkdown,
} from "@/lib/markdown";
import {
  focusTaskShellColorForPriority,
  type TaskPaperTheme,
} from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useFocusAppSettingsOptional } from "@/context/FocusAppSettingsContext";

export interface FocusTaskNodeData {
  title: string;
  status: "open" | "doing" | "done";
  priority: 1 | 2 | 3 | 4;
  notes?: string;
  paper?: TaskPaperTheme;
  trackedMs?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  [key: string]: unknown;
}

export type FocusTaskNodeType = Node<FocusTaskNodeData, "focusTask">;

const PAPER_COLORS_LIGHT: Record<
  TaskPaperTheme,
  { bg: string; fill: string; stroke: string; doneStroke: string }
> = {
  cream: { bg: "#fefcf6", fill: "rgba(254, 252, 246, 0.96)", stroke: "#475569", doneStroke: "#94a3b8" },
  fog: { bg: "#f6f8fb", fill: "rgba(246, 248, 251, 0.96)", stroke: "#475569", doneStroke: "#94a3b8" },
  bloom: { bg: "#fdf5f8", fill: "rgba(253, 245, 248, 0.96)", stroke: "#475569", doneStroke: "#94a3b8" },
  sage: { bg: "#f4f9f6", fill: "rgba(244, 249, 246, 0.96)", stroke: "#475569", doneStroke: "#94a3b8" },
};

const PAPER_COLORS_DARK: Record<
  TaskPaperTheme,
  { bg: string; fill: string; stroke: string; doneStroke: string }
> = {
  cream: { bg: "#18181b", fill: "rgba(24, 24, 27, 0.96)", stroke: "#52525b", doneStroke: "#3f3f46" },
  fog: { bg: "#161922", fill: "rgba(22, 25, 34, 0.96)", stroke: "#475569", doneStroke: "#334155" },
  bloom: { bg: "#22171d", fill: "rgba(34, 23, 29, 0.96)", stroke: "#5c3d4d", doneStroke: "#3f2b35" },
  sage: { bg: "#152019", fill: "rgba(21, 32, 25, 0.96)", stroke: "#3d5c48", doneStroke: "#283b2f" },
};

export const FocusTaskNode = memo(function FocusTaskNode({
  id,
  data,
  selected,
  width = 280,
  height = 90,
}: NodeProps<FocusTaskNodeType>) {
  const settingsCtx = useFocusAppSettingsOptional();
  const themeSetting = settingsCtx?.settings?.colorScheme || "system";
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    const updateDark = () => {
      const dark =
        themeSetting === "dark" ||
        (themeSetting === "system" &&
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches) ||
        (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
      setIsDark(dark);
    };
    updateDark();

    const observer = new MutationObserver(() => updateDark());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [themeSetting]);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.title || "");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(data.notes || "");

  const svgRef = useRef<SVGSVGElement | null>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isDone = data.status === "done";
  const priorityHex = focusTaskShellColorForPriority(data.priority || 3);
  const activeTheme = isDark
    ? PAPER_COLORS_DARK[data.paper || "cream"] || PAPER_COLORS_DARK.cream
    : PAPER_COLORS_LIGHT[data.paper || "cream"] || PAPER_COLORS_LIGHT.cream;

  const w = Math.max(200, width);
  const h = Math.max(76, height);

  const activeFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId);
  const isTimerRunning = useFlowCanvasStore((s) => s.isTimerRunning);
  const timerSecondsRemaining = useFlowCanvasStore((s) => s.timerSecondsRemaining);
  const setActiveFocusNodeId = useFlowCanvasStore((s) => s.setActiveFocusNodeId);
  const setIsTimerRunning = useFlowCanvasStore((s) => s.setIsTimerRunning);
  const setTimerSecondsRemaining = useFlowCanvasStore((s) => s.setTimerSecondsRemaining);

  const isFocusTarget = id === activeFocusNodeId;
  const isDoing = data.status === "doing";

  // Clock countdown tick when this node is the active focus target
  useEffect(() => {
    if (!isFocusTarget || !isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isFocusTarget, isTimerRunning, setTimerSecondsRemaining, setIsTimerRunning]);

  const formattedTimer = useMemo(() => {
    const mins = Math.floor(timerSecondsRemaining / 60);
    const secs = timerSecondsRemaining % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }, [timerSecondsRemaining]);

  const toggleTimer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTimerRunning((prev) => !prev);
  };

  const handleStartFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveFocusNodeId(id);
    useFlowCanvasStore.getState().updateNodeData(id, { status: "doing" });
    window.dispatchEvent(
      new CustomEvent("foqz:set-focus-target", { detail: { shapeId: id } })
    );
  };

  // Auto-resize title textarea to content
  useEffect(() => {
    if (isEditingTitle && titleTextareaRef.current) {
      const el = titleTextareaRef.current;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [isEditingTitle]);

  // Auto-resize notes textarea to content
  useEffect(() => {
    if (isEditingNotes && notesTextareaRef.current) {
      const el = notesTextareaRef.current;
      el.style.height = "auto";
      el.style.height = `${Math.max(48, el.scrollHeight)}px`;
      el.focus();
    }
  }, [isEditingNotes]);

  // Sync state if props change from outside
  useEffect(() => {
    setTitleDraft(data.title || "");
  }, [data.title]);

  useEffect(() => {
    setNotesDraft(data.notes || "");
  }, [data.notes]);

  // Render Rough.js hand-drawn card container and checkbox box
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rc = rough.svg(svg);
    const borderStyle = data.borderStyle || "solid";
    let dashArray: number[] | undefined;
    if (borderStyle === "dashed") dashArray = [6, 4];
    else if (borderStyle === "dotted") dashArray = [2, 4];

    const nodeSeed =
      Math.abs(
        id.split("").reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)
      ) || 1;

    // 1. Organic Hand-drawn Card Background & Border
    const cardRect = rc.rectangle(3, 3, w - 6, h - 6, {
      seed: nodeSeed,
      roughness: 1.2,
      stroke: isDone ? activeTheme.doneStroke : activeTheme.stroke,
      strokeWidth: 1.5,
      strokeLineDash: dashArray,
      fill: activeTheme.fill,
      fillStyle: "solid",
    });
    svg.appendChild(cardRect);

    // 2. Hand-drawn Left Priority Accent Tab
    const barHeight = Math.min(32, Math.max(20, h - 24));
    const priorityBar = rc.rectangle(4, 8, 4, barHeight, {
      seed: nodeSeed + 1,
      roughness: 1.0,
      stroke: priorityHex,
      strokeWidth: 2,
      fill: priorityHex,
      fillStyle: "solid",
    });
    svg.appendChild(priorityBar);

    // 3. Hand-drawn Checkbox outline
    const checkOutline = rc.rectangle(16, 12, 16, 16, {
      seed: nodeSeed + 2,
      roughness: 1.4,
      stroke: isDone
        ? (isDark ? "#4ade80" : "#16a34a")
        : (isDark ? "#71717a" : "#64748b"),
      strokeWidth: 1.5,
      fill: isDone
        ? (isDark ? "rgba(74, 222, 128, 0.2)" : "rgba(22, 163, 74, 0.15)")
        : (isDark ? "rgba(255, 255, 255, 0.04)" : "transparent"),
    });
    svg.appendChild(checkOutline);
  }, [id, w, h, isDone, priorityHex, activeTheme, data.borderStyle, isDark]);

  const toggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = data.status === "done" ? "open" : "done";
    useFlowCanvasStore.getState().updateNodeData(id, { status: nextStatus });
  };

  const handleSaveTitle = useCallback(() => {
    setIsEditingTitle(false);
    useFlowCanvasStore.getState().updateNodeData(id, { title: titleDraft.trim() });
  }, [id, titleDraft]);

  const handleSaveNotes = useCallback(() => {
    setIsEditingNotes(false);
    useFlowCanvasStore.getState().updateNodeData(id, { notes: notesDraft.trim() });
  }, [id, notesDraft]);

  // Handle interactive markdown checkbox clicks inside task notes
  const handleNotesCheckboxClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === "INPUT" && target.getAttribute("type") === "checkbox") {
      e.stopPropagation();
      const idxStr = target.getAttribute("data-task-checkbox");
      if (idxStr !== null) {
        const idx = parseInt(idxStr, 10);
        if (!isNaN(idx)) {
          const updated = toggleCheckboxInMarkdown(data.notes || notesDraft, idx);
          setNotesDraft(updated);
          useFlowCanvasStore.getState().updateNodeData(id, { notes: updated });
        }
      }
    }
  };

  return (
    <div
      className={`group relative w-full h-full select-none ${
        isFocusTarget
          ? "ring-2 ring-rose-500 rounded-lg shadow-lg shadow-rose-500/10"
          : selected
          ? "ring-2 ring-blue-500/80 rounded-lg"
          : ""
      }`}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ contain: "layout style" }}
    >
      <NodeResizer minWidth={200} minHeight={76} isVisible={selected} />

      {/* 4 Multi-Directional Handles on all sides */}
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />

      {/* Rough.js Organic Sketch Container */}
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {/* Card Content Overlay */}
      <div className="relative z-10 flex items-start gap-2.5 px-4 pt-3 pb-2.5 h-full overflow-hidden">
        {/* Checkbox Click Target (overlaps the hand-drawn checkbox SVG) */}
        <button
          type="button"
          onClick={toggleStatus}
          title={isDone ? "Mark as incomplete" : "Mark as completed"}
          className="size-4.5 mt-0.5 flex items-center justify-center cursor-pointer shrink-0"
        >
          {isDone && (
            <Check className="size-3.5 stroke-[3] text-emerald-600 dark:text-emerald-400" />
          )}
        </button>

        {/* Task Title & Notes */}
        <div className="flex-1 min-w-0 pr-1 flex flex-col justify-start">
          {/* Header Row: Title & Active Timer / Focus Target Button */}
          <div className="flex items-start justify-between gap-1.5 mb-0.5">
            <div className="flex-1 min-w-0">
              {/* Natural In-Place Title Editing */}
              {isEditingTitle ? (
                <textarea
                  ref={titleTextareaRef}
                  value={titleDraft}
                  rows={1}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveTitle();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setTitleDraft(data.title || "");
                      setIsEditingTitle(false);
                    }
                  }}
                  className="w-full bg-transparent outline-none resize-none overflow-hidden p-0 m-0 border-none text-[13px] leading-snug font-medium text-zinc-900 dark:text-zinc-100 shadow-none focus:ring-0"
                  style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                />
              ) : (
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setIsEditingTitle(true);
                  }}
                  className={`text-[13px] leading-snug break-words cursor-text ${
                    isDone ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-100 font-medium"
                  }`}
                  style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                  title="Double click to edit title"
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
            </div>

            {/* Timer or Focus Button */}
            {isFocusTarget ? (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-mono font-semibold shrink-0 select-none shadow-2xs"
                title="Active Focus Timer"
              >
                <span className={`size-1.5 rounded-full bg-rose-500 ${isTimerRunning ? 'animate-ping' : ''}`} />
                <span>{formattedTimer}</span>
                <button
                  type="button"
                  onClick={toggleTimer}
                  className="hover:scale-110 active:scale-95 transition-transform cursor-pointer ml-0.5"
                  title={isTimerRunning ? "Pause timer" : "Resume timer"}
                >
                  {isTimerRunning ? <Pause className="size-2.5" /> : <Play className="size-2.5" />}
                </button>
              </div>
            ) : selected || isDoing ? (
              <button
                type="button"
                onClick={handleStartFocus}
                className="size-5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 hover:scale-110 active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer select-none"
                title="Start Focus Session (F)"
              >
                <Target className="size-3 text-rose-500" />
              </button>
            ) : null}
          </div>

          {/* Task Body / Notes (Markdown Formatted in View, Raw Markdown in Edit) */}
          {isEditingNotes ? (
            <div className="mt-2 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <textarea
                ref={notesTextareaRef}
                value={notesDraft}
                rows={2}
                placeholder="- [ ] Checklist or notes..."
                onChange={(e) => {
                  setNotesDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.max(48, e.target.scrollHeight)}px`;
                }}
                onBlur={handleSaveNotes}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleSaveNotes();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setNotesDraft(data.notes || "");
                    setIsEditingNotes(false);
                  }
                }}
                className="w-full bg-transparent outline-none resize-none overflow-hidden p-0 m-0 border-none text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200 font-mono shadow-none focus:ring-0 placeholder:text-zinc-400 placeholder:italic"
                style={{ fontFamily: "'Shantell Sans', monospace, sans-serif" }}
              />
              <div className="text-[9px] text-zinc-400 font-mono flex items-center justify-between mt-0.5 select-none">
                <span>Markdown enabled</span>
                <span>⌘↵ to save</span>
              </div>
            </div>
          ) : data.notes ? (
            <div
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingNotes(true);
              }}
              onClick={handleNotesCheckboxClick}
              className="mt-1.5 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 break-words cursor-text max-h-[140px] overflow-y-auto task-notes-content"
              style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
              title="Double click to edit notes (Markdown supported)"
              dangerouslySetInnerHTML={{
                __html: renderMarkdownBlock(data.notes),
              }}
            />
          ) : selected ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingNotes(true);
              }}
              title="Add notes or checklist"
              className="mt-1.5 size-5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="size-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});

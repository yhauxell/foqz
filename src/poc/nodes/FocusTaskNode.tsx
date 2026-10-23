import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NodeResizer, Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import {
  Check,
  Plus,
  Target,
  GitPullRequest,
  Tag,
  BookOpen,
} from "lucide-react";
import { getIssuePullRequests, type RelatedPullRequest } from "@/lib/githubSync";
import {
  GitHubAssigneePicker,
  GitHubConflictBanner,
  GitHubSyncIndicator,
} from "../components/GitHubTaskSyncControls";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  renderMarkdownInline,
  renderMarkdownBlock,
  toggleCheckboxInMarkdown,
  extractChecklistStats,
} from "@/lib/markdown";
import { type TaskPaperTheme } from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useFocusAppSettingsOptional } from "@/context/FocusAppSettingsContext";
import { startFocus } from "@/lib/nodeBehaviors";

export interface ResolvedDependencyStub {
  id: string;
  title: string;
  completedAt?: number;
}

export interface FocusTaskNodeData {
  title: string;
  status: "open" | "done";
  actionable?: boolean;
  notes?: string;
  paper?: TaskPaperTheme;
  trackedMs?: number;
  completedAt?: number;
  completedVia?: "manual" | "focus" | "agent" | "github";
  focusSecondsSpent?: number;
  resolvedDependencies?: ResolvedDependencyStub[];
  borderStyle?: "solid" | "dashed" | "dotted";
  [key: string]: unknown;
}

export type FocusTaskNodeType = Node<FocusTaskNodeData, "focusTask">;

/** Card outline accent, formerly the priority color. */
const CARD_ACCENT_HEX = "#18181b";

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
  const activeTheme = isDark
    ? PAPER_COLORS_DARK[data.paper || "cream"] || PAPER_COLORS_DARK.cream
    : PAPER_COLORS_LIGHT[data.paper || "cream"] || PAPER_COLORS_LIGHT.cream;

  const [relatedPrs, setRelatedPrs] = useState<RelatedPullRequest[]>([]);

  useEffect(() => {
    let isSubscribed = true;
    if (data.githubIssueNumber && data.githubRepo) {
      getIssuePullRequests(String(data.githubRepo), Number(data.githubIssueNumber))
        .then((prs) => {
          if (isSubscribed) setRelatedPrs(prs);
        })
        .catch(() => {});
    } else {
      setRelatedPrs([]);
    }
    return () => {
      isSubscribed = false;
    };
  }, [data.githubIssueNumber, data.githubRepo]);

  const isFocusTarget = useFlowCanvasStore((s) => s.activeFocusNodeId === id);

  const w = Math.max(200, width);
  const h = Math.max(76, height);

  const checklistStats = useMemo(
    () => extractChecklistStats(data.notes || notesDraft),
    [data.notes, notesDraft]
  );

  const handleStartFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    startFocus(id);
  };

  // Auto-expand card height when notes/checkpoints are present
  useEffect(() => {
    if (data.notes && data.notes.trim().length > 0) {
      const lines = (data.notes.match(/\n/g) || []).length + 1;
      const neededH = Math.max(160, Math.min(380, 84 + lines * 24));
      const curH = Number(height || 160);
      if (curH < neededH) {
        useFlowCanvasStore.getState().setNodes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, style: { ...n.style, height: neededH } } : n))
        );
      }
    }
  }, [id, data.notes, height]);

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

    // 1. Organic Hand-drawn Card Background & Border
    const cardRect = rc.rectangle(3, 3, w - 6, h - 6, {
      seed: nodeSeed,
      roughness: isFocusTarget ? 1.0 : 1.2,
      stroke: isFocusTarget
        ? "#f43f5e"
        : isDone
        ? activeTheme.doneStroke
        : activeTheme.stroke,
      strokeWidth: isFocusTarget ? 2.5 : 1.5,
      strokeLineDash: dashArray,
      fill: isFocusTarget
        ? (isDark ? "rgba(244, 63, 94, 0.05)" : "rgba(244, 63, 94, 0.03)")
        : activeTheme.fill,
      fillStyle: "solid",
    });
    fragment.appendChild(cardRect);

    // 2. Hand-drawn left accent tab
    const barHeight = Math.min(32, Math.max(20, h - 24));
    const accentBar = rc.rectangle(4, 8, 4, barHeight, {
      seed: nodeSeed + 1,
      roughness: 1.0,
      stroke: CARD_ACCENT_HEX,
      strokeWidth: 2,
      fill: CARD_ACCENT_HEX,
      fillStyle: "solid",
    });
    fragment.appendChild(accentBar);

    // 3. Hand-drawn Checkbox outline
    const checkOutline = rc.rectangle(15, 12, 17, 17, {
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
    fragment.appendChild(checkOutline);
    svg.replaceChildren(fragment);
  }, [id, w, h, isDone, activeTheme, data.borderStyle, isDark, isFocusTarget]);


  const toggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = data.status === "done" ? "open" : "done";
    // Linked GitHub issues are updated by the sync engine (githubTaskSync).
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
      <NodeResizer minWidth={200} minHeight={48} isVisible={selected} />

      {/* 4 Multi-Directional Handles on all sides */}
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Handle
          key={side}
          type="source"
          id={side}
          position={
            side === "top"
              ? Position.Top
              : side === "right"
              ? Position.Right
              : side === "bottom"
              ? Position.Bottom
              : Position.Left
          }
          className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
        />
      ))}

      {/* Rough.js Organic Sketch Container */}
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {/* Card content */}
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
                {data.githubIssueNumber ? (
                  <div className="flex items-center gap-1 mb-1 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        <a
                          href={(data.githubIssueUrl as string) || `https://github.com/${data.githubRepo || ''}/issues/${data.githubIssueNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0 transition-colors"
                          title={`GitHub #${data.githubIssueNumber} in ${data.githubRepo || ''}`}
                        >
                          <GitPullRequest className="size-2.5 text-purple-500" />
                          <span>#{String(data.githubIssueNumber)}</span>
                        </a>

                        <GitHubSyncIndicator nodeId={id} />

                        {data.githubRepo ? (
                          <GitHubAssigneePicker
                            nodeId={id}
                            repo={String(data.githubRepo)}
                            assignee={data.githubAssignee ? String(data.githubAssignee) : null}
                          />
                        ) : null}

                        {Array.isArray(data.githubLabels) &&
                          (data.githubLabels as string[]).slice(0, 2).map((lbl) => (
                            <span
                              key={lbl}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-medium bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0"
                            >
                              <Tag className="size-2 text-zinc-400" />
                              <span className="truncate max-w-[60px]">{lbl}</span>
                            </span>
                          ))}

                        {relatedPrs.map((pr) => (
                          <a
                            key={pr.number}
                            href={pr.html_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold border shrink-0 transition-colors ${
                              pr.state === 'merged'
                                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/25'
                                : pr.state === 'closed'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                            }`}
                            title={`PR #${pr.number}: ${pr.title} (${pr.state})`}
                          >
                            <GitPullRequest className="size-2.5" />
                            <span>PR #{pr.number}</span>
                          </a>
                        ))}

                        <div className="basis-full">
                          <GitHubConflictBanner nodeId={id} />
                        </div>
                      </div>
                  </div>
                ) : null}

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

              {/* Header Right Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Resolved Dependency Stubs (Swept into Logbook) */}
                {Array.isArray(data.resolvedDependencies) && data.resolvedDependencies.length > 0 && (
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Popover>
                      <PopoverTrigger
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center gap-1 h-5 px-1.5 rounded-md border border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 shadow-2xs transition-colors cursor-pointer shrink-0"
                        title={`${data.resolvedDependencies.length} completed dependency(ies) swept to Logbook`}
                      >
                        <BookOpen className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="text-[9px] font-mono font-bold leading-none">
                          {data.resolvedDependencies.length}
                        </span>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="end"
                        sideOffset={6}
                        className="w-80 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl p-3 select-none text-xs flex flex-col gap-2 nodrag nopan z-[10050]"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-black/5 dark:border-white/5">
                          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-zinc-700 dark:text-zinc-200">
                            <BookOpen className="size-3.5 text-amber-500" />
                            <span>Swept Dependencies ({data.resolvedDependencies.length})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent("foqz:open-logbook"))}
                            className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer font-medium"
                          >
                            Open Logbook 📒
                          </button>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                          {data.resolvedDependencies.map((dep) => (
                            <div
                              key={dep.id}
                              className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.04]"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Check className="size-3 text-emerald-500 shrink-0" />
                                <span className="truncate text-xs text-zinc-800 dark:text-zinc-200" title={dep.title}>
                                  {dep.title}
                                </span>
                              </div>
                              {dep.completedAt && (
                                <span className="text-[9px] font-mono text-zinc-400 shrink-0">
                                  {new Date(dep.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Focus button (the timer itself floats above the board while focusing) */}
                {selected && !isFocusTarget ? (
                  <button
                    type="button"
                    onClick={handleStartFocus}
                    className="size-5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 hover:scale-110 active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer select-none"
                    title="Focus here (F)"
                  >
                    <Target className="size-3 text-rose-500" />
                  </button>
                ) : null}
              </div>
            </div>

          {/* Notes / checklist. A card without notes stays a single line; the link shows when selected. */}
          {!data.notes && !isEditingNotes ? (
            selected ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotesDraft("- [ ] ");
                  setIsEditingNotes(true);
                }}
                className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <Plus className="size-2.5" />
                <span>Add notes or steps</span>
              </button>
            ) : null
          ) : (
          <div className="mt-2 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              <span className="flex items-center gap-1 font-semibold text-zinc-600 dark:text-zinc-300">
                Notes
              </span>
              {checklistStats.total > 0 && (
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {checklistStats.done}/{checklistStats.total} done
                </span>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-1">
                <textarea
                  ref={notesTextareaRef}
                  value={notesDraft}
                  rows={2}
                  placeholder="- [ ] Action steps or notes..."
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
                  className="w-full bg-black/[0.02] dark:bg-white/[0.04] p-1.5 rounded-lg border border-rose-400 outline-none text-[11px] leading-relaxed font-mono"
                  style={{ fontFamily: "'Shantell Sans', monospace, sans-serif" }}
                />
                <div className="text-[9px] text-zinc-400 font-mono flex items-center justify-between select-none">
                  <span>Markdown checklists enabled</span>
                  <span>⌘↵ to save</span>
                </div>
              </div>
            ) : data.notes ? (
              <div className="space-y-1">
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setIsEditingNotes(true);
                  }}
                  onClick={handleNotesCheckboxClick}
                  className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 break-words cursor-text max-h-[150px] overflow-y-auto task-notes-content"
                  style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                  title="Click checkboxes to complete steps. Double click to edit."
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownBlock(data.notes),
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const updated = (data.notes || "") + "\n- [ ] ";
                    setNotesDraft(updated);
                    setIsEditingNotes(true);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer pt-0.5"
                >
                  <Plus className="size-2.5" />
                  <span>Add step</span>
                </button>
              </div>
            ) : null}

            {/* Related GitHub PR footer links */}
            {relatedPrs.length > 0 && (
              <div className="pt-2 mt-2 border-t border-black/5 dark:border-white/5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-zinc-400">Associated PRs:</span>
                {relatedPrs.map((pr) => (
                  <a
                    key={pr.number}
                    href={pr.html_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium hover:underline ${
                      pr.state === 'merged'
                        ? 'text-purple-600 dark:text-purple-400'
                        : pr.state === 'closed'
                        ? 'text-zinc-400 line-through'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    <span>#{pr.number}</span>
                    <span className="truncate max-w-[150px]">({pr.title})</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
});
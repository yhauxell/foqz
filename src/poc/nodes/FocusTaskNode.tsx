import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NodeResizer, Handle, Position, type NodeProps, type Node, type Edge } from "@xyflow/react";
import rough from "roughjs";
import {
  Check,
  FileText,
  Plus,
  Play,
  Pause,
  Target,
  X,
  Lock,
  Ban,
  Link2,
  Undo2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  PlaneTakeoff,
  Sparkles,
  GitPullRequest,
  User,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { updateGitHubIssue, getIssuePullRequests, type RelatedPullRequest } from "@/lib/githubSync";
import type { SemanticRelation } from "../edges/SemanticEdge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  renderMarkdownInline,
  renderMarkdownBlock,
  toggleCheckboxInMarkdown,
  extractChecklistStats,
} from "@/lib/markdown";
import {
  focusTaskShellColorForPriority,
  type TaskPaperTheme,
  type ProjectAccent,
  ACCENT_STYLES,
} from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useFocusAppSettingsOptional } from "@/context/FocusAppSettingsContext";

export interface ResolvedDependencyStub {
  id: string;
  title: string;
  completedAt?: number;
}

export interface FocusTaskNodeData {
  title: string;
  status: "open" | "doing" | "done";
  priority: 1 | 2 | 3 | 4;
  notes?: string;
  paper?: TaskPaperTheme;
  trackedMs?: number;
  completedAt?: number;
  completedVia?: "manual" | "focus" | "runway" | "agent" | "github";
  focusSecondsSpent?: number;
  resolvedDependencies?: ResolvedDependencyStub[];
  borderStyle?: "solid" | "dashed" | "dotted";
  originProjectId?: string;
  originProjectTitle?: string;
  originProjectAccent?: ProjectAccent;
  originProjectPos?: { x: number; y: number };
  stagedAt?: number;
  stowedEdges?: Edge[];
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

  const [isExpanded, setIsExpanded] = useState(false);
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

  const isInsideRunway = useFlowCanvasStore(
    useCallback(
      (s) => {
        const myNode = s.nodes.find((n) => n.id === id);
        if (!myNode?.parentId) return false;
        const parent = s.nodes.find((n) => n.id === myNode.parentId);
        return (
          parent?.type === "runwayFrame" ||
          (parent?.type === "projectFrame" &&
            String((parent.data as any)?.title || "").includes("Runway"))
        );
      },
      [id]
    )
  );

  const runways = useFlowCanvasStore(
    useCallback(
      (s) =>
        s.nodes.filter(
          (n) =>
            n.type === "runwayFrame" ||
            (n.type === "projectFrame" &&
              String((n.data as any)?.title || "").includes("Runway"))
        ),
      []
    )
  );


  // When task is inside runway, auto-stow any active canvas edges connecting to it
  useEffect(() => {
    if (!isInsideRunway) return;
    const currentEdges = useFlowCanvasStore.getState().edges;
    const connected = currentEdges.filter((e) => e.source === id || e.target === id);
    if (connected.length === 0) return;

    const existingStowed = ((data as any)?.stowedEdges as Edge[]) || [];
    const merged = [
      ...existingStowed,
      ...connected.filter((ce) => !existingStowed.some((se) => se.id === ce.id)),
    ];
    useFlowCanvasStore.getState().updateNodeData(id, { stowedEdges: merged });
    useFlowCanvasStore.getState().setEdges((eds) =>
      eds.filter((e) => e.source !== id && e.target !== id)
    );
  }, [isInsideRunway, id]);

  const stowedEdges = useMemo(() => {
    return ((data as any)?.stowedEdges as Edge[]) || [];
  }, [(data as any)?.stowedEdges]);

  // Unified list of connections (active canvas edges + stowed edges)
  const allConnections = useFlowCanvasStore(
    useCallback(
      (s) => {
        const activeEdges = s.edges.filter((e) => e.source === id || e.target === id);
        const combined = [
          ...activeEdges,
          ...stowedEdges.filter((se) => !activeEdges.some((ae) => ae.id === se.id)),
        ];

        return combined.map((e) => {
          const isIncoming = e.target === id;
          const otherTaskId = isIncoming ? e.source : e.target;
          const otherTask = s.nodes.find((n) => n.id === otherTaskId);
          const rel: SemanticRelation = (e.data as any)?.relation || "depends";
          const otherTaskTitle = String(
            (otherTask?.data as any)?.title ||
              (otherTask?.data as any)?.label ||
              "Connected task"
          );
          const otherTaskStatus = String((otherTask?.data as any)?.status || "open");
          const isSatisfied = isIncoming
            ? rel === "depends" || !rel
              ? otherTaskStatus === "done"
              : true
            : true;

          return {
            edgeId: e.id,
            direction: isIncoming ? ("incoming" as const) : ("outgoing" as const),
            relation: rel,
            otherTaskId,
            otherTaskTitle,
            otherTaskStatus,
            isSatisfied,
          };
        });
      },
      [id, stowedEdges]
    )
  );

  const isBlocked = useMemo(
    () => allConnections.some((c) => c.direction === "incoming" && c.relation === "depends" && !c.isSatisfied),
    [allConnections]
  );

  const hasIncomingDeps = useMemo(
    () => allConnections.some((c) => c.direction === "incoming" && c.relation === "depends"),
    [allConnections]
  );

  const blockerTitle = useMemo(() => {
    const b = allConnections.find((c) => c.direction === "incoming" && c.relation === "depends" && !c.isSatisfied);
    return b ? b.otherTaskTitle : "";
  }, [allConnections]);



  const cyclePriority = (e: React.MouseEvent) => {
    e.stopPropagation();
    const curP = data.priority || 3;
    const nextP = (curP === 4 ? 1 : curP + 1) as 1 | 2 | 3 | 4;
    useFlowCanvasStore.getState().updateNodeData(id, { priority: nextP });
  };

  const originAccent = (data.originProjectAccent as ProjectAccent) || "blue";
  const originAccentDot = ACCENT_STYLES[originAccent]?.dotHex || "#3b82f6";

  const parentRunwayWidth = useFlowCanvasStore(
    useCallback(
      (s) => {
        const myNode = s.nodes.find((n) => n.id === id);
        if (!myNode?.parentId) return null;
        const parent = s.nodes.find((n) => n.id === myNode.parentId);
        if (
          parent?.type === "runwayFrame" ||
          (parent?.type === "projectFrame" && String((parent.data as any)?.title || "").includes("Runway"))
        ) {
          return Number(parent.style?.width ?? (parent.width ?? 680));
        }
        return null;
      },
      [id]
    )
  );

  const runwaySlotWidth = parentRunwayWidth ? parentRunwayWidth - 48 : 632;
  const w = isInsideRunway ? Math.max(300, runwaySlotWidth) : Math.max(200, width);

  const isFocusTarget = useFlowCanvasStore((s) => s.activeFocusNodeId === id);
  const isTimerRunning = useFlowCanvasStore((s) => (s.activeFocusNodeId === id ? s.isTimerRunning : false));
  const timerSecondsRemaining = useFlowCanvasStore((s) =>
    s.activeFocusNodeId === id ? s.timerSecondsRemaining : 0
  );
  const setActiveFocusNodeId = useFlowCanvasStore((s) => s.setActiveFocusNodeId);
  const setIsTimerRunning = useFlowCanvasStore((s) => s.setIsTimerRunning);
  const setTimerSecondsRemaining = useFlowCanvasStore((s) => s.setTimerSecondsRemaining);

  const notesLines = data.notes ? (data.notes.match(/\n/g) || []).length + 1 : 1;
  const activeCockpitH = Math.max(140, Math.min(380, 96 + notesLines * 24));
  const h = isInsideRunway ? (isFocusTarget || isExpanded ? activeCockpitH : 50) : Math.max(76, height);

  const runwaySlotInfo = useFlowCanvasStore(
    useCallback(
      (s) => {
        const myNode = s.nodes.find((n) => n.id === id);
        if (!myNode?.parentId) return null;
        const runwayTasks = s.nodes.filter(
          (n) => n.parentId === myNode.parentId && n.type === "focusTask"
        );
        const idx = runwayTasks.findIndex((n) => n.id === id);
        return idx !== -1 ? { slotNum: idx + 1, total: runwayTasks.length } : null;
      },
      [id]
    )
  );

  const checklistStats = useMemo(
    () => extractChecklistStats(data.notes || notesDraft),
    [data.notes, notesDraft]
  );

  const isDoing = data.status === "doing";

  const formattedTimer = useMemo(() => {
    if (!isFocusTarget) return "0:00";
    const mins = Math.floor(timerSecondsRemaining / 60);
    const secs = timerSecondsRemaining % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }, [isFocusTarget, timerSecondsRemaining]);

  const toggleTimer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTimerRunning((prev) => !prev);
  };

  const handleStartFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveFocusNodeId(id);
    setIsTimerRunning(true);
    if (timerSecondsRemaining <= 0) {
      setTimerSecondsRemaining(25 * 60);
    }
    useFlowCanvasStore.getState().updateNodeData(id, { status: "doing" });
    window.dispatchEvent(
      new CustomEvent("foqz:set-focus-target", { detail: { shapeId: id } })
    );
  };

  const handleStopFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveFocusNodeId(null);
    setIsTimerRunning(false);
    window.dispatchEvent(
      new CustomEvent("foqz:set-focus-target", { detail: { shapeId: null } })
    );
  };

  const handleOpenLockedFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent("foqz:set-focus-target", { detail: { shapeId: id } })
    );
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

    // 2. Hand-drawn Left Priority Accent Tab
    const isCompactRunway = isInsideRunway && !isFocusTarget && !isExpanded;
    const barHeight = isCompactRunway ? 24 : Math.min(32, Math.max(20, h - 24));
    const barY = isCompactRunway ? 13 : 8;
    const priorityBar = rc.rectangle(4, barY, 4, barHeight, {
      seed: nodeSeed + 1,
      roughness: 1.0,
      stroke: priorityHex,
      strokeWidth: 2,
      fill: priorityHex,
      fillStyle: "solid",
    });
    fragment.appendChild(priorityBar);

    // 3. Hand-drawn Checkbox outline
    const checkY = isCompactRunway ? 17 : 12;
    const checkOutline = rc.rectangle(15, checkY, 17, 17, {
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
  }, [id, w, h, isDone, priorityHex, activeTheme, data.borderStyle, isDark, isInsideRunway, isExpanded, isFocusTarget]);

  const toggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = data.status === "done" ? "open" : "done";
    useFlowCanvasStore.getState().updateNodeData(id, { status: nextStatus });

    if (data.githubIssueNumber && data.githubRepo) {
      updateGitHubIssue(String(data.githubRepo), Number(data.githubIssueNumber), {
        state: nextStatus === "done" ? "closed" : "open",
      })
        .then(() => {
          useFlowCanvasStore.getState().updateNodeData(id, { githubSyncStatus: "synced" });
        })
        .catch((err) => {
          console.warn("[FocusTaskNode] GitHub status sync error:", err);
          useFlowCanvasStore.getState().updateNodeData(id, { githubSyncStatus: "conflict" });
        });
    }
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
      style={{
        contain: "layout style",
        width: isInsideRunway ? `${w}px` : undefined,
        height: isInsideRunway && !isExpanded ? `${h}px` : undefined,
      }}
    >
      <NodeResizer minWidth={200} minHeight={48} isVisible={selected && !isInsideRunway} />

      {/* 4 Multi-Directional Handles on all sides (top/bottom visually hidden in runway to keep clean horizontal wiring) */}
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className={
          isInsideRunway
            ? "!opacity-0 !pointer-events-none !w-0 !h-0"
            : "!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
        }
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
        className={
          isInsideRunway
            ? "!opacity-0 !pointer-events-none !w-0 !h-0"
            : "!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
        }
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
      {isInsideRunway && !isFocusTarget && !isExpanded ? (
        /* --- Compact Runway Flight Strip View (~50px) --- */
        <div className="relative z-10 flex items-center flex-nowrap gap-2 px-3 h-full overflow-hidden">
          {/* Checkbox Click Target */}
          <button
            type="button"
            onClick={toggleStatus}
            title={isDone ? "Mark incomplete" : "Mark completed / Landed"}
            className="size-4.5 flex items-center justify-center cursor-pointer shrink-0 ml-1"
          >
            {isDone && (
              <Check className="size-3.5 stroke-[3] text-emerald-600 dark:text-emerald-400" />
            )}
          </button>

          {/* Flight Slot sequence */}
          <span className="text-[10px] font-mono font-bold text-zinc-400 shrink-0">
            0{runwaySlotInfo?.slotNum || 1}
          </span>

          {/* Origin Project Badge */}
          {data.originProjectId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                useFlowCanvasStore.getState().setSelectedNodeId(data.originProjectId as string);
                window.dispatchEvent(
                  new CustomEvent("foqz:flow-center-on", { detail: { id: data.originProjectId } })
                );
              }}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-800/70 hover:bg-white dark:hover:bg-zinc-700 transition-colors shadow-2xs shrink-0 cursor-pointer"
              title={`Origin Project: ${data.originProjectTitle || 'Project'} (Click to jump)`}
            >
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ backgroundColor: originAccentDot }}
              />
              <span className="truncate max-w-[100px]">{data.originProjectTitle || "Project"}</span>
              <ExternalLink className="size-2 text-zinc-400 shrink-0" />
            </button>
          )}

          {/* Title */}
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  else if (e.key === "Escape") {
                    setTitleDraft(data.title || "");
                    setIsEditingTitle(false);
                  }
                }}
                className="w-full bg-transparent border-b border-rose-500 outline-none text-[12px] font-medium text-zinc-900 dark:text-zinc-100"
                style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
              />
            ) : (
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
                className={`text-[12px] font-medium truncate cursor-text ${
                  isDone
                    ? "line-through text-zinc-400 dark:text-zinc-500"
                    : "text-zinc-800 dark:text-zinc-100"
                }`}
                style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                title="Double-click to edit task title"
              >
                {data.title || "Untitled Task"}
              </div>
            )}
          </div>

          {/* Checklist progress badge in compact view */}
          {checklistStats.total > 0 && (
            <span
              className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-black/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 shrink-0"
              title={`${checklistStats.done} of ${checklistStats.total} steps completed`}
            >
              {checklistStats.done}/{checklistStats.total}
            </span>
          )}

          {/* Connection Icon with Popover */}
          {allConnections.length > 0 && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Popover>
                <PopoverTrigger
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex items-center justify-center gap-1 h-6 px-1.5 rounded-md border shadow-2xs transition-colors cursor-pointer shrink-0 ${
                    isBlocked
                      ? "border-rose-500/35 bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25"
                      : hasIncomingDeps
                      ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                      : "border-blue-500/35 bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25"
                  }`}
                  title={
                    isBlocked
                      ? `Blocked: ${blockerTitle || "Prerequisite incomplete"} (Click to view)`
                      : hasIncomingDeps
                      ? `Prerequisites ready (${allConnections.length}) (Click to view)`
                      : `${allConnections.length} connection(s) (Click to view)`
                  }
                >
                  {isBlocked ? (
                    <Ban className="size-3.5 shrink-0" />
                  ) : hasIncomingDeps ? (
                    <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Link2 className="size-3.5 shrink-0" />
                  )}
                  {allConnections.length > 1 && (
                    <span className="text-[10px] font-mono font-bold leading-none">
                      {allConnections.length}
                    </span>
                  )}
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
                      <Link2 className="size-3.5 text-zinc-400" />
                      <span>Connections ({allConnections.length})</span>
                    </div>
                    <span className="text-[10px] font-normal text-zinc-400">
                      Reconnected on return
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                    {allConnections.map((conn) => (
                      <div
                        key={conn.edgeId}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors border border-black/[0.04] dark:border-white/[0.04]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {conn.direction === "incoming" ? (
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold shrink-0 ${
                                conn.isSatisfied
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {conn.isSatisfied ? "Ready" : "Blocked by"}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                              Unblocks
                            </span>
                          )}
                          <span className="truncate text-[12px] font-medium text-zinc-800 dark:text-zinc-200">
                            {conn.otherTaskTitle || "Prerequisite Task"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            useFlowCanvasStore.getState().setSelectedNodeId(conn.otherTaskId);
                            window.dispatchEvent(
                              new CustomEvent("foqz:flow-center-on", { detail: { id: conn.otherTaskId } })
                            );
                          }}
                          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
                          title="Locate card on canvas"
                        >
                          <ExternalLink className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Priority Pill */}
          <button
            type="button"
            onClick={cyclePriority}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white shrink-0 cursor-pointer"
            title="Priority (click to cycle)"
          >
            P{data.priority || 3}
          </button>

          {/* Return to Project Button */}
          {data.originProjectId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                useFlowCanvasStore.getState().returnTaskToProject(id);
              }}
              className="size-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title={`Return task to ${data.originProjectTitle || 'origin project'}`}
            >
              <Undo2 className="size-3" />
            </button>
          )}

          {/* Expand Details / Notes Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            className="size-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            title="Expand task notes and checklist"
          >
            <ChevronDown className="size-3" />
          </button>

          {/* Focus Button */}
          <button
            type="button"
            onClick={handleStartFocus}
            className="size-5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 hover:scale-110 active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer select-none"
            title="Start Focus Session on this flight (F)"
          >
            <Target className="size-3 text-rose-500" />
          </button>
        </div>
      ) : isInsideRunway ? (
        /* --- Active Cockpit Flight Card (When Focused or Expanded in Runway) --- */
        <div className="relative z-10 flex flex-col justify-between px-4 py-3 h-full overflow-hidden select-none">
          {/* Top Flight Header Bar */}
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-rose-500/20">
            {/* Left: Flight Slot Badge & Origin Project */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                <span className={`size-1.5 rounded-full bg-rose-500 ${isTimerRunning ? 'animate-ping' : ''}`} />
                <span>FLIGHT 0{runwaySlotInfo?.slotNum || 1}</span>
              </span>

              {data.originProjectId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    useFlowCanvasStore.getState().setSelectedNodeId(data.originProjectId as string);
                    window.dispatchEvent(
                      new CustomEvent("foqz:flow-center-on", { detail: { id: data.originProjectId } })
                    );
                  }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-800/70 hover:bg-white dark:hover:bg-zinc-700 transition-colors shadow-2xs shrink-0 cursor-pointer"
                  title={`Origin Project: ${data.originProjectTitle || 'Project'} (Click to jump)`}
                >
                  <span
                    className="size-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: originAccentDot }}
                  />
                  <span className="truncate max-w-[100px]">{data.originProjectTitle || "Project"}</span>
                  <ExternalLink className="size-2 text-zinc-400 shrink-0" />
                </button>
              )}

              {/* Priority Pill */}
              <button
                type="button"
                onClick={cyclePriority}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white shrink-0 cursor-pointer"
                title="Priority (click to cycle)"
              >
                P{data.priority || 3}
              </button>
            </div>

            {/* Right: Sprint Timer & Big Direct Land/Complete Button */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isFocusTarget ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-mono font-semibold select-none shadow-2xs"
                >
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
              ) : (
                <button
                  type="button"
                  onClick={handleStartFocus}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] font-medium hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                >
                  <Target className="size-2.5" />
                  <span>Start Flight</span>
                </button>
              )}

              {/* Direct Land Flight / Complete Button */}
              <button
                type="button"
                onClick={toggleStatus}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
                title="Land flight (Marks done and automatically focuses next flight)"
              >
                <Check className="size-3 stroke-[3]" />
                <span>Land Flight</span>
              </button>

              {/* Return to Project Button */}
              {data.originProjectId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    useFlowCanvasStore.getState().returnTaskToProject(id);
                  }}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title={`Return task to ${data.originProjectTitle || 'origin project'}`}
                >
                  <Undo2 className="size-3" />
                </button>
              )}

              {/* Collapse button if manually expanded */}
              {isExpanded && !isFocusTarget && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Collapse flight strip"
                >
                  <ChevronUp className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* Task Title Row */}
          <div className="pt-1.5 pb-1">
            {isEditingTitle ? (
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  else if (e.key === "Escape") {
                    setTitleDraft(data.title || "");
                    setIsEditingTitle(false);
                  }
                }}
                className="w-full bg-transparent border-b border-rose-500 outline-none text-[13px] font-bold text-zinc-900 dark:text-zinc-100"
                style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
              />
            ) : (
              <h3
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
                className={`text-[13px] font-bold leading-snug cursor-text ${
                  isDone
                    ? "line-through text-zinc-400 dark:text-zinc-500"
                    : "text-zinc-900 dark:text-zinc-100"
                }`}
                style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                title="Double-click to edit flight title"
              >
                {data.title || "Untitled Task"}
              </h3>
            )}
          </div>

          {/* WHAT THIS TASK IS ABOUT (Action Steps & Checklist) */}
          <div className="flex-1 min-h-0 pt-1 border-t border-black/5 dark:border-white/5 flex flex-col justify-start">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              <span className="flex items-center gap-1 font-semibold text-zinc-600 dark:text-zinc-300">
                <Sparkles className="size-2.5 text-rose-500" />
                WHAT THIS TASK IS ABOUT • ACTION STEPS
              </span>
              {checklistStats.total > 0 && (
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {checklistStats.done}/{checklistStats.total} completed
                </span>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-1">
                <textarea
                  ref={notesTextareaRef}
                  value={notesDraft}
                  rows={2}
                  placeholder="- [ ] Action step..."
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
                <div className="text-[9px] text-zinc-400 font-mono flex items-center justify-between">
                  <span>Checklists enabled (- [ ] item)</span>
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
                  className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300 break-words cursor-text max-h-[140px] overflow-y-auto task-notes-content"
                  style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                  title="Click checkboxes to complete steps. Double-click to edit."
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
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotesDraft("- [ ] ");
                  setIsEditingNotes(true);
                }}
                className="w-full py-2 px-3 rounded-lg border border-dashed border-rose-300 dark:border-rose-700/60 hover:bg-rose-500/5 text-[11px] text-rose-600 dark:text-rose-400 text-left transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="size-3" />
                <span>What needs to get done? Click to add checklist steps (- [ ] step)...</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* --- Standard Full Visibility Card View --- */
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
                {/* Active Focus Sprint Banner on Card */}
                {isFocusTarget && (
                  <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 mb-2 select-none shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-wider">
                      <span className="size-1.5 rounded-full bg-rose-500 animate-ping" />
                      <span>CURRENT SPRINT FOCUS</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[10px] font-semibold">
                      <span>{formattedTimer}</span>
                      <button
                        type="button"
                        onClick={toggleTimer}
                        className="p-0.5 hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
                        title={isTimerRunning ? "Pause timer" : "Resume timer"}
                      >
                        {isTimerRunning ? <Pause className="size-2.5" /> : <Play className="size-2.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleStatus}
                        className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-sans font-medium transition-colors cursor-pointer"
                        title="Complete Task"
                      >
                        <Check className="size-2.5 stroke-[3]" />
                        <span>Complete</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Optional Origin Project Badge in Full Card View */}
                {(data.originProjectId || data.githubIssueNumber) && (
                  <div className="flex items-center gap-1 mb-1 flex-wrap">
                    {data.originProjectId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          useFlowCanvasStore.getState().setSelectedNodeId(data.originProjectId as string);
                          window.dispatchEvent(
                            new CustomEvent("foqz:flow-center-on", { detail: { id: data.originProjectId } })
                          );
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-800/70 hover:bg-white dark:hover:bg-zinc-700 transition-colors shadow-2xs shrink-0 cursor-pointer"
                        title={`Origin: ${data.originProjectTitle || 'Project'} (Click to jump)`}
                      >
                        <span
                          className="size-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: originAccentDot }}
                        />
                        <span className="truncate max-w-[85px]">{data.originProjectTitle || "Project"}</span>
                        <ExternalLink className="size-2 text-zinc-400 shrink-0" />
                      </button>
                    )}

                    {data.githubIssueNumber && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <a
                          href={(data.githubIssueUrl as string) || `https://github.com/${data.githubRepo || ''}/issues/${data.githubIssueNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0 transition-colors"
                          title={`GitHub #${data.githubIssueNumber} in ${data.githubRepo || ''} (${(data.githubSyncStatus as string) || 'synced'})`}
                        >
                          <GitPullRequest className="size-2.5 text-purple-500" />
                          <span>#{data.githubIssueNumber}</span>
                        </a>

                        {data.githubAssignee && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono text-zinc-600 dark:text-zinc-300 bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 shrink-0"
                            title={`Assignee: @${data.githubAssignee}`}
                          >
                            <User className="size-2 text-zinc-500" />
                            <span>@{String(data.githubAssignee)}</span>
                          </span>
                        )}

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
                      </div>
                    )}
                  </div>
                )}

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
                {/* Send to Runway Button (when not inside runway) */}
                {!isInsideRunway && (
                  runways.length > 1 ? (
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Popover>
                        <PopoverTrigger
                          onClick={(e) => e.stopPropagation()}
                          className="size-5 rounded flex items-center justify-center text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 dark:hover:bg-blue-500/20 transition-all cursor-pointer opacity-75 group-hover:opacity-100"
                          title="Send to Runway..."
                        >
                          <PlaneTakeoff className="size-3" />
                        </PopoverTrigger>
                        <PopoverContent
                          side="bottom"
                          align="end"
                          sideOffset={4}
                          className="w-56 p-1.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl text-xs nodrag nopan z-[10050]"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                            Stage on Runway
                          </div>
                          {runways.map((rw) => {
                            const rwTitle = (rw.data as any)?.title || "Runway";
                            return (
                              <button
                                key={rw.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  useFlowCanvasStore.getState().sendTaskToRunway(id, rw.id);
                                }}
                                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <PlaneTakeoff className="size-3 text-blue-500 shrink-0" />
                                  <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                                    {rwTitle}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </PopoverContent>
                      </Popover>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        useFlowCanvasStore.getState().sendTaskToRunway(id);
                      }}
                      className="size-5 rounded flex items-center justify-center text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 dark:hover:bg-blue-500/20 transition-all cursor-pointer opacity-75 group-hover:opacity-100"
                      title={
                        runways.length === 1
                          ? `Send to ${(runways[0].data as any)?.title || "Today's Runway"}`
                          : "Send to Runway (Stages Today's Runway)"
                      }
                    >
                      <PlaneTakeoff className="size-3" />
                    </button>
                  )
                )}

                {/* Collapse button if expanded inside runway */}
                {isInsideRunway && isExpanded && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(false);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    title="Collapse to flight strip view"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                )}

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
                    <button
                      type="button"
                      onClick={handleOpenLockedFocus}
                      className="hover:scale-110 active:scale-95 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 transition-all p-0.5 cursor-pointer ml-0.5"
                      title="Open Fullscreen Locked Focus (F)"
                    >
                      <Lock className="size-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleStopFocus}
                      className="hover:scale-110 active:scale-95 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 transition-all p-0.5 cursor-pointer ml-0.5"
                      title="Exit Focus Session (Stop Timer)"
                    >
                      <X className="size-2.5 stroke-[2.5]" />
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
            </div>

          {/* Task Body / Notes: WHAT THIS IS ABOUT & CHECKLIST */}
          <div className="mt-2 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              <span className="flex items-center gap-1 font-semibold text-zinc-600 dark:text-zinc-300">
                <Sparkles className="size-2.5 text-rose-500" />
                WHAT THIS TASK IS ABOUT • DEFINITION OF DONE
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
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotesDraft("- [ ] ");
                  setIsEditingNotes(true);
                }}
                className="w-full py-2 px-3 rounded-lg border border-dashed border-rose-300 dark:border-rose-700/60 hover:bg-rose-500/5 text-[11px] text-rose-600 dark:text-rose-400 text-left transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="size-3" />
                <span>Define what done looks like (click to add checklist steps)...</span>
              </button>
            )}

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
        </div>
      </div>
      )}
    </div>
  );
});

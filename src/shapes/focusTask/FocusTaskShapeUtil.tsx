import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
} from "@tldraw/tlschema";
import {
  Check,
  FileText,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  renderMarkdownBlock,
  renderMarkdownInline,
  toggleCheckboxInMarkdown,
} from "../../lib/markdown";
import {
  BaseBoxShapeUtil,
  createShapeId,
  HTMLContainer,
  resizeBox,
  T,
  TLBaseShape,
  useEditor,
  useValue,
  type TLResizeInfo,
  type TLShapePartial,
} from "tldraw";
import {
  DEFAULT_TASK_CARD_H,
  DEFAULT_TASK_CARD_W,
  MIN_TASK_H,
  MIN_TASK_W,
} from "../../lib/focusTaskDimensions";
import type { TrackedDayEntry } from "../../lib/focusTime";

/** Four sticky-note themes with tuned foregrounds for readable text */
export type TaskPaperTheme = "cream" | "fog" | "bloom" | "sage";

/** @deprecated Use TaskPaperTheme */
export type StickyPaper = TaskPaperTheme;

const focusTaskVersions = createShapePropsMigrationIds("focus-task", {
  AddStickyNoteFields: 1,
  PaperToFourThemes: 2,
  AddTrackedMs: 3,
  AddTrackedDayLogAndSession: 4,
  AddAgentFields: 5,
});

const LEGACY_PAPER_TO_THEME: Record<string, TaskPaperTheme> = {
  white: "cream",
  butter: "cream",
  lemon: "cream",
  coral: "bloom",
  blush: "bloom",
  lavender: "fog",
  sky: "fog",
  mint: "sage",
  cream: "cream",
  fog: "fog",
  bloom: "bloom",
  sage: "sage",
};

const focusTaskMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: focusTaskVersions.AddStickyNoteFields,
      up: (props: Record<string, unknown>) => {
        if (props.paper == null) props.paper = "butter";
        if (props.starred == null) props.starred = false;
        if (props.createdAt == null || typeof props.createdAt !== "number")
          props.createdAt = 0;
      },
      down: "retired",
    },
    {
      id: focusTaskVersions.PaperToFourThemes,
      up: (props: Record<string, unknown>) => {
        const raw = props.paper;
        const key = typeof raw === "string" ? raw : "";
        props.paper = LEGACY_PAPER_TO_THEME[key] ?? "cream";
      },
      down: (props: Record<string, unknown>) => {
        const t = props.paper;
        if (t === "cream") props.paper = "butter";
        else if (t === "fog") props.paper = "lavender";
        else if (t === "bloom") props.paper = "coral";
        else if (t === "sage") props.paper = "mint";
      },
    },
    {
      id: focusTaskVersions.AddTrackedMs,
      up: (props: Record<string, unknown>) => {
        if (props.trackedMs == null || typeof props.trackedMs !== "number")
          props.trackedMs = 0;
      },
      down: (props: Record<string, unknown>) => {
        delete props.trackedMs;
      },
    },
    {
      id: focusTaskVersions.AddTrackedDayLogAndSession,
      up: (props: Record<string, unknown>) => {
        if (!Array.isArray(props.trackedDayLog)) props.trackedDayLog = [];
        if (props.focusEndAt != null && typeof props.focusEndAt !== "number")
          props.focusEndAt = null;
        if (
          props.focusSessionStartedAt != null &&
          typeof props.focusSessionStartedAt !== "number"
        )
          props.focusSessionStartedAt = null;
        if (
          props.focusPresetMin == null ||
          typeof props.focusPresetMin !== "number"
        )
          props.focusPresetMin = 25;
      },
      down: (props: Record<string, unknown>) => {
        delete props.trackedDayLog;
        delete props.focusEndAt;
        delete props.focusSessionStartedAt;
        delete props.focusPresetMin;
      },
    },
    {
      id: focusTaskVersions.AddAgentFields,
      up: (props: Record<string, unknown>) => {
        if (props.agentModel == null) props.agentModel = "";
        if (props.agentOutput == null) props.agentOutput = "";
        if (props.agentStatus == null) props.agentStatus = "idle";
        if (props.agentError == null) props.agentError = "";
        if (props.refineInput == null) props.refineInput = "";
        if (props.isRefining == null) props.isRefining = false;
      },
      down: (props: Record<string, unknown>) => {
        delete props.agentModel;
        delete props.agentOutput;
        delete props.agentStatus;
        delete props.agentError;
        delete props.refineInput;
        delete props.isRefining;
      },
    },
  ],
});

export type TLFocusTaskShape = TLBaseShape<
  "focus-task",
  {
    w: number;
    h: number;
    title: string;
    priority: number;
    estimate: string;
    status: "open" | "doing" | "done";
    notes: string;
    blocked: boolean;
    blockedReason: string;
    carried: boolean;
    paper: StickyPaper;
    starred: boolean;
    createdAt: number;
    trackedMs: number;
    trackedDayLog: TrackedDayEntry[];
    focusEndAt: number | null;
    focusSessionStartedAt: number | null;
    focusPresetMin: number;
    agentModel?: string;
    agentOutput?: string;
    agentStatus?: "idle" | "running" | "done" | "error";
    agentError?: string;
    refineInput?: string;
    isRefining?: boolean;
  }
>;

type PriorityLevel = 1 | 2 | 3 | 4;

const PRIORITY_LABEL: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

export type TaskPaperTokens = {
  shell: string;
  meta: string;
  metaBorder: string;
  note: string;
  noteBorder: string;
  fg: string;
  muted: string;
  noteFg: string;
  notePlaceholder: string;
};

export const STICKY_PAPER: Record<TaskPaperTheme, TaskPaperTokens> = {
  cream: {
    shell: "#18181b",
    meta: "#27272a",
    metaBorder: "rgb(255 255 255 / 10%)",
    note: "#18181b",
    noteBorder: "rgb(255 255 255 / 10%)",
    fg: "#fafafa",
    muted: "#a1a1aa",
    noteFg: "#e4e4e7",
    notePlaceholder: "#71717a",
  },
  fog: {
    shell: "#18181b",
    meta: "#27272a",
    metaBorder: "rgb(255 255 255 / 10%)",
    note: "#18181b",
    noteBorder: "rgb(255 255 255 / 10%)",
    fg: "#fafafa",
    muted: "#a1a1aa",
    noteFg: "#e4e4e7",
    notePlaceholder: "#71717a",
  },
  bloom: {
    shell: "#18181b",
    meta: "#27272a",
    metaBorder: "rgb(255 255 255 / 10%)",
    note: "#18181b",
    noteBorder: "rgb(255 255 255 / 10%)",
    fg: "#fafafa",
    muted: "#a1a1aa",
    noteFg: "#e4e4e7",
    notePlaceholder: "#71717a",
  },
  sage: {
    shell: "#18181b",
    meta: "#27272a",
    metaBorder: "rgb(255 255 255 / 10%)",
    note: "#18181b",
    noteBorder: "rgb(255 255 255 / 10%)",
    fg: "#fafafa",
    muted: "#a1a1aa",
    noteFg: "#e4e4e7",
    notePlaceholder: "#71717a",
  },
};

export function focusTaskShellColorForPriority(_priority: number): string {
  return "#18181b";
}

export function getFocusTaskPriorityLabel(priority: number): string {
  return PRIORITY_LABEL[priority] ?? "Normal";
}

export class FocusTaskShapeUtil extends BaseBoxShapeUtil<TLFocusTaskShape> {
  static override type = "focus-task" as const;
  static override migrations = focusTaskMigrations;
  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    priority: T.number,
    estimate: T.string,
    status: T.literalEnum("open", "doing", "done"),
    notes: T.string,
    blocked: T.boolean,
    blockedReason: T.string,
    carried: T.boolean,
    paper: T.literalEnum("cream", "fog", "bloom", "sage"),
    starred: T.boolean,
    createdAt: T.number,
    trackedMs: T.number,
    trackedDayLog: T.arrayOf(
      T.object({
        day: T.string,
        ms: T.number,
      }),
    ),
    focusEndAt: T.nullable(T.number),
    focusSessionStartedAt: T.nullable(T.number),
    focusPresetMin: T.number,
    agentModel: T.optional(T.string),
    agentOutput: T.optional(T.string),
    agentStatus: T.optional(T.literalEnum("idle", "running", "done", "error")),
    agentError: T.optional(T.string),
    refineInput: T.optional(T.string),
    isRefining: T.optional(T.boolean),
  };

  override getDefaultProps(): TLFocusTaskShape["props"] {
    return {
      w: 260,
      h: 84,
      title: "",
      priority: 3,
      estimate: "",
      status: "open",
      notes: "",
      blocked: false,
      blockedReason: "",
      carried: false,
      paper: "cream",
      starred: false,
      createdAt: 0,
      trackedMs: 0,
      trackedDayLog: [],
      focusEndAt: null,
      focusSessionStartedAt: null,
      focusPresetMin: 25,
      agentModel: "",
      agentOutput: "",
      agentStatus: "idle",
      agentError: "",
      refineInput: "",
      isRefining: false,
    };
  }

  override onBeforeCreate(shape: TLFocusTaskShape): TLFocusTaskShape | void {
    if (shape.props.createdAt > 0) return;
    return {
      ...shape,
      props: {
        ...shape.props,
        createdAt: Date.now(),
      },
    };
  }

  override canEdit() {
    return false;
  }

  override onResize(
    shape: TLFocusTaskShape,
    info: TLResizeInfo<TLFocusTaskShape>,
  ) {
    return resizeBox(shape, info, {
      minWidth: 180,
      minHeight: 70,
    });
  }

  override component(shape: TLFocusTaskShape) {
    return <FocusTaskBody shape={shape} />;
  }

  override indicator(shape: TLFocusTaskShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />;
  }
}

function FocusTaskBody({ shape }: { shape: TLFocusTaskShape }) {
  const editor = useEditor();
  const isSelected = useValue(
    "task selected",
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );
  const isDark = useValue(
    "isDark",
    () => editor.user.getIsDarkMode(),
    [editor],
  );

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const update = useCallback(
    (patch: Partial<TLFocusTaskShape["props"]>) => {
      editor.updateShape({
        id: shape.id,
        type: "focus-task",
        props: { ...shape.props, ...patch },
      });
    },
    [editor, shape],
  );

  const cycleStatus = useCallback(() => {
    const cur = shape.props.status;
    const next = cur === "open" ? "doing" : cur === "doing" ? "done" : "open";
    update({ status: next });
  }, [shape.props.status, update]);

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      editor.deleteShapes([shape.id]);
    },
    [editor, shape.id],
  );

  const onOpenCopilot = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      editor.select(shape.id);
      window.dispatchEvent(
        new CustomEvent("foqz:open-copilot", {
          detail: { shapeId: shape.id, type: "focus-task" },
        }),
      );
    },
    [editor, shape.id],
  );

  const onToggleNotes = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isEditingNotes && shape.props.h < 130) {
        update({ h: 140 });
      }
      setIsEditingNotes((v) => !v);
    },
    [isEditingNotes, shape.props.h, update],
  );

  const onNotesContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && target.hasAttribute("data-task-checkbox")) {
        e.stopPropagation();
        const idx = Number(target.getAttribute("data-task-checkbox"));
        if (!Number.isNaN(idx)) {
          const updated = toggleCheckboxInMarkdown(shape.props.notes || "", idx);
          update({ notes: updated });
          return;
        }
      }
      setIsEditingNotes(true);
    },
    [shape.props.notes, update],
  );

  // Quick connector: spawns next connected task to the right
  const onSpawnNextTask = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const currentShape = editor.getShape(shape.id) as TLFocusTaskShape;
      if (!currentShape) return;

      const cardW = currentShape.props.w || 260;
      const cardH = currentShape.props.h || 84;
      const nextX = currentShape.x + cardW + 60;
      const nextY = currentShape.y;
      const newTaskId = createShapeId();

      editor.createShape({
        id: newTaskId,
        type: "focus-task",
        x: nextX,
        y: nextY,
        parentId: currentShape.parentId,
        props: {
          w: cardW,
          h: cardH,
          title: "",
          status: "open",
          priority: currentShape.props.priority || 3,
        },
      });

      // Create connecting arrow
      const arrowId = createShapeId();
      const arrowStartX = currentShape.x + cardW;
      const arrowStartY = currentShape.y + cardH / 2;
      const arrowEndX = nextX;
      const arrowEndY = nextY + cardH / 2;

      editor.createShape({
        id: arrowId,
        type: "arrow",
        x: arrowStartX,
        y: arrowStartY,
        parentId: currentShape.parentId,
        props: {
          start: { x: 0, y: 0 },
          end: { x: arrowEndX - arrowStartX, y: arrowEndY - arrowStartY },
          color: "grey",
          size: "s",
        },
      });

      try {
        editor.createBinding({
          type: "arrow",
          fromId: arrowId,
          toId: currentShape.id,
          props: {
            terminal: "start",
            normalizedAnchor: { x: 1, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
        });
        editor.createBinding({
          type: "arrow",
          fromId: arrowId,
          toId: newTaskId,
          props: {
            terminal: "end",
            normalizedAnchor: { x: 0, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
        });
      } catch {
        // bindings optional
      }

      editor.select(newTaskId);
    },
    [editor, shape.id],
  );

  const isDone = shape.props.status === "done";
  const isDoing = shape.props.status === "doing";

  const renderedTitle = useMemo(
    () => renderMarkdownInline(shape.props.title || ""),
    [shape.props.title],
  );

  const renderedNotes = useMemo(
    () => renderMarkdownBlock(shape.props.notes || ""),
    [shape.props.notes],
  );

  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: "all",
      }}
    >
      <div
        className={`w-full h-full rounded-lg border-2 p-3 flex flex-col justify-between transition-all select-none group relative ${
          isDark
            ? isDone
              ? "border-zinc-500 bg-zinc-900/80 opacity-75"
              : isSelected
                ? "border-white bg-zinc-900 shadow-sm ring-1 ring-white/20"
                : "border-white/90 bg-zinc-900 hover:border-white shadow-xs"
            : isDone
              ? "border-black/50 bg-zinc-50 opacity-75"
              : isSelected
                ? "border-black bg-white shadow-sm ring-1 ring-black/20"
                : "border-black bg-white hover:border-black shadow-xs"
        }`}
        style={{
          boxSizing: "border-box",
        }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 min-w-0 shrink-0">
          {isEditingTitle ? (
            <input
              autoFocus
              type="text"
              value={shape.props.title}
              placeholder="Task title (markdown supported)..."
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => update({ title: e.target.value })}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  setIsEditingTitle(false);
                }
              }}
              className={`w-full bg-transparent border-0 outline-none text-[13px] font-medium leading-snug tracking-tight ${
                isDark
                  ? isDone
                    ? "line-through text-zinc-500"
                    : "text-zinc-100 placeholder:text-zinc-600 focus:text-white"
                  : isDone
                    ? "line-through text-zinc-400"
                    : "text-zinc-900 placeholder:text-zinc-400 focus:text-zinc-950"
              }`}
            />
          ) : (
            <div
              className={`w-full text-[13px] font-medium leading-snug tracking-tight cursor-text task-title-markdown select-text truncate ${
                isDark
                  ? isDone
                    ? "line-through text-zinc-500"
                    : "text-zinc-100"
                  : isDone
                    ? "line-through text-zinc-400"
                    : "text-zinc-900"
              }`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              title="Click to edit title (supports markdown)"
              dangerouslySetInnerHTML={{
                __html:
                  renderedTitle ||
                  '<span class="opacity-40 italic">Task title (markdown)...</span>',
              }}
            />
          )}

          {/* Action buttons on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              title={
                shape.props.notes
                  ? "Edit notes / checklist (Markdown)"
                  : "Add notes / checklist (Markdown)"
              }
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggleNotes}
              className={`p-1 rounded transition-colors ${
                isDark
                  ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              } ${shape.props.notes ? (isDark ? "text-blue-400" : "text-blue-600") : ""}`}
            >
              <FileText className="size-3" />
            </button>
            <button
              type="button"
              title="Copilot assistance"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpenCopilot}
              className={`p-1 rounded transition-colors ${
                isDark
                  ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              <Sparkles className="size-3 text-violet-500" />
            </button>
            <button
              type="button"
              title="Delete task"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDelete}
              className={`p-1 rounded transition-colors ${
                isDark
                  ? "text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                  : "text-zinc-400 hover:text-red-600 hover:bg-zinc-100"
              }`}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>

        {/* Middle section: Markdown notes, checklists, code, or details */}
        {isEditingNotes ? (
          <div
            className="flex-1 my-1.5 flex flex-col min-h-0"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <textarea
              autoFocus
              rows={2}
              value={shape.props.notes}
              placeholder="Add markdown notes, checklists (- [ ] ...), code..."
              onChange={(e) => update({ notes: e.target.value })}
              onBlur={() => setIsEditingNotes(false)}
              onKeyDown={(e) => {
                if (
                  e.key === "Escape" ||
                  (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                ) {
                  setIsEditingNotes(false);
                }
              }}
              className={`w-full flex-1 p-1.5 text-xs rounded-md border outline-none resize-none font-mono leading-relaxed ${
                isDark
                  ? "bg-zinc-950/80 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500"
                  : "bg-zinc-50 border-zinc-300 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400"
              }`}
            />
          </div>
        ) : shape.props.notes ? (
          <div
            className={`task-markdown-body flex-1 my-1.5 overflow-y-auto select-text text-xs leading-relaxed ${
              isDark ? "text-zinc-300" : "text-zinc-700"
            }`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onNotesContainerClick}
            title="Click to edit notes, click checkboxes to toggle"
            dangerouslySetInnerHTML={{
              __html: renderedNotes,
            }}
          />
        ) : shape.props.h >= 110 ? (
          <div
            className="flex-1 my-1.5 flex items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-md text-[11px] text-zinc-400 dark:text-zinc-600 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setIsEditingNotes(true)}
          >
            + Add notes or checklist (markdown)
          </div>
        ) : null}

        {/* Bottom row: Status pill & Quick Connector handle */}
        <div
          className={`flex items-center justify-between gap-2 pt-2 border-t shrink-0 ${
            isDark ? "border-zinc-800" : "border-black/10"
          }`}
        >
          {/* 1-Click Status Pill */}
          <button
            type="button"
            title="Click to cycle status (Todo → In Progress → Done)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={cycleStatus}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
              isDone
                ? isDark
                  ? "bg-emerald-950/40 border border-emerald-800/60 text-emerald-300"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : isDoing
                  ? isDark
                    ? "bg-blue-950/50 border border-blue-800/70 text-blue-300 shadow-xs"
                    : "bg-blue-50 border border-blue-200 text-blue-700 shadow-xs"
                  : isDark
                    ? "bg-zinc-800/80 border border-zinc-700/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                    : "bg-zinc-100 border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          >
            {isDone ? (
              <Check
                className={`size-3 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                strokeWidth={2.5}
              />
            ) : isDoing ? (
              <span
                className={`size-1.5 rounded-full ${
                  isDark ? "bg-blue-400" : "bg-blue-600"
                } animate-pulse`}
              />
            ) : (
              <span
                className={`size-1.5 rounded-full ${
                  isDark ? "bg-zinc-500" : "bg-zinc-400"
                }`}
              />
            )}
            <span>{isDone ? "Done" : isDoing ? "In Progress" : "Todo"}</span>
          </button>

          {/* Quick-Spawn Connector handle (+) */}
          <button
            type="button"
            title="Add connected task (→)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onSpawnNextTask}
            className={`size-5 rounded-full border flex items-center justify-center transition-all ${
              isDark
                ? "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-400 hover:text-white"
                : "bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <Plus className="size-3" />
          </button>
        </div>
      </div>
    </HTMLContainer>
  );
}

import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
} from "@tldraw/tlschema";
import { Check, GripVertical, PlayCircle, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEventHandler,
  type MouseEvent,
} from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  resizeBox,
  T,
  TLBaseShape,
  useEditor,
  useValue,
  type TLPageId,
  type TLResizeInfo,
  type TLShapePartial,
  type TLShapeId,
} from "tldraw";
import { getCachedAppSettings } from "../../lib/appSettingsCache";
import { playFocusBlockEndFeedback } from "../../lib/focusSessionFeedback";
import { taskPaperForEisenhowerQuadrant } from "../../lib/focusGridQuadrantTheme";
import {
  snapTaskToPriorityGrid,
  snapTaskToTimelines,
} from "../../lib/focusSnap";
import {
  DEFAULT_TASK_CARD_H,
  DEFAULT_TASK_CARD_W,
  MIN_TASK_H,
  MIN_TASK_W,
} from "../../lib/focusTaskDimensions";
import {
  finishFocusTimerLinkedToTask,
  finishTaskFocusSession,
  formatTrackedMs,
  getTodayMsFromLog,
  isTaskSessionActive,
  startTaskFocusSession,
  stopTaskFocusSession,
  todayKey,
  type TrackedDayEntry,
} from "../../lib/focusTime";

/** Four sticky-note themes with tuned foregrounds for readable text */
export type TaskPaperTheme = "cream" | "fog" | "bloom" | "sage";

/** @deprecated Use TaskPaperTheme */
export type StickyPaper = TaskPaperTheme;

const focusTaskVersions = createShapePropsMigrationIds("focus-task", {
  AddStickyNoteFields: 1,
  PaperToFourThemes: 2,
  AddTrackedMs: 3,
  AddTrackedDayLogAndSession: 4,
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
  }
>;

type PriorityLevel = 1 | 2 | 3 | 4;

const PRIORITY_LABEL: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

const STATUS_LABEL: Record<TLFocusTaskShape["props"]["status"], string> = {
  open: "Open",
  doing: "In progress",
  done: "Done",
};

function formatFloatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Solid fills for the priority-only circle (low → urgent). */
const PRIORITY_DOT: Record<PriorityLevel, string> = {
  4: "#4ade80",
  3: "#a8a29e",
  2: "#38bdf8",
  1: "#fb7185",
};

/** Low → … → urgent → low (matches sketch “cycle”). */
const PRIORITY_CYCLE_ORDER: readonly PriorityLevel[] = [4, 3, 2, 1];

function clampPriority(n: number): PriorityLevel {
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 3;
}

function nextPriority(p: number): PriorityLevel {
  const c = clampPriority(p);
  const i = PRIORITY_CYCLE_ORDER.indexOf(c);
  const next =
    PRIORITY_CYCLE_ORDER[(i === -1 ? 0 : i + 1) % PRIORITY_CYCLE_ORDER.length];
  return next;
}

/** Card chrome follows priority; `paper` is kept on the record for migrations only. */
const PRIORITY_THEME: Record<PriorityLevel, TaskPaperTheme> = {
  4: "sage",
  3: "cream",
  2: "fog",
  1: "bloom",
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

/** Four task card color themes — pastels with contrast-safe foregrounds */
export const STICKY_PAPER: Record<TaskPaperTheme, TaskPaperTokens> = {
  cream: {
    shell: "#faf8f3",
    meta: "#f0ebe3",
    metaBorder: "rgb(0 0 0 / 7%)",
    note: "#fffef9",
    noteBorder: "rgb(120 100 70 / 14%)",
    fg: "#1c1917",
    muted: "#78716c",
    noteFg: "#44403c",
    notePlaceholder: "#a8a29e",
  },
  fog: {
    shell: "#eef4f8",
    meta: "#e4edf4",
    metaBorder: "rgb(30 58 95 / 10%)",
    note: "#f7fafc",
    noteBorder: "rgb(70 100 130 / 16%)",
    fg: "#0f172a",
    muted: "#64748b",
    noteFg: "#334155",
    notePlaceholder: "#94a3b8",
  },
  bloom: {
    shell: "#fdf2f4",
    meta: "#fce8ec",
    metaBorder: "rgb(136 19 55 / 10%)",
    note: "#fff8fa",
    noteBorder: "rgb(190 100 120 / 18%)",
    fg: "#4a0418",
    muted: "#9d4b5e",
    noteFg: "#500724",
    notePlaceholder: "#c0849a",
  },
  sage: {
    shell: "#f0f7f2",
    meta: "#e3efe6",
    metaBorder: "rgb(20 83 45 / 10%)",
    note: "#f6fbf7",
    noteBorder: "rgb(60 120 80 / 16%)",
    fg: "#14532d",
    muted: "#3f6212",
    noteFg: "#166534",
    notePlaceholder: "#86a88a",
  },
};

function paletteForPriority(p: number): TaskPaperTokens {
  const theme = PRIORITY_THEME[clampPriority(p)];
  return STICKY_PAPER[theme];
}

/** Shell background for a task priority (e.g. list / previews). */
export function focusTaskShellColorForPriority(priority: number): string {
  return paletteForPriority(priority).shell;
}

/** Short label for toolbar / HUD (Urgent, High, Normal, Low). */
export function getFocusTaskPriorityLabel(priority: number): string {
  return PRIORITY_LABEL[clampPriority(priority)];
}

function ingestDropPayload(dt: DataTransfer): {
  text: string;
  fileNames: string[];
} {
  const fileNames: string[] = [];
  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) fileNames.push(dt.files[i].name);
  }
  let text = dt.getData("text/plain") ?? "";
  if (!text.trim()) {
    const uri = dt.getData("text/uri-list");
    if (uri)
      text =
        uri
          .split("\n")
          .find((l) => l.trim() && !l.startsWith("#"))
          ?.trim() ?? "";
  }
  return { text: text.trim(), fileNames };
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
  };

  override getDefaultProps(): TLFocusTaskShape["props"] {
    return {
      w: DEFAULT_TASK_CARD_W,
      h: DEFAULT_TASK_CARD_H,
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
      minWidth: MIN_TASK_W,
      minHeight: MIN_TASK_H,
    });
  }

  override onTranslateEnd(
    _initial: TLFocusTaskShape,
    current: TLFocusTaskShape,
  ): TLShapePartial<TLFocusTaskShape> | void {
    const grid = snapTaskToPriorityGrid(this.editor, current.id);
    if (grid) {
      return {
        id: current.id,
        type: "focus-task",
        x: grid.x,
        y: grid.y,
        props: {
          ...current.props,
          w: grid.w,
          h: grid.h,
          paper: taskPaperForEisenhowerQuadrant(grid.quadrant),
        },
      };
    }
    const snapped = snapTaskToTimelines(this.editor, current.id);
    if (!snapped) return;
    return {
      id: current.id,
      type: "focus-task",
      x: snapped.x,
      y: snapped.y,
    };
  }

  override onResizeEnd(
    _initial: TLFocusTaskShape,
    current: TLFocusTaskShape,
  ): TLShapePartial<TLFocusTaskShape> | void {
    const grid = snapTaskToPriorityGrid(this.editor, current.id);
    if (!grid) return;
    return {
      id: current.id,
      type: "focus-task",
      x: grid.x,
      y: grid.y,
      props: {
        ...current.props,
        w: grid.w,
        h: grid.h,
        paper: taskPaperForEisenhowerQuadrant(grid.quadrant),
      },
    };
  }

  override component(shape: TLFocusTaskShape) {
    return <FocusTaskBody shape={shape} />;
  }

  override indicator(shape: TLFocusTaskShape) {
    return (
      <rect width={shape.props.w} height={shape.props.h} rx={20} ry={20} />
    );
  }
}

function FocusTaskBody({ shape }: { shape: TLFocusTaskShape }) {
  const editor = useEditor();
  const isSelected = useValue(
    "task selected",
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );

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

  const toggleDone = useCallback(() => {
    if (shape.props.status === "done") {
      update({ status: "open" });
      return;
    }
    if (isTaskSessionActive(shape.props)) {
      finishTaskFocusSession(editor, shape.id, "partial", "done");
      return;
    }
    finishFocusTimerLinkedToTask(editor, shape.id);
    const fresh = editor.getShape(shape.id) as TLFocusTaskShape | undefined;
    if (!fresh) return;
    editor.updateShape({
      id: shape.id,
      type: "focus-task",
      props: { ...fresh.props, status: "done" },
    });
  }, [editor, shape.id, shape.props, update]);

  const onDeleteTask = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isTaskSessionActive(shape.props)) {
        finishTaskFocusSession(editor, shape.id, "partial");
      }
      finishFocusTimerLinkedToTask(editor, shape.id);
      editor.deleteShapes([shape.id]);
    },
    [editor, shape.id, shape.props],
  );

  const isDone = shape.props.status === "done";
  const isDoing = shape.props.status === "doing";
  const sessionActive = isTaskSessionActive(shape.props);

  const linkedTimerMeta = useValue(
    "linked focus-timer for task total",
    () => {
      const idStr = shape.id as string;
      for (const page of editor.getPages()) {
        const walk = (
          pid: TLPageId | TLShapeId,
        ): { started: number; presetMs: number } | null => {
          for (const id of editor.getSortedChildIdsForParent(pid)) {
            const s = editor.getShape(id);
            if (!s) continue;
            if (s.type === "focus-timer") {
              const p = s.props as {
                running: boolean;
                linkedTaskId: string;
                sessionStartedAt: number | null;
                durationPreset: number;
              };
              if (p.running && p.linkedTaskId === idStr) {
                const presetMs = p.durationPreset * 60 * 1000;
                const started = p.sessionStartedAt ?? Date.now();
                return { started, presetMs };
              }
            }
            const inner = walk(id);
            if (inner) return inner;
          }
          return null;
        };
        const hit = walk(page.id);
        if (hit) return hit;
      }
      return null;
    },
    [editor, shape.id],
  );

  const [tick, setTick] = useState(0);
  const sessionCompleteRef = useRef(false);

  useEffect(() => {
    if (!sessionActive) {
      sessionCompleteRef.current = false;
    }
    if (!sessionActive && !linkedTimerMeta) {
      return;
    }
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [
    sessionActive,
    linkedTimerMeta?.started,
    linkedTimerMeta?.presetMs,
    shape.props.focusEndAt,
    shape.props.focusSessionStartedAt,
  ]);

  useEffect(() => {
    sessionCompleteRef.current = false;
  }, [shape.props.focusSessionStartedAt]);

  const sessionRemainingMs = useMemo(() => {
    void tick;
    if (!shape.props.focusEndAt || !shape.props.focusSessionStartedAt) return 0;
    return Math.max(0, shape.props.focusEndAt - Date.now());
  }, [tick, shape.props.focusEndAt, shape.props.focusSessionStartedAt]);

  useEffect(() => {
    if (!shape.props.focusSessionStartedAt || !shape.props.focusEndAt) return;
    if (sessionRemainingMs > 0) return;
    if (sessionCompleteRef.current) return;
    sessionCompleteRef.current = true;
    finishTaskFocusSession(editor, shape.id, "full");
    playFocusBlockEndFeedback("task");
  }, [
    editor,
    shape.id,
    sessionRemainingMs,
    shape.props.focusEndAt,
    shape.props.focusSessionStartedAt,
  ]);

  const onPlayFocus = () => {
    if (isDone) return;
    if (sessionActive) {
      stopTaskFocusSession(editor, shape.id);
      return;
    }
    startTaskFocusSession(
      editor,
      shape.id,
      shape.props.focusPresetMin ?? getCachedAppSettings().defaultFocusMinutes,
    );
  };

  const todayMs = getTodayMsFromLog(shape.props.trackedDayLog, todayKey());
  const totalMs = shape.props.trackedMs ?? 0;

  const liveTotalMs = useMemo(() => {
    void tick;
    let extra = 0;
    if (sessionActive && shape.props.focusSessionStartedAt != null) {
      const presetMs =
        (shape.props.focusPresetMin ?? getCachedAppSettings().defaultFocusMinutes) *
        60 *
        1000;
      extra += Math.min(
        Math.max(0, Date.now() - shape.props.focusSessionStartedAt),
        presetMs,
      );
    }
    if (linkedTimerMeta) {
      extra += Math.min(
        Math.max(0, Date.now() - linkedTimerMeta.started),
        linkedTimerMeta.presetMs,
      );
    }
    return totalMs + extra;
  }, [
    tick,
    totalMs,
    sessionActive,
    shape.props.focusSessionStartedAt,
    shape.props.focusPresetMin,
    linkedTimerMeta,
  ]);

  const dim = shape.props.blocked;
  const prio = clampPriority(shape.props.priority);
  const pal = paletteForPriority(shape.props.priority);

  const [dropHighlight, setDropHighlight] = useState(false);

  const contentScale = useMemo(() => {
    const sx = shape.props.w / DEFAULT_TASK_CARD_W;
    const sy = shape.props.h / DEFAULT_TASK_CARD_H;
    const s = Math.min(sx, sy);
    // Keep the card usable at extreme sizes; prevents divide-by-zero too.
    return Math.max(0.5, Math.min(2.5, Number.isFinite(s) ? s : 1));
  }, [shape.props.h, shape.props.w]);

  /** Legacy: fold `notes` into the single body field once. */
  useEffect(() => {
    const rawNotes = shape.props.notes?.trim();
    if (!rawNotes) return;
    const t = shape.props.title ?? "";
    const merged = t.trim() ? `${t.trim()}\n\n${rawNotes}` : rawNotes;
    editor.updateShape({
      id: shape.id,
      type: "focus-task",
      props: { ...shape.props, title: merged, notes: "" },
    });
  }, [editor, shape.id, shape.props.notes, shape.props.title]);

  const onDragEnter: DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDropHighlight(true);
  }, []);

  const onDragLeave: DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const rt = e.relatedTarget as Node | null;
    if (rt && e.currentTarget.contains(rt)) return;
    setDropHighlight(false);
  }, []);

  const onDragOver: DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop: DragEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDropHighlight(false);

      const { text, fileNames } = ingestDropPayload(e.dataTransfer);
      const parts: string[] = [];
      if (text) parts.push(text);
      if (fileNames.length) parts.push(fileNames.join("\n"));
      if (!parts.length) return;

      const block = parts.join("\n\n");
      const cur = shape.props.title?.trim() ?? "";
      const nextTitle = cur ? `${cur}\n\n${block}` : block;
      update({ title: nextTitle });
      requestAnimationFrame(() => {
        const root = document.getElementById(shape.id);
        root
          ?.querySelector<HTMLTextAreaElement>(".focus-task-content")
          ?.focus();
      });
    },
    [update, shape.props.title],
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
        className="focus-task-shell-wrap"
        data-selected={isSelected}
        data-priority={prio}
        data-drop-target={dropHighlight ? "true" : undefined}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          opacity: dim ? 0.88 : 1,
          ["--task-fg" as string]: pal.fg,
          ["--task-muted" as string]: pal.muted,
          ["--task-note-fg" as string]: pal.noteFg,
          ["--task-note-placeholder" as string]: pal.notePlaceholder,
          ["--task-note-surface" as string]: pal.note,
        }}
      >
        <div
          style={{
            transform: `scale(${contentScale})`,
            transformOrigin: "top left",
            width: shape.props.w / contentScale,
            height: shape.props.h / contentScale,
          }}
        >
          {sessionActive ? (
            <div
              className="focus-task-float-timer"
              aria-live="polite"
              title="Focus session on this card"
            >
              {formatFloatCountdown(sessionRemainingMs)}
            </div>
          ) : null}
          <div
            className="focus-task-shell"
            style={{
              background: pal.shell,
              color: pal.fg,
            }}
          >
            <div className="focus-task-top">
              <button
                type="button"
                className="focus-task-handle"
                title="Drag card"
                aria-label="Drag to move task"
              >
                <GripVertical
                  className="size-[18px]"
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              <div
                className="focus-task-top-center"
                aria-live={sessionActive || linkedTimerMeta ? "polite" : undefined}
              >
                {liveTotalMs > 0 || sessionActive || linkedTimerMeta
                  ? formatTrackedMs(liveTotalMs)
                  : ""}
              </div>
              <div className="focus-task-top-actions">
                {!isDone ? (
                  <button
                    type="button"
                    className="focus-task-round-btn focus-task-round-btn--ghost"
                    data-active={sessionActive || isDoing}
                    title={
                      sessionActive
                        ? "Stop focus session"
                        : "Start focus session (Pomodoro on this card)"
                    }
                    aria-label={
                      sessionActive ? "Stop focus session" : "Start focus session"
                    }
                    aria-pressed={sessionActive}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayFocus();
                    }}
                  >
                    <PlayCircle
                      className="size-[16px]"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="focus-task-round-btn focus-task-round-btn--delete"
                  title="Delete task"
                  aria-label="Delete task"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onDeleteTask}
                >
                  <Trash2
                    className="size-[14px]"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </button>
              </div>
            </div>

            <div
              className="focus-task-status-row"
              aria-label="Status and tracked focus time"
            >
              <span
                className="focus-task-status-chip"
                data-status={shape.props.status}
              >
                {STATUS_LABEL[shape.props.status]}
              </span>
            </div>

            <div className="focus-task-body">
              {shape.props.carried ? (
                <div className="focus-task-carried-row">
                  <span className="focus-task-carried">Carried</span>
                </div>
              ) : null}
              <textarea
                className="focus-task-content"
                placeholder="Write something…"
                value={shape.props.title}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => update({ title: e.target.value })}
                style={{
                  textDecoration: isDone ? "line-through" : undefined,
                  color: isDone ? pal.muted : undefined,
                }}
              />

              {/* <label className="focus-task-blocked-row" onPointerDown={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={shape.props.blocked}
                onChange={(e) => update({ blocked: e.target.checked })}
                style={{ accentColor: pal.muted }}
              />
              <span>Blocked</span>
            </label>
            {shape.props.blocked ? (
              <input
                className="focus-task-blocked-input"
                placeholder="e.g. waiting on review"
                value={shape.props.blockedReason}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => update({ blockedReason: e.target.value })}
              />
            ) : null} */}
            </div>

            <div className="focus-task-footer">
              <button
                type="button"
                className="focus-task-prio-cycle"
                title={`${PRIORITY_LABEL[prio]} — click to cycle`}
                aria-label={`${PRIORITY_LABEL[prio]}, click to cycle priority`}
                style={{ backgroundColor: PRIORITY_DOT[prio] }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  update({ priority: nextPriority(shape.props.priority) });
                }}
              />
              <button
                type="button"
                className="focus-task-round-btn focus-task-round-btn--done"
                data-done={isDone}
                title={isDone ? "Mark as not done" : "Mark done"}
                aria-label={isDone ? "Mark as not done" : "Mark done"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDone();
                }}
              >
                <Check className="size-[16px]" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </HTMLContainer>
  );
}

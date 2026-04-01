import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createFocusTask } from "@/lib/focusActions";
import { getReflectionHistory } from "@/lib/focusMeta";
import { insertDayTemplate } from "@/lib/focusTemplate";
import {
  formatTrackedMs,
  formatTrackedMsShort,
  getTodayMsFromLog,
  sumTodayMsForDocument,
  sumTrackedMsForBoard,
  todayKey,
} from "@/lib/focusTime";
import { findActiveFocusHud } from "@/lib/focusTimerQueries";
import {
  focusTaskShellColorForPriority,
  getFocusTaskPriorityLabel,
} from "@/shapes";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";
import {
  Calendar,
  ChevronRight,
  Grid2X2,
  List,
  Minus,
  PanelRight,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  useEditor,
  useValue,
  type Editor,
  type TLShapeId,
  type TLUiOverrides,
} from "tldraw";

const STATUS_HEX: Record<TLFocusTaskShape["props"]["status"], string> = {
  open: "#64748b",
  doing: "#2563eb",
  done: "#16a34a",
};

function getViewportCenter(editor: Editor) {
  const b = editor.getViewportPageBounds();
  return { x: b.center.x - 110, y: b.center.y - 44 };
}

function formatHudRemaining(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Shown in tooltips next to “new task at center” actions. */
function addTaskAtCenterShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl+Shift+N";
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
    ? "⌘⇧N"
    : "Ctrl+Shift+N";
}

const focusToolTranslations = {
  "tool.focus-task": "Task card",
  "tool.focus-timeline": "Timeline",
  "tool.focus-inbox": "Inbox zone",
  "tool.focus-priority-grid": "Priority grid",
  "tool.focus-timer": "Focus timer",
  "tool.focus-energy": "Energy",
  "tool.focus-reflection": "Reflection",
  "tool.focus-swimlane": "Swimlane",
} as const;

/** Merged into tldraw `translations.en` (tools + page menu wording). */
export const focusUiTranslations = {
  ...focusToolTranslations,
  "page-menu.title": "Foqz boards",
  "page-menu.create-new-page": "Create new board",
  "page-menu.max-page-count-reached": "Max boards reached",
  "page-menu.new-page-initial-name": "Foqz Board 1",
  "page-menu.go-to-page": "Go to board",
} as const;

export function buildFocusToolsOverride(): TLUiOverrides["tools"] {
  return (editor, tools) => {
    const base = { ...tools } as Record<string, (typeof tools)[string]>;
    delete base.laser;

    const add = (
      id: string,
      label: keyof typeof focusToolTranslations,
      icon: string,
      kbd?: string,
    ) => ({
      id,
      label: label as "tool.select",
      icon: icon as "tool-note",
      kbd,
      onSelect() {
        editor.setCurrentTool(id);
      },
    });

    return {
      ...base,
      "focus-task": add(
        "focus-task",
        "tool.focus-task",
        "tool-note",
        "shift+t",
      ),
      "focus-timeline": add(
        "focus-timeline",
        "tool.focus-timeline",
        "tool-line",
      ),
      "focus-inbox": add("focus-inbox", "tool.focus-inbox", "tool-frame"),
      "focus-priority-grid": add(
        "focus-priority-grid",
        "tool.focus-priority-grid",
        "tool-frame",
      ),
      "focus-timer": add("focus-timer", "tool.focus-timer", "geo-ellipse"),
      "focus-energy": add("focus-energy", "tool.focus-energy", "tool-media"),
      "focus-reflection": add(
        "focus-reflection",
        "tool.focus-reflection",
        "tool-note",
      ),
      "focus-swimlane": add(
        "focus-swimlane",
        "tool.focus-swimlane",
        "tool-line",
      ),
    };
  };
}

type FocusEditorUiProps = {
  /** Portal target in the app header (`.focus-top-dock-slot`) for the main dock. */
  dockHost: HTMLDivElement | null;
};

export function FocusEditorUi({ dockHost }: FocusEditorUiProps) {
  const editor = useEditor();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [taskFilter, setTaskFilter] = useState<
    "all" | "open" | "doing" | "done"
  >("all");

  const tasks = useValue(
    "focus tasks",
    () =>
      editor
        .getCurrentPageShapes()
        .filter((s): s is TLFocusTaskShape => s.type === "focus-task"),
    [editor],
  );

  const filteredTasks =
    taskFilter === "all"
      ? tasks
      : tasks.filter((t) => t.props.status === taskFilter);

  const activeHud = useValue(
    "active focus hud",
    () => findActiveFocusHud(editor),
    [editor],
  );

  const anyTimerRunning = activeHud != null;

  const [hudTick, setHudTick] = useState(0);
  useEffect(() => {
    if (!activeHud) return;
    const id = window.setInterval(() => setHudTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeHud?.kind, activeHud?.shape.id]);

  const boardTrackedMs = useValue(
    "board tracked total",
    () => sumTrackedMsForBoard(editor),
    [editor],
  );

  const todayTrackedMs = useValue(
    "document today tracked",
    () => sumTodayMsForDocument(editor),
    [editor],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyN") {
        e.preventDefault();
        createFocusTask(editor, getViewportCenter(editor), "New task");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  useEffect(() => {
    const syncTray = () => {
      const pageTasks = editor
        .getCurrentPageShapes()
        .filter((s): s is TLFocusTaskShape => s.type === "focus-task");
      const next =
        pageTasks.find((t) => t.props.status === "doing") ??
        pageTasks.find((t) => t.props.status === "open");
      const hud = findActiveFocusHud(editor);
      const todayMs = sumTodayMsForDocument(editor);
      const boardMs = sumTrackedMsForBoard(editor);
      const parts: string[] = [];
      if (hud) {
        const end =
          hud.kind === "timer"
            ? hud.shape.props.endAt
            : hud.shape.props.focusEndAt;
        if (end) {
          const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
          const m = Math.floor(left / 60);
          const s = left % 60;
          parts.push(`Focus ${m}:${s.toString().padStart(2, "0")} left`);
        }
      }
      if (todayMs > 0) parts.push(`${formatTrackedMsShort(todayMs)} today`);
      if (boardMs > 0) parts.push(`${formatTrackedMsShort(boardMs)} all-time`);
      parts.push("Foqz");
      let tip = parts.join(" · ");
      if (next) tip = `${tip} — ${next.props.title.slice(0, 36)}`;
      void window.focusStore?.setTrayTooltip?.(tip);
    };
    syncTray();
    const id = window.setInterval(syncTray, 1000);
    return () => window.clearInterval(id);
  }, [editor]);

  const addTaskFromQuickCapture = useCallback(() => {
    const t = quickText.trim();
    if (!t) return;
    const p = getViewportCenter(editor);
    createFocusTask(editor, p, t);
    setQuickText("");
  }, [editor, quickText]);

  const runPaletteAction = useCallback(
    (action: string) => {
      setPaletteOpen(false);
      const center = getViewportCenter(editor);
      switch (action) {
        case "add-task":
          createFocusTask(editor, center, "New task");
          break;
        case "start-day":
          insertDayTemplate(editor);
          break;
        case "select":
          editor.setCurrentTool("select");
          break;
        case "arrow":
          editor.setCurrentTool("arrow");
          break;
        default:
          break;
      }
    },
    [editor],
  );

  const reflections = useMemo(
    () => getReflectionHistory().slice(0, 8),
    [sidebarOpen, paletteOpen],
  );

  const tryBarAddTask = useCallback(() => {
    createFocusTask(editor, getViewportCenter(editor), "New task");
  }, [editor]);

  const tryBarDeleteSelection = useCallback(() => {
    const ids = editor.getSelectedShapeIds();
    if (ids.length === 0) return;
    editor.deleteShapes(ids);
  }, [editor]);

  const tryBarZoomFit = useCallback(() => {
    editor.zoomToFit({ animation: { duration: 220 } });
  }, [editor]);

  const tryBarResetZoom = useCallback(() => {
    editor.resetZoom(editor.getViewportScreenCenter(), {
      animation: { duration: 200 },
    });
  }, [editor]);

  const hudRemainingMs = (() => {
    void hudTick;
    if (!activeHud) return 0;
    if (activeHud.kind === "timer") {
      if (!activeHud.shape.props.running || !activeHud.shape.props.endAt)
        return 0;
      return Math.max(0, activeHud.shape.props.endAt - Date.now());
    }
    const end = activeHud.shape.props.focusEndAt;
    if (!end) return 0;
    return Math.max(0, end - Date.now());
  })();

  const sliceHudTitle = (raw: string | undefined, max = 28) => {
    const t = raw?.trim() ?? "";
    if (!t) return "";
    return t.length > max ? `${t.slice(0, max)}…` : t;
  };

  const tryBarHudLine = useMemo(() => {
    if (!activeHud) return null;
    const time = formatHudRemaining(hudRemainingMs);
    if (activeHud.kind === "task") {
      const prio = getFocusTaskPriorityLabel(activeHud.shape.props.priority);
      const title = sliceHudTitle(activeHud.shape.props.title) || "Task";
      return `[${prio}] ${time} - ${title}`;
    }
    const link = activeHud.shape.props.linkedTaskId?.trim();
    if (link) {
      const t = editor.getShape(link as TLShapeId) as
        | TLFocusTaskShape
        | undefined;
      if (t?.type === "focus-task") {
        const prio = getFocusTaskPriorityLabel(t.props.priority);
        const title = sliceHudTitle(t.props.title) || "Task";
        return `[${prio}] ${time} - ${title}`;
      }
    }
    return `${time} - Timer`;
  }, [activeHud, editor, hudRemainingMs]);

  const jumpToRunningTimer = useCallback(() => {
    if (!activeHud) return;
    const pageId = editor.getAncestorPageId(activeHud.shape.id);
    if (pageId) editor.setCurrentPage(pageId);
    editor.select(activeHud.shape.id);
    editor.zoomToSelection({ animation: { duration: 220 } });
  }, [editor, activeHud]);

  return (
    <>
      {anyTimerRunning ? (
        <div
          className="focus-timer-dim"
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.08)",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {sidebarOpen ? (
        <aside
          className="focus-sidebar p-3 text-xs text-foreground ml-3"
          style={{
            overflow: "auto",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="focus-board-tracked-label text-[10px] text-foreground">
              Tasks
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 text-[11px] opacity-80 hover:opacity-100"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="focus-sidebar-inset">
            <div className="flex flex-wrap gap-1">
              {(["all", "open", "doing", "done"] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant={taskFilter === f ? "default" : "outline"}
                  onClick={() => setTaskFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
          <ul className="space-y-1">
            {filteredTasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="focus-sidebar-task-row"
                  onClick={() => {
                    editor.select(t.id);
                    editor.zoomToSelection({ animation: { duration: 200 } });
                  }}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      title="Priority color"
                      className="inline-block size-3 shrink-0 rounded-md shadow-sm ring-1 ring-black/10"
                      style={{
                        background: focusTaskShellColorForPriority(
                          t.props.priority,
                        ),
                      }}
                    />
                    <span
                      title={t.props.status}
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_HEX[t.props.status] }}
                    />
                    {t.props.title}
                  </span>
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
                    <span style={{ color: STATUS_HEX[t.props.status] }}>
                      {t.props.status}
                    </span>
                    {" · "}P{t.props.priority}
                    {t.props.estimate ? ` · ${t.props.estimate}` : ""}
                    {` · ${formatTrackedMs(getTodayMsFromLog(t.props.trackedDayLog, todayKey()))} today`}
                    {(t.props.trackedMs ?? 0) > 0
                      ? ` · ${formatTrackedMs(t.props.trackedMs)} total`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {reflections.length ? (
            <>
              <div className="mt-4 font-semibold">Reflection history</div>
              <ul className="text-muted-foreground mt-1 space-y-1 text-[11px]">
                {reflections.map((r, i) => (
                  <li key={i}>
                    {r.date}: {r.score}/5 — {r.text.slice(0, 80)}
                    {r.text.length > 80 ? "…" : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      ) : null}

      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        label="Commands"
        loop
      >
        <div className="focus-command-input-shell">
          <p className="focus-command-hint">Commands · ⌘K</p>
          <CommandInput placeholder="Filter commands…" />
        </div>
        <CommandList>
          <CommandEmpty>No matching commands.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem
              value="add-task"
              keywords={["task", "new", "create"]}
              onSelect={() => runPaletteAction("add-task")}
              className="py-4 rounded-xl"
            >
              <List className="size-4" />
              New Task ({addTaskAtCenterShortcutLabel()})
            </CommandItem>
            <CommandItem
              value="priority-grid"
              keywords={["grid", "priority", "template", "day"]}
              onSelect={() => runPaletteAction("start-day")}
              className="py-4 rounded-xl"
            >
              <Grid2X2 className="size-4" />
              New Priority Grid
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {dockHost
        ? createPortal(
            <div className="focus-floating-panel focus-floating-panel--topbar">
              <div className="focus-dock-row justify-center">
                <div className="focus-dock-actions">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    title="Task list"
                    aria-label="Task list"
                    aria-pressed={sidebarOpen}
                    onClick={() => setSidebarOpen((v) => !v)}
                  >
                    <PanelRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    title="Commands (⌘K)"
                    aria-label="Commands"
                    onClick={() => setPaletteOpen(true)}
                  >
                    <Search className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="focus-quick-capture">
                <div className="focus-quick-field">
                  <Input
                    variant="glass"
                    className="min-w-0 flex-1"
                    placeholder="Quick capture — Enter to add"
                    value={quickText}
                    onChange={(e) => setQuickText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTaskFromQuickCapture();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    className="focus-quick-add"
                    aria-label="Add task"
                    title="Add task"
                    onClick={addTaskFromQuickCapture}
                  >
                    <Plus className="size-4" strokeWidth={2.25} />
                  </Button>
                </div>
              </div>

              <div
                className="focus-board-tracked-row"
                title="Sums all task cards on every board in this file (local calendar day for Today)"
              >
                <div className="focus-board-tracked-main">
                  <span className="focus-board-tracked-label">Today</span>
                  <span className="focus-board-tracked-value focus-board-tracked-value--primary">
                    {formatTrackedMs(todayTrackedMs)}
                  </span>
                </div>
                <div className="focus-board-tracked-main">
                  <span className="focus-board-tracked-label">All time</span>
                  <span className="focus-board-tracked-value">
                    {formatTrackedMs(boardTrackedMs)}
                  </span>
                </div>
              </div>

              <div className="focus-try-bar-wrap" aria-label="Quick actions">
                <nav className="focus-try-bar">
                  {activeHud && tryBarHudLine ? (
                    <button
                      type="button"
                      className="focus-try-bar-timer"
                      title="Focus session — click to show on canvas"
                      aria-label={`Focus ${tryBarHudLine}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToRunningTimer();
                      }}
                    >
                      <span className="focus-try-bar-timer__dot" aria-hidden />
                      <span className="focus-try-bar-timer__line tabular-nums">
                        {tryBarHudLine}
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="focus-try-btn"
                    title={`New task at viewport center (${addTaskAtCenterShortcutLabel()})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      tryBarAddTask();
                    }}
                  >
                    <Plus className="size-[18px]" strokeWidth={2.25} />
                  </button>
                  <button
                    type="button"
                    className="focus-try-btn"
                    data-variant="danger"
                    title="Delete selected shapes (cannot undo from here)"
                    onClick={(e) => {
                      e.stopPropagation();
                      tryBarDeleteSelection();
                    }}
                  >
                    <Minus className="size-[18px]" strokeWidth={2.25} />
                  </button>
                  <Popover>
                    <PopoverTrigger
                      type="button"
                      className="focus-try-btn focus-try-calendar"
                      title={`Today ${formatTrackedMs(todayTrackedMs)} · All time ${formatTrackedMs(boardTrackedMs)} — open for zoom & tasks`}
                    >
                      <Calendar
                        className="size-[18px] opacity-70"
                        strokeWidth={2}
                      />
                      <span className="focus-try-day">
                        {new Date().getDate()}
                      </span>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="center"
                      className="flex min-w-[200px] flex-col gap-2 p-3 text-xs"
                    >
                      <div className="text-muted-foreground border-b border-border pb-2 text-[11px] leading-snug">
                        <div className="text-foreground font-semibold">
                          Today hub
                        </div>
                        <div className="mt-1">
                          Today {formatTrackedMs(todayTrackedMs)} · All time{" "}
                          {formatTrackedMs(boardTrackedMs)}
                        </div>
                        <div className="mt-0.5 opacity-90">
                          Calendar shows today’s date; zoom and task list.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={(e) => {
                          e.stopPropagation();
                          tryBarZoomFit();
                        }}
                      >
                        Zoom to fit canvas
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSidebarOpen(true);
                        }}
                      >
                        Tasks
                      </Button>
                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    className="focus-try-btn"
                    title="Reset zoom to 100%"
                    onClick={(e) => {
                      e.stopPropagation();
                      tryBarResetZoom();
                    }}
                  >
                    <ChevronRight className="size-[18px]" strokeWidth={2.25} />
                  </button>
                </nav>
              </div>
            </div>,
            dockHost,
          )
        : null}
    </>
  );
}

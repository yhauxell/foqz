import { getCachedAppSettings } from "@/lib/appSettingsCache";
import type { Editor, TLPageId, TLShapeId } from "tldraw";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";
import type { TLFocusTimerShape } from "@/shapes/focusTimer/FocusTimerShapeUtil";

export type TrackedDayEntry = { day: string; ms: number };

const MAX_DAY_ENTRIES = 90;

function walkShapes(
  editor: Editor,
  parentId: TLPageId | TLShapeId,
  fn: (t: TLFocusTaskShape) => void,
) {
  for (const id of editor.getSortedChildIdsForParent(parentId)) {
    const s = editor.getShape(id);
    if (!s) continue;
    if (s.type === "focus-task") fn(s as TLFocusTaskShape);
    walkShapes(editor, id, fn);
  }
}

/** Avoid importing `focusTimerQueries` (would circularly load timer util → this file). */
function findRunningFocusTimerId(editor: Editor): TLShapeId | null {
  for (const page of editor.getPages()) {
    const walk = (pid: TLPageId | TLShapeId): TLShapeId | null => {
      for (const id of editor.getSortedChildIdsForParent(pid)) {
        const s = editor.getShape(id);
        if (!s) continue;
        if (
          s.type === "focus-timer" &&
          (s as TLFocusTimerShape).props.running &&
          (s as TLFocusTimerShape).props.endAt
        )
          return id;
        const inner = walk(id);
        if (inner) return inner;
      }
      return null;
    };
    const hit = walk(page.id);
    if (hit) return hit;
  }
  return null;
}

/** Local calendar day `YYYY-MM-DD`. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mergeDayLog(
  log: TrackedDayEntry[] | undefined,
  day: string,
  deltaMs: number,
): TrackedDayEntry[] {
  const d = Math.round(deltaMs);
  if (d <= 0) return log ?? [];
  const next = [...(log ?? [])];
  const i = next.findIndex((e) => e.day === day);
  if (i >= 0) next[i] = { day, ms: next[i].ms + d };
  else next.push({ day, ms: d });
  next.sort((a, b) => a.day.localeCompare(b.day));
  while (next.length > MAX_DAY_ENTRIES) next.shift();
  return next;
}

export function getTodayMsFromLog(
  log: TrackedDayEntry[] | undefined,
  day = todayKey(),
): number {
  if (!log?.length) return 0;
  return log.find((e) => e.day === day)?.ms ?? 0;
}

/** Sum `trackedMs` for every focus-task on every board (page) in the document. */
export function sumTrackedMsForBoard(editor: Editor): number {
  let sum = 0;
  for (const page of editor.getPages()) {
    walkShapes(editor, page.id, (t) => {
      sum += t.props.trackedMs ?? 0;
    });
  }
  return sum;
}

/** Sum today's credited ms across all task cards (local day). */
export function sumTodayMsForDocument(editor: Editor, day = todayKey()): number {
  let sum = 0;
  for (const page of editor.getPages()) {
    walkShapes(editor, page.id, (t) => {
      sum += getTodayMsFromLog(t.props.trackedDayLog, day);
    });
  }
  return sum;
}

export function formatTrackedMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalM = Math.floor(ms / 60000);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  const s = Math.floor(ms / 1000);
  if (s > 0) return `${s}s`;
  return "0m";
}

/** Shorter string for tray / tight UI (e.g. `2h15m`, `45m`). */
export function formatTrackedMsShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalM = Math.floor(ms / 60000);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return "0m";
}

export function creditTrackedTime(
  editor: Editor,
  taskId: TLShapeId | string,
  deltaMs: number,
) {
  if (!taskId || deltaMs <= 0) return;
  const id = taskId as TLShapeId;
  const shape = editor.getShape(id);
  if (!shape || shape.type !== "focus-task") return;
  const task = shape as TLFocusTaskShape;
  const cur = task.props.trackedMs ?? 0;
  const next = Math.max(0, cur + Math.round(deltaMs));
  const day = todayKey();
  const log = mergeDayLog(task.props.trackedDayLog ?? [], day, Math.round(deltaMs));
  editor.run(() => {
    editor.updateShape({
      id,
      type: "focus-task",
      props: { ...task.props, trackedMs: next, trackedDayLog: log },
    });
  });
}

/** Session not yet cleared (may be at 0:00 waiting for completion handler). */
export function isTaskSessionActive(props: TLFocusTaskShape["props"]): boolean {
  return props.focusEndAt != null && props.focusSessionStartedAt != null;
}

/** Finish a running `focus-timer` shape: credit linked task, clear running state. */
export function finishFocusTimerShape(
  editor: Editor,
  timerId: TLShapeId,
  kind: "full" | "partial",
) {
  const t = editor.getShape(timerId) as TLFocusTimerShape | undefined;
  if (!t || t.type !== "focus-timer" || !t.props.running) return;
  const presetMs = t.props.durationPreset * 60 * 1000;
  const started = t.props.sessionStartedAt ?? Date.now();
  const delta =
    kind === "full"
      ? presetMs
      : Math.min(Math.max(0, Date.now() - started), presetMs);
  if (t.props.linkedTaskId && delta > 0)
    creditTrackedTime(editor, t.props.linkedTaskId as TLShapeId, delta);
  editor.run(() => {
    editor.updateShape({
      id: timerId,
      type: "focus-timer",
      props: {
        ...t.props,
        running: false,
        endAt: null,
        sessionStartedAt: null,
      },
    });
  });
}

/** End focus sessions on other tasks (partial credit). Does not stop timer shapes. */
export function stopOtherTaskSessions(editor: Editor, exceptId: TLShapeId) {
  for (const page of editor.getPages()) {
    walkShapes(editor, page.id, (task) => {
      if (task.id === exceptId) return;
      if (isTaskSessionActive(task.props)) {
        finishTaskFocusSession(editor, task.id, "partial");
      }
    });
  }
}

/**
 * Credit time and clear in-card session props. By default sets `doing` → `open` when closing;
 * pass `targetStatus` (e.g. `done`) when completing from “mark done” so status is not forced to open.
 */
export function finishTaskFocusSession(
  editor: Editor,
  taskId: TLShapeId,
  kind: "full" | "partial",
  targetStatus?: TLFocusTaskShape["props"]["status"],
) {
  const shape = editor.getShape(taskId) as TLFocusTaskShape | undefined;
  if (!shape || shape.type !== "focus-task") return;
  if (shape.props.focusSessionStartedAt == null) return;

  const presetMs =
    (shape.props.focusPresetMin ?? getCachedAppSettings().defaultFocusMinutes) *
    60 *
    1000;
  const started = shape.props.focusSessionStartedAt;
  const delta =
    kind === "full"
      ? presetMs
      : Math.min(Math.max(0, Date.now() - started), presetMs);

  if (delta > 0) creditTrackedTime(editor, taskId, delta);

  const after = editor.getShape(taskId) as TLFocusTaskShape;
  const nextStatus =
    targetStatus ??
    (after.props.status === "doing" ? "open" : after.props.status);
  editor.run(() => {
    editor.updateShape({
      id: taskId,
      type: "focus-task",
      props: {
        ...after.props,
        focusEndAt: null,
        focusSessionStartedAt: null,
        status: nextStatus,
      },
    });
  });
  window.dispatchEvent(new CustomEvent("focus-timer-stopped"));
}

/** Stop a running canvas `focus-timer` linked to this task id (partial credit). */
export function finishFocusTimerLinkedToTask(editor: Editor, taskId: TLShapeId) {
  const idStr = taskId as string;
  for (const page of editor.getPages()) {
    const walk = (pid: TLPageId | TLShapeId): TLShapeId | null => {
      for (const id of editor.getSortedChildIdsForParent(pid)) {
        const s = editor.getShape(id);
        if (!s) continue;
        if (s.type === "focus-timer") {
          const ft = s as TLFocusTimerShape;
          if (
            ft.props.running &&
            ft.props.linkedTaskId &&
            ft.props.linkedTaskId === idStr
          ) {
            return id;
          }
        }
        const inner = walk(id);
        if (inner) return inner;
      }
      return null;
    };
    const hit = walk(page.id);
    if (hit) {
      finishFocusTimerShape(editor, hit, "partial");
      return;
    }
  }
}

export function startTaskFocusSession(
  editor: Editor,
  taskId: TLShapeId,
  presetMin = getCachedAppSettings().defaultFocusMinutes,
) {
  const timerId = findRunningFocusTimerId(editor);
  if (timerId) finishFocusTimerShape(editor, timerId, "partial");

  stopOtherTaskSessions(editor, taskId);

  const shape = editor.getShape(taskId) as TLFocusTaskShape | undefined;
  if (!shape || shape.type !== "focus-task") return;
  if (shape.props.status === "done") return;

  const ms = presetMin * 60 * 1000;
  const now = Date.now();
  editor.run(() => {
    editor.updateShape({
      id: taskId,
      type: "focus-task",
      props: {
        ...shape.props,
        focusEndAt: now + ms,
        focusSessionStartedAt: now,
        focusPresetMin: presetMin,
        status: "doing",
      },
    });
  });
  window.dispatchEvent(new CustomEvent("focus-timer-started"));
}

export function stopTaskFocusSession(editor: Editor, taskId: TLShapeId) {
  finishTaskFocusSession(editor, taskId, "partial");
}

/**
 * End every running focus timer (canvas `focus-timer` + in-card task sessions) with partial credit.
 * Call before persisting the document on app quit; force-kill cannot run this.
 */
export function stopAllFocusSessions(editor: Editor) {
  const timerIds: TLShapeId[] = [];
  for (const page of editor.getPages()) {
    const walk = (pid: TLPageId | TLShapeId): void => {
      for (const id of editor.getSortedChildIdsForParent(pid)) {
        const s = editor.getShape(id);
        if (!s) continue;
        if (s.type === "focus-timer") {
          const ft = s as TLFocusTimerShape;
          if (ft.props.running && ft.props.endAt) timerIds.push(id);
        }
        walk(id);
      }
    };
    walk(page.id);
  }
  for (const id of timerIds) {
    finishFocusTimerShape(editor, id, "partial");
  }

  const taskIds: TLShapeId[] = [];
  for (const page of editor.getPages()) {
    walkShapes(editor, page.id, (t) => {
      if (isTaskSessionActive(t.props)) taskIds.push(t.id);
    });
  }
  for (const id of taskIds) {
    finishTaskFocusSession(editor, id, "partial");
  }
}

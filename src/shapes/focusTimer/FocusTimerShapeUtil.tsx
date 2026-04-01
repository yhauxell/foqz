import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
} from "@tldraw/tlschema";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  TLBaseShape,
  type TLShapeId,
  useEditor,
  useValue,
} from "tldraw";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusAppSettingsOptional } from "../../context/FocusAppSettingsContext";
import { DEFAULT_APP_SETTINGS } from "../../lib/appSettings";
import { playFocusBlockEndFeedback } from "../../lib/focusSessionFeedback";
import { creditTrackedTime } from "../../lib/focusTime";
import type { TLFocusTaskShape } from "../focusTask/FocusTaskShapeUtil";

const focusTimerVersions = createShapePropsMigrationIds("focus-timer", {
  AddSessionStartedAt: 1,
});

const focusTimerMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: focusTimerVersions.AddSessionStartedAt,
      up: (props: Record<string, unknown>) => {
        if (typeof props.sessionStartedAt !== "number")
          props.sessionStartedAt = null;
      },
      down: (props: Record<string, unknown>) => {
        delete props.sessionStartedAt;
      },
    },
  ],
});

export type TLFocusTimerShape = TLBaseShape<
  "focus-timer",
  {
    w: number;
    h: number;
    durationPreset: number;
    running: boolean;
    endAt: number | null;
    linkedTaskId: string;
    sessionStartedAt: number | null;
  }
>;

function formatRemaining(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export class FocusTimerShapeUtil extends BaseBoxShapeUtil<TLFocusTimerShape> {
  static override type = "focus-timer" as const;
  static override migrations = focusTimerMigrations;
  static override props = {
    w: T.number,
    h: T.number,
    durationPreset: T.number,
    running: T.boolean,
    endAt: T.nullable(T.number),
    linkedTaskId: T.string,
    sessionStartedAt: T.nullable(T.number),
  };

  override getDefaultProps(): TLFocusTimerShape["props"] {
    return {
      w: 140,
      h: 160,
      durationPreset: 25,
      running: false,
      endAt: null,
      linkedTaskId: "",
      sessionStartedAt: null,
    };
  }

  override component(shape: TLFocusTimerShape) {
    return <TimerBody shape={shape} />;
  }

  override indicator(shape: TLFocusTimerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />;
  }
}

function TimerBody({ shape }: { shape: TLFocusTimerShape }) {
  const editor = useEditor();
  const appSettingsCtx = useFocusAppSettingsOptional();
  const durationPresetOptions = useMemo(() => {
    const base =
      appSettingsCtx?.settings.durationPresets?.length &&
      appSettingsCtx.settings.durationPresets.length > 0
        ? appSettingsCtx.settings.durationPresets
        : DEFAULT_APP_SETTINGS.durationPresets;
    const v = shape.props.durationPreset;
    if (!base.includes(v)) return [...base, v].sort((a, b) => a - b);
    return base;
  }, [appSettingsCtx?.settings.durationPresets, shape.props.durationPreset]);
  /** Drives recomputation of `remainingMs` every second while running (useMemo deps alone stay stale). */
  const [tick, setTick] = useState(0);
  const alertedRef = useRef(false);
  const sessionCreditedRef = useRef(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = (msg: string) => {
    if (flashClearRef.current) clearTimeout(flashClearRef.current);
    setFlash(msg);
    flashClearRef.current = setTimeout(() => {
      setFlash(null);
      flashClearRef.current = null;
    }, 4500);
  };

  useEffect(() => {
    if (!shape.props.running || !shape.props.endAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [shape.props.running, shape.props.endAt]);

  useEffect(() => {
    if (!shape.props.running) {
      alertedRef.current = false;
      setTick(0);
    }
  }, [shape.props.running]);

  const isDark = useValue("dark", () => editor.user.getIsDarkMode(), [editor]);
  const tasks = useValue(
    "tasks",
    () =>
      editor
        .getCurrentPageShapes()
        .filter((s): s is TLFocusTaskShape => s.type === "focus-task"),
    [editor],
  );

  const remainingMs = useMemo(() => {
    void tick;
    if (!shape.props.running || !shape.props.endAt)
      return shape.props.durationPreset * 60 * 1000;
    return shape.props.endAt - Date.now();
  }, [
    tick,
    shape.props.durationPreset,
    shape.props.endAt,
    shape.props.running,
  ]);

  const update = (patch: Partial<TLFocusTimerShape["props"]>) => {
    editor.updateShape({
      id: shape.id,
      type: "focus-timer",
      props: { ...shape.props, ...patch },
    });
  };

  const presetMs = shape.props.durationPreset * 60 * 1000;

  const applyStopState = () => {
    update({ running: false, endAt: null, sessionStartedAt: null });
    window.dispatchEvent(new CustomEvent("focus-timer-stopped"));
  };

  /** One credit per session; marks session closed even when there is no linked task. */
  const finishSession = (deltaMs: number, kind: "partial" | "full") => {
    if (sessionCreditedRef.current) return;
    sessionCreditedRef.current = true;
    const s = editor.getShape(shape.id) as TLFocusTimerShape | undefined;
    const link = s?.props.linkedTaskId;
    const d = Math.max(0, Math.round(deltaMs));
    if (link && d > 0) {
      creditTrackedTime(editor, link as TLShapeId, d);
      const task = editor.getShape(link as TLShapeId) as TLFocusTaskShape | undefined;
      const rawTitle = task?.props?.title?.trim() || "task";
      const short = rawTitle.slice(0, 28);
      const ell = rawTitle.length > 28 ? "…" : "";
      const creditLabel =
        d >= 60000
          ? `+${Math.round(d / 60000)} min`
          : `+${Math.max(1, Math.round(d / 1000))}s`;
      showFlash(
        kind === "full"
          ? `${creditLabel} on “${short}${ell}”`
          : `${creditLabel} saved on “${short}${ell}”`,
      );
    }
  };

  const start = () => {
    sessionCreditedRef.current = false;
    const ms = presetMs;
    update({
      running: true,
      endAt: Date.now() + ms,
      sessionStartedAt: Date.now(),
    });
    window.dispatchEvent(new CustomEvent("focus-timer-started"));
  };

  const stop = () => {
    const s = editor.getShape(shape.id) as TLFocusTimerShape | undefined;
    if (!s?.props.running) return;

    const started = s.props.sessionStartedAt ?? Date.now();
    const raw = Date.now() - started;
    const delta = Math.min(Math.max(0, raw), presetMs);

    finishSession(delta, "partial");
    applyStopState();
  };

  useEffect(() => {
    const s = editor.getShape(shape.id) as TLFocusTimerShape | undefined;
    if (!s?.props.running || !s.props.endAt || remainingMs > 0 || alertedRef.current)
      return;
    alertedRef.current = true;

    const blockMs = s.props.durationPreset * 60 * 1000;
    finishSession(blockMs, "full");

    editor.updateShape({
      id: shape.id,
      type: "focus-timer",
      props: {
        ...s.props,
        running: false,
        endAt: null,
        sessionStartedAt: null,
      },
    });
    playFocusBlockEndFeedback("timer");
    window.dispatchEvent(new CustomEvent("focus-timer-stopped"));
  }, [editor, remainingMs, shape.id]); // eslint-disable-line react-hooks/exhaustive-deps -- natural completion once; finishSession uses refs/editor

  const linked = shape.props.linkedTaskId
    ? (editor.getShape(shape.props.linkedTaskId as TLShapeId) as TLFocusTaskShape | null)
    : null;
  const linkedTitle = linked?.props?.title ?? "—";

  const border = isDark ? "#3f3f46" : "#d4d4d8";
  const bg = isDark ? "#18181b" : "#fff";

  return (
    <HTMLContainer
      id={shape.id}
      style={{ width: shape.props.w, height: shape.props.h, pointerEvents: "all" }}
    >
      <div
        className={shape.props.running ? "focus-timer-pulse" : ""}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 12,
          border: `1px solid ${border}`,
          background: bg,
          boxSizing: "border-box",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-sans), system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isDark ? "#a1a1aa" : "#52525b",
          }}
        >
          Focus timer
        </div>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 999,
            border: `3px solid ${shape.props.running ? "#3b82f6" : border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 800,
            color: isDark ? "#fafafa" : "#18181b",
          }}
        >
          {shape.props.running ? formatRemaining(remainingMs) : `${shape.props.durationPreset}m`}
        </div>
        <select
          value={shape.props.durationPreset}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => update({ durationPreset: Number(e.target.value) })}
          style={{ fontSize: 11, width: "100%" }}
        >
          {durationPresetOptions.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <select
          value={shape.props.linkedTaskId}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => update({ linkedTaskId: e.target.value })}
          style={{ fontSize: 10, width: "100%" }}
        >
          <option value="">No linked task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.props.title.slice(0, 36)}
            </option>
          ))}
        </select>
        <div
          style={{
            fontSize: 9,
            color: isDark ? "#71717a" : "#71717a",
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          {linked ? `On: ${linkedTitle}` : "Link a task to record focus time"}
        </div>
        {flash ? (
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: "#16a34a",
              textAlign: "center",
              lineHeight: 1.25,
              maxWidth: "100%",
            }}
          >
            {flash}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 4, width: "100%" }}>
          {!shape.props.running ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                start();
              }}
              style={{ flex: 1, fontSize: 11, padding: "4px 0", cursor: "pointer" }}
            >
              Start
            </button>
          ) : (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                stop();
              }}
              style={{ flex: 1, fontSize: 11, padding: "4px 0", cursor: "pointer" }}
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </HTMLContainer>
  );
}

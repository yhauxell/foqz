import { Check, Pause, Play, Plus, X } from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { isDone, nodeTitle, stopFocus } from "@/lib/nodeBehaviors";

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Focus happens where the node lives. The camera has already zoomed to it
 * (see `startFocus`); this dims everything else and floats a small timer.
 */
export function FocusInPlace() {
  const focusId = useFlowCanvasStore((s) => s.activeFocusNodeId);
  const node = useFlowCanvasStore((s) =>
    s.activeFocusNodeId ? s.nodes.find((n) => n.id === s.activeFocusNodeId) : undefined
  );
  const seconds = useFlowCanvasStore((s) => s.timerSecondsRemaining);
  const running = useFlowCanvasStore((s) => s.isTimerRunning);

  if (!focusId || !node) return null;

  const timeUp = seconds <= 0 && !running;
  const done = isDone(node);
  const store = useFlowCanvasStore.getState();
  // Escape for a CSS attribute selector: node ids are app-generated, but be safe.
  const safeId = focusId.replace(/["\\]/g, "\\$&");

  return (
    <>
      <style>{`
        .react-flow__node:not([data-id="${safeId}"]) {
          opacity: 0.14;
          filter: saturate(0.4);
          pointer-events: none;
          transition: opacity 300ms ease, filter 300ms ease;
        }
        .react-flow__edge, .react-flow__edgelabel-renderer > * { opacity: 0.08; transition: opacity 300ms ease; }
        .react-flow__node[data-id="${safeId}"] { transition: opacity 300ms ease; }
      `}</style>

      <div
        className="fixed top-16 left-1/2 -translate-x-1/2 z-[6000] flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-zinc-900/95 dark:bg-white/95 text-white dark:text-zinc-900 shadow-2xl backdrop-blur-xl border border-white/10 dark:border-black/10 text-xs select-none animate-in fade-in slide-in-from-top-2 duration-200"
        data-testid="focus-pill"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className={`size-2 rounded-full shrink-0 ${
            timeUp ? "bg-amber-400" : running ? "bg-rose-500 animate-pulse" : "bg-zinc-400"
          }`}
        />
        <span className="max-w-[220px] truncate font-medium" title={nodeTitle(node)}>
          {nodeTitle(node)}
        </span>
        <span
          className={`font-mono font-semibold tabular-nums px-1.5 ${timeUp ? "text-amber-300 dark:text-amber-600" : ""}`}
          data-testid="focus-timer"
        >
          {timeUp ? "Time's up" : formatClock(seconds)}
        </span>

        <button
          type="button"
          onClick={() => {
            if (timeUp) store.setTimerSecondsRemaining(5 * 60);
            store.setIsTimerRunning((prev) => !prev || timeUp);
          }}
          className="size-7 rounded-full flex items-center justify-center hover:bg-white/10 dark:hover:bg-black/10 cursor-pointer"
          title={running ? "Pause" : timeUp ? "Five more minutes" : "Resume"}
          aria-label={running ? "Pause timer" : "Resume timer"}
        >
          {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            store.setTimerSecondsRemaining((prev) => Math.max(0, prev) + 5 * 60);
            if (timeUp) store.setIsTimerRunning(true);
          }}
          className="h-7 px-2 rounded-full flex items-center gap-0.5 hover:bg-white/10 dark:hover:bg-black/10 cursor-pointer font-mono text-[11px]"
          title="Add five minutes"
          aria-label="Add five minutes"
        >
          <Plus className="size-3" />5
        </button>
        <button
          type="button"
          onClick={() => {
            store.updateNodeData(focusId, { status: done ? "open" : "done", completedVia: "focus" });
            if (!done) stopFocus();
          }}
          className="h-7 px-2.5 rounded-full flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer font-medium"
          title="Mark done and leave focus"
        >
          <Check className="size-3.5 stroke-[3]" />
          <span>Done</span>
        </button>
        <button
          type="button"
          onClick={() => stopFocus()}
          className="size-7 rounded-full flex items-center justify-center hover:bg-white/10 dark:hover:bg-black/10 cursor-pointer"
          title="Leave focus (Esc)"
          aria-label="Leave focus"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </>
  );
}

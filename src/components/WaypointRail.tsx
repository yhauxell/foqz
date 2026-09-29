import React, { useMemo, useCallback } from "react";
import { Folder, Flame, Compass, CheckCircle2, Clock } from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";

const ACCENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  blue: { bg: "bg-blue-500/10", text: "text-blue-500", dot: "bg-blue-500" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-500", dot: "bg-rose-500" },
  indigo: { bg: "bg-indigo-500/10", text: "text-indigo-500", dot: "bg-indigo-500" },
  zinc: { bg: "bg-zinc-500/10", text: "text-zinc-500", dot: "bg-zinc-500" },
};

export function WaypointRail() {
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const activeFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId);
  const isTimerRunning = useFlowCanvasStore((s) => s.isTimerRunning);
  const timerSecondsRemaining = useFlowCanvasStore((s) => s.timerSecondsRemaining);
  const setSelectedNodeId = useFlowCanvasStore((s) => s.setSelectedNodeId);

  // Extract all project frames
  const projects = useMemo(() => {
    return nodes
      .filter((n) => n.type === "projectFrame")
      .map((n) => {
        const d = (n.data || {}) as Record<string, any>;
        const childTasks = nodes.filter((c) => c.parentId === n.id && c.type === "focusTask");
        const doneTasks = childTasks.filter((c) => (c.data as any)?.status === "done").length;
        return {
          id: n.id,
          title: d.title || "Untitled Project",
          goal: d.goal || "",
          accent: d.accent || "blue",
          taskCount: childTasks.length,
          doneCount: doneTasks,
        };
      });
  }, [nodes]);

  const handleJumpToProject = useCallback(
    (projectId: string) => {
      setSelectedNodeId(projectId);
      window.dispatchEvent(
        new CustomEvent("foqz:flow-center-on", { detail: { id: projectId } })
      );
    },
    [setSelectedNodeId]
  );

  const handleFitCanvas = useCallback(() => {
    window.dispatchEvent(new CustomEvent("foqz:fit-view"));
  }, []);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <aside
      className="fixed left-3.5 top-16 z-30 flex flex-col items-center gap-1.5 p-1.5 rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl select-none transition-all"
      aria-label="Spatial Waypoints"
    >
      {/* Macro Overview / Fit View */}
      <button
        type="button"
        onClick={handleFitCanvas}
        className="size-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        title="Fit All Content (Space+1)"
      >
        <Compass className="size-4" />
      </button>

      {/* Active Focus Pill (if timer or active task is present) */}
      {activeFocusNodeId && (
        <button
          type="button"
          onClick={() => {
            handleJumpToProject(activeFocusNodeId);
          }}
          className={`size-8 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
            isTimerRunning
              ? "bg-rose-500/15 text-rose-500 animate-pulse"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
          }`}
          title={`Active Focus Sprint: ${formatTimer(timerSecondsRemaining)}`}
        >
          <Flame className="size-4" />
        </button>
      )}

      {projects.length > 0 && (
        <div className="w-5 h-[1px] bg-zinc-200 dark:bg-zinc-800 my-0.5" />
      )}

      {/* Project Waypoints */}
      <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto no-scrollbar">
        {projects.map((proj) => {
          const style = ACCENT_COLORS[proj.accent] || ACCENT_COLORS.blue;
          const letter = proj.title.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "P";
          return (
            <button
              key={proj.id}
              type="button"
              onClick={() => handleJumpToProject(proj.id)}
              className={`group relative size-8 rounded-xl flex items-center justify-center text-xs font-semibold ${style.bg} ${style.text} hover:scale-105 active:scale-95 transition-all cursor-pointer`}
              title={`${proj.title}${proj.goal ? ` — ${proj.goal}` : ""} (${proj.doneCount}/${proj.taskCount} tasks)`}
            >
              <span>{letter}</span>
              {proj.taskCount > 0 && proj.doneCount === proj.taskCount && (
                <div className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-500 border border-white dark:border-zinc-900 flex items-center justify-center">
                  <CheckCircle2 className="size-2 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

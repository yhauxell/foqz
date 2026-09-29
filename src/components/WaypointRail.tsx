import React, { useMemo, useCallback } from "react";
import { Plus, Flame, Compass, CheckCircle2 } from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";

const ACCENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  blue: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  rose: { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  indigo: { bg: "bg-indigo-500/15", text: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
  zinc: { bg: "bg-zinc-500/15", text: "text-zinc-600 dark:text-zinc-400", dot: "bg-zinc-500" },
};

export function WaypointRail() {
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const selectedNodeId = useFlowCanvasStore((s) => s.selectedNodeId);
  const activeFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId);
  const isTimerRunning = useFlowCanvasStore((s) => s.isTimerRunning);
  const timerSecondsRemaining = useFlowCanvasStore((s) => s.timerSecondsRemaining);
  const setSelectedNodeId = useFlowCanvasStore((s) => s.setSelectedNodeId);
  const createProject = useFlowCanvasStore((s) => s.createProject);

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

  const handleCreateProject = useCallback(() => {
    const store = useFlowCanvasStore.getState();
    const id = createProject({
      title: "New Project",
      goal: "Milestone goal & focus direction",
      accent: "blue",
      position: store.cursorPosition || undefined,
    });
    window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
  }, [createProject]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <aside
      className="absolute top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 p-1.5 rounded-full glass-panel shadow-2xl backdrop-blur-2xl backdrop-saturate-150 transition-all duration-200 select-none border border-white/60 dark:border-white/10"
      style={{ left: "18px" }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Spatial Waypoints"
    >
      {/* 1. Macro Overview / Fit View */}
      <button
        type="button"
        onClick={handleFitCanvas}
        className="size-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
        title="Fit All Content (Space+1 / ⌘0)"
      >
        <Compass className="size-5" />
      </button>

      {/* 2. Active Focus Pill (if timer or active task is present) */}
      {activeFocusNodeId && (
        <button
          type="button"
          onClick={() => handleJumpToProject(activeFocusNodeId)}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
            isTimerRunning
              ? "bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse ring-1 ring-white/25"
              : "text-rose-500 hover:bg-rose-500/10"
          }`}
          title={`Active Focus Sprint (${formatTimer(timerSecondsRemaining)}) — Jump to task`}
        >
          <Flame className="size-5" />
        </button>
      )}

      {/* Subtle Separator */}
      <div className="w-5 h-[1px] bg-black/[0.08] dark:bg-white/[0.12] my-0.5 rounded-full" />

      {/* 3. Project Waypoints List */}
      <div className="flex flex-col items-center gap-1.5 max-h-[38vh] overflow-y-auto no-scrollbar py-0.5">
        {projects.map((proj) => {
          const isSelected = selectedNodeId === proj.id;
          const letter = proj.title.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "P";
          const style = ACCENT_COLORS[proj.accent] || ACCENT_COLORS.blue;

          return (
            <button
              key={proj.id}
              type="button"
              onClick={() => handleJumpToProject(proj.id)}
              className={`group relative size-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                isSelected
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md shadow-black/20 ring-1 ring-white/20"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
              }`}
              title={`${proj.title}${proj.goal ? ` — ${proj.goal}` : ""} (${proj.doneCount}/${proj.taskCount} tasks)`}
            >
              <div
                className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold tracking-tight transition-transform ${
                  isSelected
                    ? "bg-white/20 dark:bg-black/10 text-white dark:text-zinc-900"
                    : `${style.bg} ${style.text}`
                }`}
              >
                {letter}
              </div>

              {/* Completion badge dot */}
              {proj.taskCount > 0 && proj.doneCount === proj.taskCount && (
                <div className="absolute top-1 right-1 size-2.5 rounded-full bg-emerald-500 border border-white dark:border-zinc-900 flex items-center justify-center">
                  <CheckCircle2 className="size-2 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Subtle Separator */}
      {projects.length > 0 && (
        <div className="w-5 h-[1px] bg-black/[0.08] dark:bg-white/[0.12] my-0.5 rounded-full" />
      )}

      {/* 4. Quick Add Project Button */}
      <button
        type="button"
        onClick={handleCreateProject}
        className="size-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
        title="Create New Project Frame (/p)"
      >
        <Plus className="size-5" />
      </button>
    </aside>
  );
}

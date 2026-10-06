import React, { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  Plus,
  Flame,
  Compass,
  Check,
  CheckCircle2,
  PlaneTakeoff,
  Zap,
  GitBranch,
  Sparkles,
  FolderPlus,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { RUNWAY_TEMPLATES, type RunwayTemplateId } from "@/types/canvas";

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
  const stageRunway = useFlowCanvasStore((s) => s.stageRunway);

  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close template menu on outside click or Escape
  useEffect(() => {
    if (!templateMenuOpen) return;
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setTemplateMenuOpen(false);
      } else if (
        e instanceof MouseEvent &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setTemplateMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleDown);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleDown);
    };
  }, [templateMenuOpen]);

  // Extract runways
  const runways = useMemo(() => {
    return nodes
      .filter(
        (n) =>
          n.type === "runwayFrame" ||
          (n.type === "projectFrame" && String((n.data as any)?.title || "").includes("Runway"))
      )
      .map((n) => {
        const d = (n.data || {}) as Record<string, any>;
        const childTasks = nodes.filter((c) => c.parentId === n.id && c.type === "focusTask");
        const doneTasks = childTasks.filter((c) => (c.data as any)?.status === "done").length;
        const hasActiveFocus = childTasks.some((c) => c.id === activeFocusNodeId);

        return {
          id: n.id,
          title: d.title || "Today's Runway",
          dailyGoal: d.dailyGoal || d.goal || "",
          templateId: (d.templateId as RunwayTemplateId) || "rule_of_3",
          accent: d.accent || "rose",
          taskCount: childTasks.length,
          doneCount: doneTasks,
          hasActiveFocus,
        };
      });
  }, [nodes, activeFocusNodeId]);

  // Extract projects (strictly excluding runways, aggregating tasks with originProjectId)
  const projects = useMemo(() => {
    return nodes
      .filter(
        (n) =>
          n.type === "projectFrame" &&
          !String((n.data as any)?.title || "").includes("Runway")
      )
      .map((n) => {
        const d = (n.data || {}) as Record<string, any>;
        // Collect all tasks belonging to this project (directly inside OR staged on a runway)
        const allTasks = nodes.filter(
          (c) =>
            c.type === "focusTask" &&
            (c.parentId === n.id || (c.data as any)?.originProjectId === n.id)
        );
        const doneTasks = allTasks.filter((c) => (c.data as any)?.status === "done").length;
        const stagedCount = allTasks.filter(
          (c) => (c.data as any)?.originProjectId === n.id && c.parentId !== n.id
        ).length;

        return {
          id: n.id,
          title: d.title || "Untitled Project",
          goal: d.goal || "",
          accent: d.accent || "blue",
          taskCount: allTasks.length,
          doneCount: doneTasks,
          stagedCount,
        };
      });
  }, [nodes]);

  const handleJumpToNode = useCallback(
    (targetId: string) => {
      setSelectedNodeId(targetId);
      window.dispatchEvent(
        new CustomEvent("foqz:flow-center-on", { detail: { id: targetId, fullSpace: true } })
      );
    },
    [setSelectedNodeId]
  );

  const handleFitCanvas = useCallback(() => {
    window.dispatchEvent(new CustomEvent("foqz:fit-view"));
  }, []);

  const handleCreateProject = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("foqz:new-project", { detail: { fullSpace: true } })
    );
  }, []);

  const handleSelectRunwayTemplate = (templateId: RunwayTemplateId) => {
    setTemplateMenuOpen(false);
    const store = useFlowCanvasStore.getState();
    const id = stageRunway({
      templateId,
      position: store.cursorPosition || undefined,
      forceNew: true,
    });
    window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const renderRunwayIcon = (templateId?: RunwayTemplateId) => {
    switch (templateId) {
      case "ultradian_90":
        return <Zap className="size-4 text-amber-500" />;
      case "critical_path":
        return <GitBranch className="size-4 text-indigo-500" />;
      case "rapid_batch":
        return <Flame className="size-4 text-emerald-500" />;
      case "eisenhower_matrix":
        return <LayoutGrid className="size-4 text-blue-500" />;
      case "rule_of_3":
      default:
        return <PlaneTakeoff className="size-4 text-rose-500" />;
    }
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
          onClick={() => handleJumpToNode(activeFocusNodeId)}
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

      {/* ======================================================== */}
      {/* 3. RUNWAYS GROUP (Very light gray rounded capsule)        */}
      {/* ======================================================== */}
      <div
        className="w-full flex flex-col items-center gap-1.5 p-1 rounded-2xl bg-zinc-100/90 dark:bg-zinc-800/60 border border-black/[0.04] dark:border-white/[0.06] relative"
        title="Runway Focus Area"
      >
        {/* Scrollable list of runway waypoints if any exist */}
        {runways.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 max-h-[24vh] overflow-y-auto no-scrollbar py-0.5 px-0.5 w-full">
            {runways.map((runway) => {
              const isSelected = selectedNodeId === runway.id;
              const isAllDone = runway.taskCount > 0 && runway.doneCount === runway.taskCount;

              return (
                <button
                  key={runway.id}
                  type="button"
                  onClick={() => handleJumpToNode(runway.id)}
                  className={`group relative size-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer active:scale-95 border ${
                    runway.hasActiveFocus
                      ? "border-rose-500 ring-2 ring-rose-500/50 shadow-md shadow-rose-500/20"
                      : isSelected
                      ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md"
                      : "border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-zinc-700 dark:text-zinc-300"
                  }`}
                  title={`${runway.title}${runway.dailyGoal ? ` — ${runway.dailyGoal}` : ""} (${runway.doneCount}/${runway.taskCount} cleared)`}
                >
                  <div className="size-6 flex items-center justify-center">
                    {renderRunwayIcon(runway.templateId)}
                  </div>

                  {/* Notification-style completed count badge */}
                  {runway.doneCount > 0 && (
                    <div
                      className={`absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center shadow-xs border z-10 ${
                        isAllDone
                          ? "bg-emerald-500 text-white border-white dark:border-zinc-900"
                          : "bg-rose-500 text-white border-white dark:border-zinc-900"
                      }`}
                      title={`${runway.doneCount} completed tasks on runway`}
                    >
                      {isAllDone ? <Check className="size-2.5 stroke-[3]" /> : runway.doneCount}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Quick Add Runway Button (with Template Popover) */}
        <div className="relative my-0.5">
          <button
            ref={buttonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setTemplateMenuOpen((prev) => !prev);
            }}
            className={`size-7 rounded-xl flex items-center justify-center bg-white/95 dark:bg-zinc-900/90 hover:bg-white dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 shadow-2xs border border-black/[0.04] dark:border-white/[0.06] active:scale-95 transition-all cursor-pointer ${
              templateMenuOpen ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 ring-2 ring-zinc-400/30" : ""
            }`}
            title="Stage New Runway from Templates..."
          >
            <Plus className="size-3.5 stroke-[2.2]" />
          </button>

          {/* Runway Template Selector Popover Menu */}
          {templateMenuOpen && (
            <div
              ref={menuRef}
              className="absolute left-11 top-0 w-72 rounded-2xl glass-panel bg-white/95 dark:bg-zinc-900/95 border border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-2xl p-2.5 z-[9999] animate-in fade-in zoom-in-95 duration-150 text-left select-none pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-black/5 dark:border-white/5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="size-3 text-rose-500" />
                  <span>Runway Frameworks</span>
                </span>
                <span className="text-[9px] font-mono text-zinc-400">Deep Work</span>
              </div>

              <div className="space-y-1">
                {(Object.keys(RUNWAY_TEMPLATES) as RunwayTemplateId[]).map((tid) => {
                  const tmpl = RUNWAY_TEMPLATES[tid];
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => handleSelectRunwayTemplate(tid)}
                      className="w-full text-left p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-black/5 dark:hover:border-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-lg bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
                          {renderRunwayIcon(tid)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-rose-500 transition-colors truncate">
                            {tmpl.title}
                          </div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                            {tmpl.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 text-[9px] text-zinc-400 font-mono flex items-center justify-between">
                        <span>{tmpl.framework}</span>
                        <span>{tmpl.slots} Slots</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subtle Separator between Runways and Projects */}
      <div className="w-5 h-[1px] bg-black/[0.08] dark:bg-white/[0.12] my-0.5 rounded-full" />

      {/* ======================================================== */}
      {/* 4. PROJECTS GROUP (Circles / Accent Monograms)           */}
      {/* ======================================================== */}
      <div className="flex flex-col items-center gap-1.5 max-h-[34vh] overflow-y-auto no-scrollbar py-1 px-1.5">
        {projects.map((proj) => {
          const isSelected = selectedNodeId === proj.id;
          const letter = proj.title.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "P";
          const style = ACCENT_COLORS[proj.accent] || ACCENT_COLORS.blue;
          const isAllDone = proj.taskCount > 0 && proj.doneCount === proj.taskCount;

          return (
            <button
              key={proj.id}
              type="button"
              onClick={() => handleJumpToNode(proj.id)}
              className={`group relative size-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                isSelected
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md shadow-black/20 ring-1 ring-white/20"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
              }`}
              title={`${proj.title}${proj.goal ? ` — ${proj.goal}` : ""} (${proj.doneCount}/${proj.taskCount} tasks${
                proj.stagedCount > 0 ? `, ${proj.stagedCount} on runway` : ""
              })`}
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

              {/* Notification-style completed count badge */}
              {proj.doneCount > 0 && (
                <div
                  className={`absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center shadow-xs border z-10 ${
                    isAllDone
                      ? "bg-emerald-500 text-white border-white dark:border-zinc-900"
                      : "bg-blue-600 text-white border-white dark:border-zinc-900"
                  }`}
                  title={`${proj.doneCount} completed tasks in project`}
                >
                  {isAllDone ? <Check className="size-2.5 stroke-[3]" /> : proj.doneCount}
                </div>
              )}
            </button>
          );
        })}

        {/* Quick Add Project Frame Button */}
        <button
          type="button"
          onClick={handleCreateProject}
          className="size-7 rounded-full flex items-center justify-center bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 border border-black/[0.06] dark:border-white/[0.08] active:scale-95 transition-all cursor-pointer my-0.5"
          title="Create New Project Frame (⌘⇧P)"
        >
          <FolderPlus className="size-3.5 stroke-[2]" />
        </button>
      </div>
    </aside>
  );
}

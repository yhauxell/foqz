import React, { useState, useMemo, useCallback } from "react";
import {
  CheckSquare,
  Square,
  Sparkles,
  FolderPlus,
  Plus,
  PanelLeftClose,
  Target,
  Layers,
  ChevronRight,
  Compass,
} from "lucide-react";
import {
  createShapeId,
  type Editor,
  type TLShapeId,
} from "tldraw";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";
import type { TLProjectFrameShape } from "@/shapes/projectFrame/ProjectFrameShapeUtil";
import { renderMarkdownInline } from "@/lib/markdown";

interface WorkspaceSidebarProps {
  editor: Editor | null;
  open: boolean;
  onToggle: () => void;
  onOpenCopilot: (shapeId?: TLShapeId) => void;
}

type TaskFilter = "all" | "active" | "todo" | "done";

export function WorkspaceSidebar({
  editor,
  open,
  onToggle,
  onOpenCopilot,
}: WorkspaceSidebarProps) {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [quickTitle, setQuickTitle] = useState("");

  // Read all shapes from canvas
  const { tasks, projects } = useMemo(() => {
    if (!editor) return { tasks: [], projects: [] };
    const shapes = editor.getCurrentPageShapes();
    const t: TLFocusTaskShape[] = [];
    const p: TLProjectFrameShape[] = [];

    for (const s of shapes) {
      if (s.type === "focus-task") {
        t.push(s as TLFocusTaskShape);
      } else if (s.type === "project-frame") {
        p.push(s as TLProjectFrameShape);
      }
    }
    return { tasks: t, projects: p };
  }, [editor, editor?.getCurrentPageShapes()]);

  const doneCount = tasks.filter((t) => t.props.status === "done").length;
  const doingCount = tasks.filter((t) => t.props.status === "doing").length;
  const todoCount = tasks.filter((t) => t.props.status === "open").length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (filter === "active") return tasks.filter((t) => t.props.status === "doing");
    if (filter === "todo") return tasks.filter((t) => t.props.status === "open");
    if (filter === "done") return tasks.filter((t) => t.props.status === "done");
    return tasks;
  }, [tasks, filter]);

  // Jump to shape on infinite canvas
  const handleJumpToShape = useCallback(
    (shapeId: TLShapeId) => {
      if (!editor) return;
      editor.select(shapeId);
      editor.zoomToSelection({ animation: { duration: 260 } });
    },
    [editor],
  );

  // Jump to project frame
  const handleJumpToProject = useCallback(
    (projectId: TLShapeId) => {
      if (!editor) return;
      const bounds = editor.getShapePageBounds(projectId);
      if (bounds) {
        editor.select(projectId);
        editor.zoomToBounds(bounds, { animation: { duration: 300 }, inset: 80 });
      }
    },
    [editor],
  );

  // Quick add project
  const handleAddProject = useCallback(() => {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    editor.createShape({
      id,
      type: "project-frame",
      x: center.x - 360,
      y: center.y - 230,
      props: {
        w: 720,
        h: 460,
        title: "New Project",
        goal: "Goal: Launch milestone by Friday",
      },
    });
    editor.select(id);
  }, [editor]);

  // Quick add task
  const handleAddTask = useCallback(() => {
    if (!editor) return;
    const title = quickTitle.trim() || "New task";
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    editor.createShape({
      id,
      type: "focus-task",
      x: center.x - 130,
      y: center.y - 42,
      props: {
        w: 260,
        h: 84,
        title,
        status: "open",
      },
    });
    editor.select(id);
    setQuickTitle("");
  }, [editor, quickTitle]);

  if (!open) return null;

  return (
    <aside
      className="w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col text-zinc-900 dark:text-zinc-100 font-sans select-none shrink-0 z-40 animate-in slide-in-from-left duration-200"
      style={{
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div className="h-12 px-3 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-2">
          <Compass className="size-4 text-zinc-500 dark:text-zinc-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Workspace
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          title="Collapse Sidebar (⌘B)"
          className="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      {/* Daily Clearance Meter */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/20 shrink-0 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-600 dark:text-zinc-400 font-medium">Daily Clearance</span>
          <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {doneCount}/{totalCount} ({progressPercent}%)
          </span>
        </div>
        {/* Progress Bar with vibrant gradient */}
        <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Projects Navigation Section */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/60 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Projects ({projects.length})
          </span>
          <button
            type="button"
            title="Create Project Frame (⌘⇧P)"
            onClick={handleAddProject}
            className="p-1 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <FolderPlus className="size-3.5" />
          </button>
        </div>

        {projects.length > 0 ? (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleJumpToProject(p.id)}
                className="w-full text-left p-2 rounded-md bg-zinc-50/80 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-zinc-950 dark:group-hover:text-white">
                    {p.props.title || "Untitled Project"}
                  </div>
                  {p.props.goal ? (
                    <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                      <Target className="size-2.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                      <span>{p.props.goal}</span>
                    </div>
                  ) : null}
                </div>
                <ChevronRight className="size-3 text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-zinc-400 dark:text-zinc-600 py-1 italic">
            No projects yet. Click + to add one.
          </div>
        )}
      </div>

      {/* Agent Task Queue Section */}
      <div className="flex-1 flex flex-col min-h-0 p-3">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Task Queue ({tasks.length})
          </span>
          <button
            type="button"
            title="Quick add task card (⌘N)"
            onClick={handleAddTask}
            className="p-1 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 mb-2 shrink-0">
          {(["all", "active", "todo", "done"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors ${
                filter === tab
                  ? "bg-zinc-900 dark:bg-zinc-800 text-white font-semibold shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredTasks.length > 0 ? (
            filteredTasks.map((t) => {
              const isDone = t.props.status === "done";
              const isDoing = t.props.status === "doing";

              return (
                <div
                  key={t.id}
                  className="group flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800/80 transition-colors cursor-pointer"
                  onClick={() => handleJumpToShape(t.id)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Modern Task Status Icon */}
                    {isDone ? (
                      <CheckSquare className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : isDoing ? (
                      <Sparkles className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0 animate-pulse" />
                    ) : (
                      <Square className="size-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                    )}

                    <span
                      className={`text-xs truncate ${
                        isDone
                          ? "line-through text-zinc-400 dark:text-zinc-500"
                          : isDoing
                            ? "text-blue-700 dark:text-blue-300 font-medium"
                            : "text-zinc-700 dark:text-zinc-300"
                      }`}
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownInline(t.props.title || "Untitled Task"),
                      }}
                    />
                  </div>

                  {/* Actions on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      title="Open in Copilot"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCopilot(t.id);
                      }}
                      className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Sparkles className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-[11px] text-zinc-400 dark:text-zinc-600 py-6 text-center italic">
              No tasks in this view.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Quick Input */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-400 dark:focus-within:border-zinc-600 rounded-md px-2 py-1 transition-colors shadow-xs">
          <input
            type="text"
            value={quickTitle}
            placeholder="Quick task... (Enter)"
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTask();
              }
            }}
            className="w-full bg-transparent border-0 outline-none text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={handleAddTask}
            className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  resizeBox,
  T,
  TLBaseShape,
  useEditor,
  useValue,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";
import { Sparkles, Target, Trash2 } from "lucide-react";
import React, { useCallback, useRef } from "react";
import type { TLFocusTaskShape } from "../focusTask/FocusTaskShapeUtil";

export type ProjectAccent = "indigo" | "emerald" | "amber" | "rose" | "zinc";

export type TLProjectFrameShape = TLBaseShape<
  "project-frame",
  {
    w: number;
    h: number;
    title: string;
    goal: string;
    accent?: ProjectAccent;
  }
>;

const ACCENT_STYLES: Record<
  ProjectAccent,
  {
    border: string;
    selectedRing: string;
    headerBg: string;
    headerBorder: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    badgeDot: string;
  }
> = {
  indigo: {
    border: "border-indigo-200/80 dark:border-indigo-900/50",
    selectedRing: "ring-indigo-500/40 dark:ring-indigo-500/50 border-indigo-500",
    headerBg: "bg-indigo-50/70 dark:bg-indigo-950/40",
    headerBorder: "border-b border-indigo-200/60 dark:border-indigo-900/50",
    badgeBg: "bg-indigo-100/90 dark:bg-indigo-950/80",
    badgeText: "text-indigo-700 dark:text-indigo-300",
    badgeBorder: "border-indigo-200 dark:border-indigo-800/80",
    badgeDot: "bg-indigo-500",
  },
  emerald: {
    border: "border-emerald-200/80 dark:border-emerald-900/50",
    selectedRing: "ring-emerald-500/40 dark:ring-emerald-500/50 border-emerald-500",
    headerBg: "bg-emerald-50/70 dark:bg-emerald-950/40",
    headerBorder: "border-b border-emerald-200/60 dark:border-emerald-900/50",
    badgeBg: "bg-emerald-100/90 dark:bg-emerald-950/80",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    badgeBorder: "border-emerald-200 dark:border-emerald-800/80",
    badgeDot: "bg-emerald-500",
  },
  amber: {
    border: "border-amber-200/80 dark:border-amber-900/50",
    selectedRing: "ring-amber-500/40 dark:ring-amber-500/50 border-amber-500",
    headerBg: "bg-amber-50/70 dark:bg-amber-950/40",
    headerBorder: "border-b border-amber-200/60 dark:border-amber-900/50",
    badgeBg: "bg-amber-100/90 dark:bg-amber-950/80",
    badgeText: "text-amber-800 dark:text-amber-300",
    badgeBorder: "border-amber-200 dark:border-amber-800/80",
    badgeDot: "bg-amber-500",
  },
  rose: {
    border: "border-rose-200/80 dark:border-rose-900/50",
    selectedRing: "ring-rose-500/40 dark:ring-rose-500/50 border-rose-500",
    headerBg: "bg-rose-50/70 dark:bg-rose-950/40",
    headerBorder: "border-b border-rose-200/60 dark:border-rose-900/50",
    badgeBg: "bg-rose-100/90 dark:bg-rose-950/80",
    badgeText: "text-rose-700 dark:text-rose-300",
    badgeBorder: "border-rose-200 dark:border-rose-800/80",
    badgeDot: "bg-rose-500",
  },
  zinc: {
    border: "border-zinc-300/80 dark:border-zinc-800/80",
    selectedRing: "ring-zinc-500/40 dark:ring-zinc-400/50 border-zinc-500",
    headerBg: "bg-zinc-100/80 dark:bg-zinc-900/60",
    headerBorder: "border-b border-zinc-200 dark:border-zinc-800",
    badgeBg: "bg-zinc-100 dark:bg-zinc-800",
    badgeText: "text-zinc-700 dark:text-zinc-300",
    badgeBorder: "border-zinc-300 dark:border-zinc-700",
    badgeDot: "bg-zinc-400 dark:bg-zinc-500",
  },
};

export class ProjectFrameShapeUtil extends BaseBoxShapeUtil<TLProjectFrameShape> {
  static override type = "project-frame" as const;
  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    goal: T.string,
    accent: T.optional(T.literalEnum("indigo", "emerald", "amber", "rose", "zinc")),
  };

  override getDefaultProps(): TLProjectFrameShape["props"] {
    return {
      w: 720,
      h: 460,
      title: "New Project",
      goal: "Describe your high-level goal...",
      accent: "indigo",
    };
  }

  override providesBackgroundForChildren() {
    return true;
  }

  override canReceiveNewChildrenOfType(shape: TLShape) {
    return !shape.isLocked;
  }

  override canEdit() {
    return false;
  }

  override onResize(
    shape: TLProjectFrameShape,
    info: TLResizeInfo<TLProjectFrameShape>,
  ) {
    return resizeBox(shape, info, {
      minWidth: 320,
      minHeight: 200,
    });
  }

  override indicator(shape: TLProjectFrameShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={12}
        ry={12}
        fill="none"
        strokeWidth={1.5}
      />
    );
  }

  override component(shape: TLProjectFrameShape) {
    return <ProjectFrameBody shape={shape} />;
  }
}

function ProjectFrameBody({ shape }: { shape: TLProjectFrameShape }) {
  const editor = useEditor();
  const isSelected = useValue(
    "project-frame selected",
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );

  // Auto-calculate progress from tasks whose parentId is this frame OR within its geometry bounds
  const { totalTasks, doneTasks } = useValue(
    "project-frame task progress",
    () => {
      const pageShapes = editor.getCurrentPageShapes();
      const frameX = shape.x;
      const frameY = shape.y;
      const frameR = frameX + shape.props.w;
      const frameB = frameY + shape.props.h;

      let total = 0;
      let done = 0;

      for (const s of pageShapes) {
        if (s.type === "focus-task") {
          const task = s as TLFocusTaskShape;
          // Check if parented directly or contained in bounding box
          const isDirectChild = s.parentId === shape.id;
          const isContained =
            s.x >= frameX &&
            s.x <= frameR &&
            s.y >= frameY &&
            s.y <= frameB;

          if (isDirectChild || isContained) {
            total++;
            if (task.props.status === "done") {
              done++;
            }
          }
        }
      }

      return { totalTasks: total, doneTasks: done };
    },
    [editor, shape.id, shape.props.w, shape.props.h, shape.x, shape.y],
  );

  const update = useCallback(
    (patch: Partial<TLProjectFrameShape["props"]>) => {
      editor.updateShape({
        id: shape.id,
        type: "project-frame",
        props: { ...shape.props, ...patch },
      });
    },
    [editor, shape],
  );

  const titleRef = useRef<HTMLInputElement>(null);
  const goalRef = useRef<HTMLInputElement>(null);

  const onOpenCopilotForProject = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      editor.select(shape.id);
      window.dispatchEvent(
        new CustomEvent("foqz:open-copilot", {
          detail: { shapeId: shape.id, type: "project-frame" },
        }),
      );
    },
    [editor, shape.id],
  );

  const isDark = useValue(
    "isDark",
    () => editor.user.getIsDarkMode(),
    [editor],
  );

  const currentAccent = shape.props.accent || "indigo";
  const accentStyle = ACCENT_STYLES[currentAccent] || ACCENT_STYLES.indigo;

  const cycleAccent = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const accents: ProjectAccent[] = ["indigo", "emerald", "amber", "rose", "zinc"];
      const nextIdx = (accents.indexOf(currentAccent) + 1) % accents.length;
      update({ accent: accents[nextIdx] });
    },
    [currentAccent, update],
  );

  const onDeleteProject = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      editor.deleteShapes([shape.id]);
    },
    [editor, shape.id],
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
        className={`w-full h-full rounded-xl border transition-all flex flex-col select-none overflow-hidden ${
          isDark
            ? isSelected
              ? `${accentStyle.selectedRing} ring-2 bg-zinc-950/70 shadow-2xl`
              : `${accentStyle.border} bg-zinc-950/40 hover:border-zinc-700/80 shadow-md`
            : isSelected
              ? `${accentStyle.selectedRing} ring-2 bg-white/95 shadow-xl`
              : `${accentStyle.border} bg-white/90 hover:border-zinc-300 shadow-sm`
        }`}
        style={{
          backdropFilter: "blur(6px)",
        }}
      >
        {/* Project Frame Header */}
        <div
          className={`w-full px-4 py-2.5 ${accentStyle.headerBorder} ${accentStyle.headerBg} flex items-center justify-between gap-3 text-zinc-900 dark:text-zinc-100 backdrop-blur-sm`}
          onPointerDown={(e) => {
            // Allow dragging the frame by its header
          }}
        >
          {/* Left Title & Goal */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Color accent cycle button */}
            <button
              type="button"
              title="Click to cycle project color accent"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={cycleAccent}
              className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
            >
              <span
                className={`size-2.5 rounded-full block ${accentStyle.badgeDot} ring-2 ring-white dark:ring-zinc-900`}
              />
            </button>

            <input
              ref={titleRef}
              type="text"
              value={shape.props.title}
              placeholder="Project Name"
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => update({ title: e.target.value })}
              className="bg-transparent border-0 outline-none text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:text-zinc-950 dark:focus:text-white shrink-0 min-w-[120px] max-w-[200px]"
            />

            {/* Goal Pill */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/80 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 min-w-0 flex-1 max-w-[420px] hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-xs"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Target className="size-3 text-zinc-400 dark:text-zinc-500 shrink-0" />
              <input
                ref={goalRef}
                type="text"
                value={shape.props.goal}
                placeholder="Goal: Describe high-level objective..."
                onChange={(e) => update({ goal: e.target.value })}
                className="w-full bg-transparent border-0 outline-none text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:text-zinc-950 dark:focus:text-white"
              />
            </div>
          </div>

          {/* Right Actions & Progress */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Progress Badge */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border ${accentStyle.badgeBg} ${accentStyle.badgeText} ${accentStyle.badgeBorder}`}
              title={`${doneTasks} of ${totalTasks} tasks completed in this project`}
            >
              {doneTasks}/{totalTasks} Done
            </span>

            {/* Copilot Plan Button */}
            <button
              type="button"
              title="Break down goal with Copilot"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpenCopilotForProject}
              className="p-1 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Sparkles className="size-3.5" />
            </button>

            {/* Delete Frame Button */}
            <button
              type="button"
              title="Delete Project Frame"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDeleteProject}
              className="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Frame Canvas Interior */}
        <div className="flex-1 w-full relative pointer-events-none" />
      </div>
    </HTMLContainer>
  );
}

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
import { BookOpen, Check, GitBranch, Sparkles, Target, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { TLFocusTaskShape } from "../focusTask/FocusTaskShapeUtil";

export const ALL_PROJECT_ACCENTS = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "indigo",
  "cyan",
  "orange",
  "zinc",
] as const;

export type ProjectAccent = (typeof ALL_PROJECT_ACCENTS)[number];

export type ProjectConnectors = {
  githubRepo?: string;
  notionWorkspace?: string;
  sentryProject?: string;
  mcpServers?: string[];
};

export type TLProjectFrameShape = TLBaseShape<
  "project-frame",
  {
    w: number;
    h: number;
    title: string;
    goal: string;
    accent?: ProjectAccent;
    connectors?: ProjectConnectors;
    projectContext?: string;
    readmeCachedAt?: number;
  }
>;

export const ACCENT_STYLES: Record<
  ProjectAccent,
  {
    name: string;
    dotHex: string;
    border: string;
    selectedRing: string;
    headerBg: string;
    headerBorder: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    badgeDot: string;
    accentText: string;
  }
> = {
  blue: {
    name: "Ocean Blue",
    dotHex: "#3b82f6",
    border: "border-blue-200/90 dark:border-blue-900/60",
    selectedRing: "ring-blue-500/40 dark:ring-blue-500/50 border-blue-500",
    headerBg: "bg-blue-50/70 dark:bg-blue-950/40",
    headerBorder: "border-b border-blue-200/60 dark:border-blue-900/50",
    badgeBg: "bg-blue-100/90 dark:bg-blue-950/80",
    badgeText: "text-blue-700 dark:text-blue-300",
    badgeBorder: "border-blue-200 dark:border-blue-800/80",
    badgeDot: "bg-blue-500",
    accentText: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    name: "Mint Emerald",
    dotHex: "#10b981",
    border: "border-emerald-200/90 dark:border-emerald-900/60",
    selectedRing: "ring-emerald-500/40 dark:ring-emerald-500/50 border-emerald-500",
    headerBg: "bg-emerald-50/70 dark:bg-emerald-950/40",
    headerBorder: "border-b border-emerald-200/60 dark:border-emerald-900/50",
    badgeBg: "bg-emerald-100/90 dark:bg-emerald-950/80",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    badgeBorder: "border-emerald-200 dark:border-emerald-800/80",
    badgeDot: "bg-emerald-500",
    accentText: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    name: "Warm Amber",
    dotHex: "#f59e0b",
    border: "border-amber-200/90 dark:border-amber-900/60",
    selectedRing: "ring-amber-500/40 dark:ring-amber-500/50 border-amber-500",
    headerBg: "bg-amber-50/70 dark:bg-amber-950/40",
    headerBorder: "border-b border-amber-200/60 dark:border-amber-900/50",
    badgeBg: "bg-amber-100/90 dark:bg-amber-950/80",
    badgeText: "text-amber-800 dark:text-amber-300",
    badgeBorder: "border-amber-200 dark:border-amber-800/80",
    badgeDot: "bg-amber-500",
    accentText: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    name: "Soft Rose",
    dotHex: "#f43f5e",
    border: "border-rose-200/90 dark:border-rose-900/60",
    selectedRing: "ring-rose-500/40 dark:ring-rose-500/50 border-rose-500",
    headerBg: "bg-rose-50/70 dark:bg-rose-950/40",
    headerBorder: "border-b border-rose-200/60 dark:border-rose-900/50",
    badgeBg: "bg-rose-100/90 dark:bg-rose-950/80",
    badgeText: "text-rose-700 dark:text-rose-300",
    badgeBorder: "border-rose-200 dark:border-rose-800/80",
    badgeDot: "bg-rose-500",
    accentText: "text-rose-600 dark:text-rose-400",
  },
  indigo: {
    name: "Deep Indigo",
    dotHex: "#6366f1",
    border: "border-indigo-200/90 dark:border-indigo-900/60",
    selectedRing: "ring-indigo-500/40 dark:ring-indigo-500/50 border-indigo-500",
    headerBg: "bg-indigo-50/70 dark:bg-indigo-950/40",
    headerBorder: "border-b border-indigo-200/60 dark:border-indigo-900/50",
    badgeBg: "bg-indigo-100/90 dark:bg-indigo-950/80",
    badgeText: "text-indigo-700 dark:text-indigo-300",
    badgeBorder: "border-indigo-200 dark:border-indigo-800/80",
    badgeDot: "bg-indigo-500",
    accentText: "text-indigo-600 dark:text-indigo-400",
  },
  cyan: {
    name: "Sky Cyan",
    dotHex: "#06b6d4",
    border: "border-cyan-200/90 dark:border-cyan-900/60",
    selectedRing: "ring-cyan-500/40 dark:ring-cyan-500/50 border-cyan-500",
    headerBg: "bg-cyan-50/70 dark:bg-cyan-950/40",
    headerBorder: "border-b border-cyan-200/60 dark:border-cyan-900/50",
    badgeBg: "bg-cyan-100/90 dark:bg-cyan-950/80",
    badgeText: "text-cyan-700 dark:text-cyan-300",
    badgeBorder: "border-cyan-200 dark:border-cyan-800/80",
    badgeDot: "bg-cyan-500",
    accentText: "text-cyan-600 dark:text-cyan-400",
  },
  orange: {
    name: "Vibrant Orange",
    dotHex: "#f97316",
    border: "border-orange-200/90 dark:border-orange-900/60",
    selectedRing: "ring-orange-500/40 dark:ring-orange-500/50 border-orange-500",
    headerBg: "bg-orange-50/70 dark:bg-orange-950/40",
    headerBorder: "border-b border-orange-200/60 dark:border-orange-900/50",
    badgeBg: "bg-orange-100/90 dark:bg-orange-950/80",
    badgeText: "text-orange-700 dark:text-orange-300",
    badgeBorder: "border-orange-200 dark:border-orange-800/80",
    badgeDot: "bg-orange-500",
    accentText: "text-orange-600 dark:text-orange-400",
  },
  zinc: {
    name: "Monochrome Zinc",
    dotHex: "#71717a",
    border: "border-zinc-300/80 dark:border-zinc-800/80",
    selectedRing: "ring-zinc-500/40 dark:ring-zinc-400/50 border-zinc-500",
    headerBg: "bg-zinc-100/80 dark:bg-zinc-900/60",
    headerBorder: "border-b border-zinc-200 dark:border-zinc-800",
    badgeBg: "bg-zinc-100 dark:bg-zinc-800",
    badgeText: "text-zinc-700 dark:text-zinc-300",
    badgeBorder: "border-zinc-300 dark:border-zinc-700",
    badgeDot: "bg-zinc-400 dark:bg-zinc-500",
    accentText: "text-zinc-700 dark:text-zinc-300",
  },
};

export class ProjectFrameShapeUtil extends BaseBoxShapeUtil<TLProjectFrameShape> {
  static override type = "project-frame" as const;
  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    goal: T.string,
    accent: T.optional(
      T.literalEnum("blue", "emerald", "amber", "rose", "indigo", "cyan", "orange", "zinc"),
    ),
    connectors: T.optional(
      T.object({
        githubRepo: T.optional(T.string),
        notionWorkspace: T.optional(T.string),
        sentryProject: T.optional(T.string),
        mcpServers: T.optional(T.arrayOf(T.string)),
      }),
    ),
    projectContext: T.optional(T.string),
    readmeCachedAt: T.optional(T.number),
  };

  override getDefaultProps(): TLProjectFrameShape["props"] {
    return {
      w: 720,
      h: 460,
      title: "New Project",
      goal: "Describe your high-level goal...",
      accent: "blue",
      connectors: {},
      projectContext: "",
      readmeCachedAt: undefined,
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
        rx={24}
        ry={24}
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

  const onOpenConnectors = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      editor.select(shape.id);
      window.dispatchEvent(
        new CustomEvent("foqz:open-project-connectors", {
          detail: { shapeId: shape.id },
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

  const currentAccent = shape.props.accent || "blue";
  const accentStyle = ACCENT_STYLES[currentAccent] || ACCENT_STYLES.blue;

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

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
        className={`w-full h-full rounded-[24px] border transition-all flex flex-col select-none overflow-hidden ${
          isDark
            ? isSelected
              ? `${accentStyle.selectedRing} ring-2 ring-offset-2 ring-offset-zinc-950 bg-zinc-950/75 shadow-2xl`
              : `${accentStyle.border} bg-zinc-950/50 hover:border-zinc-700/80 shadow-lg`
            : isSelected
              ? `${accentStyle.selectedRing} ring-2 ring-offset-2 ring-offset-white bg-white/95 shadow-2xl`
              : `${accentStyle.border} bg-white/90 hover:border-zinc-300/90 shadow-md`
        }`}
        style={{
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Project Frame Header */}
        <div
          className={`w-full px-4 py-2.5 ${accentStyle.headerBorder} ${accentStyle.headerBg} flex items-center justify-between gap-3 text-zinc-900 dark:text-zinc-100 backdrop-blur-md`}
          onPointerDown={(e) => {
            // Allow dragging the frame by its header
          }}
        >
          {/* Left Title & Goal */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Color Accent & Theme Swatch Selector with Portaled Popover */}
            <Popover open={themeMenuOpen} onOpenChange={setThemeMenuOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    title={`Project Theme: ${accentStyle.name} (Click to change theme)`}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="size-7 rounded-full border border-black/10 dark:border-white/20 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer shadow-2xs hover:shadow-xs bg-white dark:bg-zinc-900 shrink-0"
                  />
                }
              >
                <span
                  className={`size-3.5 rounded-full block ${accentStyle.badgeDot} ring-2 ring-white dark:ring-zinc-900`}
                />
              </PopoverTrigger>

              <PopoverContent
                align="start"
                sideOffset={8}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="p-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xl w-52 select-none backdrop-blur-xl z-[10050]"
              >
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold mb-2 px-1">
                  Project Color Theme
                </div>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {ALL_PROJECT_ACCENTS.map((acc) => {
                    const t = ACCENT_STYLES[acc];
                    const isSelected = currentAccent === acc;
                    return (
                      <button
                        key={acc}
                        type="button"
                        title={t.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          update({ accent: acc });
                          setThemeMenuOpen(false);
                        }}
                        className={`size-8 rounded-full flex items-center justify-center border transition-all hover:scale-110 cursor-pointer ${
                          isSelected
                            ? "ring-2 ring-blue-500 scale-105 border-white dark:border-zinc-900 shadow-xs"
                            : "border-black/10 dark:border-white/10 hover:border-zinc-400"
                        }`}
                        style={{ backgroundColor: t.dotHex }}
                      >
                        {isSelected && <Check className="size-3.5 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 px-1 text-[11px] text-zinc-600 dark:text-zinc-300 font-medium flex items-center justify-between">
                  <span>{accentStyle.name}</span>
                  <span className="text-[10px] font-mono uppercase text-zinc-400">{currentAccent}</span>
                </div>
              </PopoverContent>
            </Popover>

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
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/70 dark:border-zinc-800/70 text-xs text-zinc-700 dark:text-zinc-300 min-w-0 flex-1 max-w-[420px] hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-2xs"
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
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Connector Badges */}
            {shape.props.connectors?.githubRepo ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpenConnectors}
                className={`h-7 px-2.5 rounded-full text-[11px] font-medium ${accentStyle.badgeBg} ${accentStyle.badgeText} ${accentStyle.badgeBorder} border hover:opacity-90 cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs`}
                title={`GitHub Repo: ${shape.props.connectors.githubRepo} (Click to edit connectors)`}
              >
                <GitBranch className="size-3 text-current" />
                <span className="font-mono">GH: {shape.props.connectors.githubRepo}</span>
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpenConnectors}
                className="h-7 px-2.5 rounded-full text-[11px] font-medium text-zinc-600 dark:text-zinc-400 bg-white/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-800 border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Connect GitHub repository & 360° tools"
              >
                <GitBranch className="size-3" />
                <span>+ Connect Repo</span>
              </button>
            )}

            {shape.props.connectors?.sentryProject ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpenConnectors}
                className="h-7 px-2.5 rounded-full text-[10px] font-medium bg-rose-100/80 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-200/80 transition-colors cursor-pointer shadow-2xs"
                title={`Sentry: ${shape.props.connectors.sentryProject} (Click to edit)`}
              >
                Sentry
              </button>
            ) : null}

            {shape.props.connectors?.notionWorkspace ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpenConnectors}
                className="h-7 px-2.5 rounded-full text-[10px] font-medium bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 hover:bg-amber-200/80 transition-colors cursor-pointer shadow-2xs"
                title={`Notion: ${shape.props.connectors.notionWorkspace} (Click to edit)`}
              >
                Notion
              </button>
            ) : null}

            {shape.props.connectors?.mcpServers && shape.props.connectors.mcpServers.length > 0 ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpenConnectors}
                className="h-7 px-2.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer shadow-2xs"
                title={`Connected MCP servers: ${shape.props.connectors.mcpServers.join(", ")} (Click to edit)`}
              >
                {shape.props.connectors.mcpServers.length} MCP
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpenConnectors}
                className="h-7 px-2.5 rounded-full text-[10px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-white/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-800 border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Connect MCP tools & services"
              >
                <span>+ Add MCP</span>
              </button>
            )}

            {shape.props.projectContext && shape.props.projectContext.trim().length > 0 ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpenConnectors}
                className="h-7 px-2.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title={`Project Context loaded (${shape.props.projectContext.length} chars). Click to view or edit.`}
              >
                <BookOpen className="size-3 text-emerald-600 dark:text-emerald-400" />
                <span>Context</span>
              </button>
            ) : null}

            {/* Live Progress Badge */}
            <span
              className={`h-7 px-3 rounded-full text-[11px] font-mono font-medium border flex items-center shadow-2xs ${accentStyle.badgeBg} ${accentStyle.badgeText} ${accentStyle.badgeBorder}`}
              title={`${doneTasks} of ${totalTasks} tasks completed in this project`}
            >
              {doneTasks}/{totalTasks} Done
            </span>

            {/* Assistant Plan Button */}
            <button
              type="button"
              title="Break down goal with Assistant"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpenCopilotForProject}
              className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            >
              <Sparkles className="size-3.5" />
            </button>

            {/* Delete Frame Button */}
            <button
              type="button"
              title="Delete Project Frame"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDeleteProject}
              className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
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

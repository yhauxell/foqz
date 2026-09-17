import React, { useState } from "react";
import {
  CheckSquare,
  StickyNote,
  Clock,
  Sparkles,
  ArrowRight,
  Plus,
  Check,
} from "lucide-react";
import type { SpawnableShape } from "@/lib/canvasSpawner";
import { renderMarkdownInline } from "@/lib/markdown";

interface CanvasActionListProps {
  actions: SpawnableShape[];
  onSpawnAll: () => void;
  onSpawnSingle?: (action: SpawnableShape, index: number) => void;
  spawnedCount?: number | null;
}

const PRIORITY_BADGES: Record<
  number,
  { label: string; bg: string; text: string; border: string }
> = {
  1: {
    label: "P1 • Urgent",
    bg: "bg-red-500/10 dark:bg-red-500/20",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-900/60",
  },
  2: {
    label: "P2 • High",
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-900/60",
  },
  3: {
    label: "P3 • Normal",
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-900/60",
  },
  4: {
    label: "P4 • Low",
    bg: "bg-zinc-500/10 dark:bg-zinc-500/20",
    text: "text-zinc-600 dark:text-zinc-400",
    border: "border-zinc-200 dark:border-zinc-800",
  },
};

const NOTE_COLORS: Record<string, { dot: string; label: string }> = {
  yellow: { dot: "bg-amber-400", label: "Yellow" },
  blue: { dot: "bg-sky-400", label: "Blue" },
  green: { dot: "bg-emerald-400", label: "Green" },
  pink: { dot: "bg-pink-400", label: "Pink" },
  red: { dot: "bg-red-400", label: "Red" },
  black: { dot: "bg-zinc-800", label: "Black" },
  grey: { dot: "bg-zinc-400", label: "Grey" },
  violet: { dot: "bg-violet-400", label: "Violet" },
};

export function CanvasActionList({
  actions,
  onSpawnAll,
  onSpawnSingle,
  spawnedCount,
}: CanvasActionListProps) {
  const [singleSpawnedIdx, setSingleSpawnedIdx] = useState<number | null>(null);

  if (!actions || actions.length === 0) return null;

  const handleSingleSpawn = (action: SpawnableShape, index: number) => {
    if (onSpawnSingle) {
      onSpawnSingle(action, index);
      setSingleSpawnedIdx(index);
      setTimeout(() => setSingleSpawnedIdx(null), 2500);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-3 space-y-2.5 font-sans my-2.5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-violet-500" />
          <span className="text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Proposed Canvas Items
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
            {actions.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onSpawnAll}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 transition-colors shadow-xs"
        >
          <span>Spawn All</span>
          <ArrowRight className="size-3" />
        </button>
      </div>

      {/* Structured Elements List */}
      <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200 dark:border-zinc-800/80 rounded-lg overflow-hidden bg-white dark:bg-zinc-950/80">
        {actions.map((action, index) => {
          const isItemSpawned = singleSpawnedIdx === index;

          if (action.type === "task") {
            const prio =
              typeof action.priority === "number" && action.priority in PRIORITY_BADGES
                ? PRIORITY_BADGES[action.priority]
                : PRIORITY_BADGES[3];

            return (
              <div
                key={index}
                className="p-2.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CheckSquare className="size-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 shrink-0" />
                  <span
                    className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border shrink-0 ${prio.bg} ${prio.text} ${prio.border}`}
                  >
                    {prio.label}
                  </span>
                  <span
                    className="text-xs text-zinc-800 dark:text-zinc-200 font-medium truncate"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownInline(action.title || action.text || "New Task"),
                    }}
                  />
                </div>

                <button
                  type="button"
                  title="Spawn this task onto canvas"
                  onClick={() => handleSingleSpawn(action, index)}
                  className="shrink-0 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                >
                  {isItemSpawned ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
              </div>
            );
          }

          if (action.type === "note") {
            const colorKey = action.color || "yellow";
            const colorMeta = NOTE_COLORS[colorKey] || NOTE_COLORS.yellow;

            return (
              <div
                key={index}
                className="p-2.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <StickyNote className="size-3.5 text-amber-500 shrink-0" />
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 shrink-0">
                    <span className={`size-1.5 rounded-full ${colorMeta.dot}`} />
                    <span>{colorMeta.label} Note</span>
                  </span>
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    {action.text || action.title || "Note"}
                  </span>
                </div>

                <button
                  type="button"
                  title="Spawn this note onto canvas"
                  onClick={() => handleSingleSpawn(action, index)}
                  className="shrink-0 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                >
                  {isItemSpawned ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
              </div>
            );
          }

          if (action.type === "timer") {
            const minutes = action.minutes || 15;

            return (
              <div
                key={index}
                className="p-2.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Clock className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
                    {minutes}m Timer
                  </span>
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    Focus Countdown ({minutes} minutes)
                  </span>
                </div>

                <button
                  type="button"
                  title="Spawn this timer onto canvas"
                  onClick={() => handleSingleSpawn(action, index)}
                  className="shrink-0 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                >
                  {isItemSpawned ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Spawn Status Feedback */}
      {spawnedCount !== null && spawnedCount !== undefined && spawnedCount > 0 ? (
        <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
          <Check className="size-3.5" />
          <span>Spawned {spawnedCount} items onto the canvas!</span>
        </div>
      ) : null}
    </div>
  );
}

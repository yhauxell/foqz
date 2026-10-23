import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen,
  X,
  Search,
  RotateCcw,
  Clock,
  Flame,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Folder,
  Tag,
  Zap,
} from "lucide-react";
import type { LogbookDay, LogbookEntry } from "@/types/logbook";
import {
  listLogbookDays,
  searchLogbookEntries,
  removeLogbookEntry,
} from "@/lib/logbookService";
import type { Node } from "@xyflow/react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { orderParentsFirst } from "@/lib/storage/migrate";

export interface LogbookDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function LogbookDrawer({ open, onClose }: LogbookDrawerProps) {
  const [days, setDays] = useState<LogbookDay[]>([]);
  const [selectedWorkdayId, setSelectedWorkdayId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<LogbookEntry & { workdayId: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchDays = useCallback(async () => {
    try {
      const data = await listLogbookDays();
      setDays(data);
      if (data.length > 0 && !selectedWorkdayId) {
        setSelectedWorkdayId(data[0].workdayId);
      }
    } catch (e) {
      console.error("Failed to load logbook days:", e);
    }
  }, [selectedWorkdayId]);

  useEffect(() => {
    if (open) {
      void fetchDays();
    }
  }, [open, fetchDays]);

  // Handle Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLogbookEntries(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const activeDay = useMemo(() => {
    return days.find((d) => d.workdayId === selectedWorkdayId) || days[0] || null;
  }, [days, selectedWorkdayId]);

  const handleRestoreToCanvas = async (entry: LogbookEntry) => {
    setRestoringId(entry.id);
    try {
      // 1. Remove from Logbook
      await removeLogbookEntry(entry.id);

      // 2. Put task back on spatial canvas
      const state = useFlowCanvasStore.getState();
      const existingNode = state.nodes.find((n) => n.id === entry.id);

      if (!existingNode) {
        const fallbackPos = { x: 200, y: 200 };
        const position = entry.lastPosition
          ? { x: entry.lastPosition.x, y: entry.lastPosition.y }
          : fallbackPos;

        // Only rejoin the old region if it still exists; otherwise land on the canvas.
        const parentId =
          entry.lastPosition?.parentId &&
          state.nodes.some((n) => n.id === entry.lastPosition?.parentId)
            ? entry.lastPosition.parentId
            : undefined;

        // Entries swept before v0.14 have no node snapshot: restore them as cards.
        const snapshotData = (entry.node?.data || {}) as Record<string, unknown>;
        const restoredNode: Node = {
          id: entry.id,
          type: entry.node?.type || "focusTask",
          position,
          ...(parentId ? { parentId } : {}),
          ...(entry.node?.style ? { style: entry.node.style as Node["style"] } : {}),
          data: {
            ...(entry.node
              ? snapshotData
              : { title: entry.title, notes: entry.notes || "", borderStyle: "solid" }),
            actionable: true,
            status: "open",
            completedAt: undefined,
            completedVia: undefined,
            focusSecondsSpent: entry.focusSecondsSpent || 0,
          },
        };

        state.setNodes((prev) => orderParentsFirst([...prev, restoredNode]));
      } else {
        // If node was somehow still on canvas, reopen it
        state.updateNodeData(entry.id, {
          status: "open",
          completedAt: undefined,
        });
      }

      // 3. Center canvas on restored node
      window.dispatchEvent(
        new CustomEvent("foqz:flow-center-on", { detail: { id: entry.id } })
      );

      // Refresh list
      await fetchDays();
    } catch (e) {
      console.error("Failed to restore task:", e);
    } finally {
      setRestoringId(null);
    }
  };

  const handleTriggerSweepNow = () => {
    window.dispatchEvent(
      new CustomEvent("foqz:trigger-sweep-now", { detail: { force: true } })
    );
    setTimeout(() => {
      void fetchDays();
    }, 500);
  };

  const formatSeconds = (sec: number = 0) => {
    if (!sec || sec <= 0) return "0m";
    const mins = Math.floor(sec / 60);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remMins}m`;
    return `${mins}m`;
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Logbook"
      className="fixed inset-0 z-[1000] flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border-l border-black/10 dark:border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-5 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <BookOpen className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Logbook
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  Finished Work
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTriggerSweepNow}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Sweep completed canvas tasks into Logbook now"
            >
              <Zap className="size-3 text-amber-500" />
              <span>Sweep Now</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Close Logbook (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-zinc-900/40 shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-3 size-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search historical completed tasks, notes, or projects..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Day Navigation Sidebar (only if not searching) */}
          {!searchQuery && days.length > 0 && (
            <div className="w-48 border-r border-black/[0.06] dark:border-white/[0.06] overflow-y-auto no-scrollbar p-2 flex flex-col gap-1 shrink-0 bg-zinc-50/30 dark:bg-zinc-900/30">
              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                Workdays
              </div>
              {days.map((day) => {
                const isSelected = day.workdayId === selectedWorkdayId;
                const totalSeconds = (day.entries || []).reduce(
                  (acc, curr) => acc + (curr.focusSecondsSpent || 0),
                  0
                );

                return (
                  <button
                    key={day.workdayId}
                    type="button"
                    onClick={() => setSelectedWorkdayId(day.workdayId)}
                    className={`w-full text-left px-2.5 py-2 rounded-xl transition-all cursor-pointer flex flex-col gap-0.5 ${
                      isSelected
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>{day.workdayId}</span>
                      <span className="text-[10px] font-mono opacity-80">
                        {day.entries?.length || 0}
                      </span>
                    </div>
                    {totalSeconds > 0 && (
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                        ⏱ {formatSeconds(totalSeconds)} focus
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Entries Feed */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {searchQuery ? (
              // Search Mode View
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-zinc-500">
                  Search Results ({searchResults.length})
                </div>
                {searchResults.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">
                    No matching completed tasks found for "{searchQuery}".
                  </div>
                ) : (
                  searchResults.map((entry) => (
                    <LogbookEntryCard
                      key={entry.id}
                      entry={entry}
                      workdayId={entry.workdayId}
                      onRestore={handleRestoreToCanvas}
                      isRestoring={restoringId === entry.id}
                      formatSeconds={formatSeconds}
                    />
                  ))
                )}
              </div>
            ) : activeDay ? (
              // Selected Day View
              <div className="flex flex-col gap-3">
                {/* Day Summary Banner */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="size-4 text-amber-600 dark:text-amber-400" />
                    <div>
                      <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                        Workday {activeDay.workdayId}
                      </h3>
                      <p className="text-[10px] text-amber-700 dark:text-amber-300">
                        {activeDay.entries?.length || 0} completed tasks swept
                        {activeDay.sweptAt &&
                          ` • Swept at ${new Date(activeDay.sweptAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                    ⏱{" "}
                    {formatSeconds(
                      (activeDay.entries || []).reduce(
                        (acc, curr) => acc + (curr.focusSecondsSpent || 0),
                        0
                      )
                    )}
                  </div>
                </div>

                {/* Day Entries List */}
                {(!activeDay.entries || activeDay.entries.length === 0) ? (
                  <div className="p-8 text-center text-xs text-zinc-400">
                    No tasks swept for this workday yet.
                  </div>
                ) : (
                  activeDay.entries.map((entry) => (
                    <LogbookEntryCard
                      key={entry.id}
                      entry={entry}
                      workdayId={activeDay.workdayId}
                      onRestore={handleRestoreToCanvas}
                      isRestoring={restoringId === entry.id}
                      formatSeconds={formatSeconds}
                    />
                  ))
                )}
              </div>
            ) : (
              // Completely empty state
              <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
                <BookOpen className="size-8 text-zinc-300 dark:text-zinc-600" />
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Your Logbook is Empty
                </h4>
                <p className="text-[11px] text-zinc-400 max-w-xs">
                  When tasks are checked off during the day, they remain on the canvas until the end of your workday, when they sweep cleanly into this Logbook.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface LogbookEntryCardProps {
  entry: LogbookEntry;
  workdayId?: string;
  onRestore: (entry: LogbookEntry) => void;
  isRestoring: boolean;
  formatSeconds: (sec?: number) => string;
}

function LogbookEntryCard({
  entry,
  workdayId,
  onRestore,
  isRestoring,
  formatSeconds,
}: LogbookEntryCardProps) {

  return (
    <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.06] transition-all flex flex-col gap-2 group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="size-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 className="size-3.5 stroke-[2.5]" />
          </div>

          <div className="min-w-0 flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 leading-snug break-words">
              {entry.title}
            </span>

            {/* Badges / Chips */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {/* Project Tag */}
              {entry.projectTitle && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Folder className="size-2.5" />
                  <span className="truncate max-w-[120px]">{entry.projectTitle}</span>
                </span>
              )}

              {/* Completion Channel */}
              {entry.completedVia && (
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono text-zinc-400 bg-black/5 dark:bg-white/5">
                  via {entry.completedVia}
                </span>
              )}

              {/* Focus Time */}
              {entry.focusSecondsSpent && entry.focusSecondsSpent > 0 ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10">
                  <Clock className="size-2.5" />
                  {formatSeconds(entry.focusSecondsSpent)}
                </span>
              ) : null}

              {workdayId && (
                <span className="text-[9px] font-mono text-zinc-400 ml-auto">
                  {new Date(entry.completedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Restore Action */}
        <button
          type="button"
          disabled={isRestoring}
          onClick={() => onRestore(entry)}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer border border-black/[0.04] dark:border-white/[0.06] active:scale-95 disabled:opacity-50"
          title="Restore this task to spatial canvas coordinates"
        >
          <RotateCcw className={`size-3 ${isRestoring ? "animate-spin" : ""}`} />
          <span>Restore</span>
        </button>
      </div>

      {/* Notes Excerpt if present */}
      {entry.notes && (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 pl-7 border-l-2 border-black/5 dark:border-white/5 ml-2 mt-0.5 font-mono">
          {entry.notes}
        </div>
      )}
    </div>
  );
}

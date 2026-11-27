import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkle, Undo2, X } from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { DEFAULT_TIDY_OPTIONS, planTidy, type TidyOptions } from "@/lib/tidy";
import { mindmapOf } from "@/lib/mindmap/mindmap";
import { runMindmapSync } from "@/poc/hooks/useMindmaps";
import { isActionable } from "@/lib/nodePredicates";

/**
 * "Tidy board" (⌘⇧K): a preview of what will change, then one step you can undo.
 * Works on the selection when there is one, else the whole board.
 */
export function TidyBoardDialog() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<TidyOptions>(DEFAULT_TIDY_OPTIONS);
  const [sweep, setSweep] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const show = () => {
      setSelectedIds(useFlowCanvasStore.getState().nodes.filter((n) => n.selected).map((n) => n.id));
      setResult(null);
      setOpen(true);
    };
    window.addEventListener("foqz:tidy-board", show);
    return () => window.removeEventListener("foqz:tidy-board", show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const nodes = useFlowCanvasStore((s) => s.nodes);
  const edges = useFlowCanvasStore((s) => s.edges);
  // Each option's count is what it would do on its own.
  const preview = useMemo(() => {
    if (!open) return null;
    const all = planTidy(nodes, edges, { resolveOverlaps: true, groupLoose: true, foldMaps: true, packRegions: true }, selectedIds);
    const overlapsOnly = planTidy(nodes, edges, { ...DEFAULT_TIDY_OPTIONS, groupLoose: false }, selectedIds);
    const done = nodes.filter((n) => isActionable(n) && (n.data as any)?.status === "done").length;
    return { all, overlapsOnly, done };
  }, [open, nodes, edges, selectedIds]);

  const apply = useCallback(async () => {
    const store = useFlowCanvasStore.getState();
    const plan = planTidy(store.nodes, store.edges, opts, selectedIds);
    const temporal = useFlowCanvasStore.temporal;
    const before = { nodes: store.nodes, edges: store.edges, annotations: store.annotations };
    const tracking = temporal.getState().isTracking;

    // Everything below is one undo step: record the "before" once, apply quietly.
    if (tracking) temporal.getState().pause();
    const fold = new Set(plan.fold);
    store.setNodes((ns) =>
      ns.map((n) => {
        const to = plan.moves.get(n.id);
        let next = to ? { ...n, position: to } : n;
        if (fold.has(n.id)) next = { ...next, data: { ...next.data, mindmap: { ...mindmapOf(n)!, collapsed: true } } };
        return next;
      })
    );
    const regions = plan.groups.map((group) => store.createProject({ title: "Untitled group", captureNodeIds: group }));
    if (regions.length) {
      // A new region can be larger than its items; make room around it.
      const s2 = useFlowCanvasStore.getState();
      const again = planTidy(s2.nodes, s2.edges, { resolveOverlaps: true, groupLoose: false, foldMaps: false, packRegions: false }, [], regions);
      if (again.moves.size) {
        s2.setNodes((ns) => ns.map((n) => (again.moves.has(n.id) ? { ...n, position: again.moves.get(n.id)! } : n)));
        plan.stats.moved += again.stats.moved;
      }
    }
    runMindmapSync();
    if (tracking) {
      temporal.getState().resume();
      temporal.setState((t: any) => ({ pastStates: [...t.pastStates, before].slice(-100), futureStates: [] }));
    }

    const parts: string[] = [];
    if (plan.stats.moved) parts.push(`moved ${plan.stats.moved}`);
    if (plan.stats.regions) parts.push(`grouped ${plan.stats.grouped} into ${plan.stats.regions} ${plan.stats.regions === 1 ? "region" : "regions"}`);
    if (plan.stats.mapsFolded) parts.push(`folded ${plan.stats.mapsFolded} mind ${plan.stats.mapsFolded === 1 ? "map" : "maps"}`);
    if (plan.stats.packed) parts.push(`packed ${plan.stats.packed} regions`);
    if (sweep) {
      const res = await store.sweepCompletedTasks({ force: true });
      if (res?.sweptCount) parts.push(`swept ${res.sweptCount} done to the logbook`);
      else if (!res) parts.push("sweep skipped during focus");
    }
    setResult(parts.length ? `Tidied: ${parts.join(", ")}.` : "Already tidy. Nothing to change.");
  }, [opts, sweep, selectedIds]);

  if (!open || !preview) return null;
  const { all, overlapsOnly, done } = preview;
  const rows: { key: keyof TidyOptions; label: string; count: number; hint: string }[] = [
    { key: "resolveOverlaps", label: "Separate overlapping elements", count: overlapsOnly.stats.overlapping, hint: "Diagrams, maps and regions move as one piece" },
    { key: "groupLoose", label: "Group loose items into regions", count: all.stats.grouped, hint: `${all.stats.regions} new ${all.stats.regions === 1 ? "region" : "regions"} for clusters of 3+` },
    { key: "foldMaps", label: "Fold mind maps to main branches", count: all.fold.length, hint: "Unfold any time with /" },
    { key: "packRegions", label: "Pack regions into a grid", count: all.stats.packed, hint: "Keeps their order, never resizes" },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 dark:bg-black/40" onPointerDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Tidy board"
        className="w-[min(420px,calc(100vw-32px))] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 pt-4 pb-2">
          <Sparkle className="size-4 mt-0.5 text-sky-500 shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tidy {selectedIds.length ? "selection" : "board"}</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Moves things, never deletes or edits them. One undo puts it all back.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="size-7 rounded-lg grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        {result ? (
          <div className="px-4 py-4 text-[13px] text-zinc-800 dark:text-zinc-200" role="status">
            {result}
          </div>
        ) : (
          <ul className="px-3 py-1 flex flex-col">
            {rows.map((r) => (
              <li key={r.key}>
                <label className={`flex items-start gap-2.5 px-1.5 py-1.5 rounded-lg ${r.count ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer" : "opacity-45"}`}>
                  <input
                    type="checkbox"
                    disabled={!r.count}
                    checked={opts[r.key] && r.count > 0}
                    onChange={(e) => setOpts((o) => ({ ...o, [r.key]: e.target.checked }))}
                    className="mt-0.5 size-3.5 accent-zinc-900 dark:accent-zinc-100"
                  />
                  <span className="flex-1">
                    <span className="block text-[13px] text-zinc-900 dark:text-zinc-100">{r.label}</span>
                    <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{r.hint}</span>
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-zinc-500">{r.count}</span>
                </label>
              </li>
            ))}
            <li>
              <label className={`flex items-start gap-2.5 px-1.5 py-1.5 rounded-lg ${done ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer" : "opacity-45"}`}>
                <input
                  type="checkbox"
                  disabled={!done}
                  checked={sweep && done > 0}
                  onChange={(e) => setSweep(e.target.checked)}
                  className="mt-0.5 size-3.5 accent-zinc-900 dark:accent-zinc-100"
                />
                <span className="flex-1">
                  <span className="block text-[13px] text-zinc-900 dark:text-zinc-100">Sweep done tasks to the logbook</span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Off the board, restorable from the logbook</span>
                </span>
                <span className="text-[11px] font-mono tabular-nums text-zinc-500">{done}</span>
              </label>
            </li>
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800">
          {result ? (
            <>
              <button
                type="button"
                onClick={() => {
                  useFlowCanvasStore.temporal.getState().undo();
                  setOpen(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Undo2 className="size-3.5" /> Undo
              </button>
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer">
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={apply} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer">
                Tidy
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

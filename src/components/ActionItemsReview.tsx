import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { runAgentLoop } from "@/lib/mcpAgentLoop";
import {
  buildExtractionPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  extractionScope,
  parseActionItems,
  type ProposedItem,
} from "@/lib/actionItems";
import { centerOn, createTasks, elementTitle } from "@/lib/derivedTasks";
import { mindmapOf } from "@/lib/mindmap/mindmap";

interface Row extends ProposedItem {
  key: string;
  keep: boolean;
}

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "review" };

/**
 * "Extract action items" (⇧E): the AI proposes tasks from the selected diagram, region or
 * whole board. Every item is a checkbox with editable text; nothing is created until you
 * press Create, and created tasks link back to the element each came from.
 */
export function ActionItemsReview() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [rows, setRows] = useState<Row[]>([]);
  const [scopeLabel, setScopeLabel] = useState("");
  const scopeRef = useRef<{ ids: string[]; fallback: string | null }>({ ids: [], fallback: null });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    const s = useFlowCanvasStore.getState();
    const scope = extractionScope(
      s.nodes,
      s.nodes.filter((n) => n.selected).map((n) => n.id)
    );
    if (!scope.length) {
      setPhase({ kind: "error", message: "Nothing to read here. Select a mind map, region or shapes first." });
      return;
    }
    const root = scope.find((n) => mindmapOf(n)?.parentId === null) ?? scope[0];
    scopeRef.current = { ids: scope.map((n) => n.id), fallback: root.id };
    setScopeLabel(scope.length === 1 ? `“${elementTitle(scope[0])}”` : `${scope.length} elements around “${elementTitle(root)}”`);
    setPhase({ kind: "loading" });
    setRows([]);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await runAgentLoop({
        userPrompt: buildExtractionPrompt(scope, s.edges),
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        tools: [],
        maxSteps: 1,
        signal: controller.signal,
        claudeCode: { profile: "canvas" },
      });
      if (controller.signal.aborted) return;
      if (!res.success && !res.finalText) throw new Error(res.error || "The AI didn't answer.");
      const items = parseActionItems(res.finalText, new Set(scopeRef.current.ids));
      if (!items.length) throw new Error("The AI didn't return any action items. Try again, or add more detail to the diagram.");
      setRows(items.map((it, i) => ({ ...it, key: `${i}-${it.title}`, keep: true })));
      setPhase({ kind: "review" });
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) return;
      setPhase({ kind: "error", message: String(err?.message || err) });
    }
  }, []);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
    setRows([]);
  }, []);

  useEffect(() => {
    const open = () => run();
    window.addEventListener("foqz:extract-action-items", open);
    return () => window.removeEventListener("foqz:extract-action-items", open);
  }, [run]);

  useEffect(() => {
    if (phase.kind === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase.kind, close]);

  if (phase.kind === "idle") return null;
  const kept = rows.filter((r) => r.keep && r.title.trim());

  const create = () => {
    const { fallback } = scopeRef.current;
    const ids = createTasks(
      kept
        .map((r) => ({ sourceId: r.sourceId ?? fallback ?? "", title: r.title.trim(), notes: r.notes ?? "" }))
        .filter((d) => d.sourceId)
    );
    close();
    if (ids[0]) centerOn(ids[0]);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-[1px]" onPointerDown={close}>
      <div
        role="dialog"
        aria-label="Action items"
        className="w-[min(520px,calc(100vw-32px))] max-h-[min(640px,calc(100vh-64px))] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 pt-4 pb-2">
          <Sparkles className="size-4 mt-0.5 text-violet-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Action items</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">From {scopeLabel}. Nothing is added until you create it.</p>
          </div>
          <button type="button" aria-label="Close" onClick={close} className="size-7 rounded-lg grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {phase.kind === "loading" && (
            <div className="py-10 flex flex-col items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="size-5 animate-spin" />
              Reading the diagram…
            </div>
          )}
          {phase.kind === "error" && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <p className="text-xs text-rose-600 dark:text-rose-400 max-w-sm">{phase.message}</p>
              <button type="button" onClick={run} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                <RotateCcw className="size-3.5" /> Try again
              </button>
            </div>
          )}
          {phase.kind === "review" && (
            <ul className="flex flex-col gap-1">
              {rows.map((r, i) => {
                const src = r.sourceId ? useFlowCanvasStore.getState().nodes.find((n) => n.id === r.sourceId) : null;
                return (
                  <li key={r.key} className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <input
                      type="checkbox"
                      checked={r.keep}
                      aria-label={`Keep ${r.title}`}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                      className="mt-1.5 size-3.5 accent-zinc-900 dark:accent-zinc-100 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        value={r.title}
                        aria-label="Action item"
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                        onKeyDown={(e) => e.stopPropagation()}
                        className={`w-full bg-transparent text-[13px] outline-none rounded px-1 py-0.5 focus:bg-zinc-100 dark:focus:bg-zinc-800 ${
                          r.keep ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 line-through"
                        }`}
                      />
                      {src && (
                        <button
                          type="button"
                          onClick={() => centerOn(src.id)}
                          className="px-1 text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                        >
                          ↖ {elementTitle(src)}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800">
          <button type="button" onClick={close} className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={phase.kind !== "review" || kept.length === 0}
            onClick={create}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            Create {kept.length} {kept.length === 1 ? "task" : "tasks"}
          </button>
        </div>
      </div>
    </div>
  );
}

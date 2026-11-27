import { memo } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { ListChecks } from "lucide-react";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { centerOn, derivedStats } from "@/lib/derivedTasks";

/** Done/total badge on every element that has tasks derived from it; click to jump to them. */
export const DerivedTaskBadges = memo(function DerivedTaskBadges() {
  // A string key keeps this from re-rendering on every drag frame.
  const key = useFlowCanvasStore((s) => {
    const ids = new Set(s.nodes.filter((n) => !n.hidden).map((n) => n.id));
    return [...derivedStats(s.nodes).entries()]
      .filter(([id]) => ids.has(id))
      .map(([id, st]) => `${id}|${st.done}|${st.total}|${st.firstOpenId ?? ""}`)
      .join(",");
  });
  if (!key) return null;
  return (
    <>
      {key.split(",").map((entry) => {
        const [id, done, total, firstOpen] = entry.split("|");
        const complete = done === total;
        return (
          <NodeToolbar key={id} nodeId={id} isVisible position={Position.Bottom} align="start" offset={4}>
            <button
              type="button"
              data-derived-badge={id}
              title={complete ? "All derived tasks done" : "Jump to the tasks made from this"}
              aria-label={`${done} of ${total} derived tasks done`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const s = useFlowCanvasStore.getState();
                const target = firstOpen || s.nodes.find((n) => (n.data as any)?.derivedFrom === id)?.id;
                if (target) centerOn(target);
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shadow-sm cursor-pointer pointer-events-auto select-none ${
                complete ? "bg-emerald-600/90 text-white" : "bg-zinc-900/85 text-white dark:bg-zinc-100/90 dark:text-zinc-900"
              }`}
            >
              <ListChecks className="size-3" />
              {done}/{total}
            </button>
          </NodeToolbar>
        );
      })}
    </>
  );
});

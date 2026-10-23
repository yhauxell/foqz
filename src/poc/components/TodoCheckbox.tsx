import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { toggleDone } from "@/lib/nodeBehaviors";

/** Checkbox shown on plain and sticky text that has the to-do behavior switched on. */
export function TodoCheckbox({
  nodeId,
  done,
  size = 16,
  style,
}: {
  nodeId: string;
  done: boolean;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "Mark open" : "Mark done"}
      title={done ? "Mark open" : "Mark done"}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        toggleDone(nodeId);
      }}
      className={`nodrag shrink-0 rounded-[5px] border-2 flex items-center justify-center transition-colors cursor-pointer ${
        done
          ? "bg-emerald-600 border-emerald-600 text-white"
          : "border-zinc-400 dark:border-zinc-500 hover:border-emerald-500 bg-white/60 dark:bg-zinc-900/60"
      }`}
      style={{ width: size, height: size, ...style }}
    >
      {done && <Check className="stroke-[3.5]" style={{ width: size * 0.7, height: size * 0.7 }} />}
    </button>
  );
}

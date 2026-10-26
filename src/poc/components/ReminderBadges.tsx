import { memo } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { BellRing } from "lucide-react";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { formatReminderTime, reminderOf } from "@/lib/reminders";

/** A small bell with the time beside every element that has a reminder still to ring. */
export const ReminderBadges = memo(function ReminderBadges() {
  // A string key keeps this from re-rendering on every drag frame.
  const key = useFlowCanvasStore((s) =>
    s.nodes
      .map((n) => {
        const r = reminderOf(n);
        return r && !r.fired ? `${n.id}|${r.at}` : "";
      })
      .filter(Boolean)
      .join(","),
  );
  if (!key) return null;
  return (
    <>
      {key.split(",").map((entry) => {
        const [id, at] = entry.split("|");
        const label = formatReminderTime(Number(at));
        return (
          <NodeToolbar key={id} nodeId={id} isVisible position={Position.Right} align="start" offset={6}>
            <div
              data-reminder-badge={id}
              title={`Reminder ${new Date(Number(at)).toLocaleString()}`}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-600/90 text-white text-[10px] font-medium shadow-sm pointer-events-none select-none"
            >
              <BellRing className="size-3" />
              {label}
            </div>
          </NodeToolbar>
        );
      })}
    </>
  );
});

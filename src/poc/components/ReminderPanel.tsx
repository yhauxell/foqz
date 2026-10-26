import { useState } from "react";
import type { Node } from "@xyflow/react";
import { formatReminderTime, reminderOf, setReminder } from "@/lib/reminders";
import { ensureNotificationPermission } from "@/lib/focusSessionFeedback";

/** `YYYY-MM-DDTHH:mm` in local time, the value format of <input type="datetime-local">. */
function toLocalInput(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tomorrowAtNine(now = new Date()): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

const PRESETS: { label: string; at: () => number }[] = [
  { label: "In 20 min", at: () => Date.now() + 20 * 60_000 },
  { label: "In 1 hour", at: () => Date.now() + 60 * 60_000 },
  { label: "Tomorrow 9:00", at: () => tomorrowAtNine() },
];

/** Sets, changes or clears the reminder on one element; shown from the element toolbar. */
export function ReminderPanel({ node, onDone }: { node: Node; onDone: () => void }) {
  const current = reminderOf(node);
  const pending = current && !current.fired ? current : null;
  const [value, setValue] = useState(() => toLocalInput(pending?.at ?? Date.now() + 60 * 60_000));

  const save = (at: number) => {
    // Electron notifies from main and needs no permission; the browser build asks once.
    if (!window.focusStore?.reminders) void ensureNotificationPermission();
    setReminder(node.id, at);
    onDone();
  };

  const customAt = new Date(value).getTime();
  const customValid = Number.isFinite(customAt) && customAt > Date.now();

  return (
    <div className="flex flex-col gap-1.5 p-1" data-reminder-panel>
      <div className="px-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        {pending ? `Reminder set for ${formatReminderTime(pending.at)}` : "Remind me about this"}
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => save(p.at())}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="datetime-local"
          aria-label="Reminder time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && customValid) save(customAt);
          }}
          className="flex-1 min-w-0 px-1.5 py-1 text-[11px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-zinc-800 dark:text-zinc-100 outline-none focus:border-violet-500"
        />
        <button
          type="button"
          disabled={!customValid}
          onClick={() => save(customAt)}
          className="px-2 py-1 text-[11px] font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Set
        </button>
      </div>
      {pending && (
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            setReminder(node.id, null);
            onDone();
          }}
          className="self-start px-1 text-[11px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
        >
          Remove reminder
        </button>
      )}
    </div>
  );
}

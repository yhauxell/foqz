import { useEffect } from "react";
import type { Node } from "@xyflow/react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { clearTextFormatting } from "@/poc/utils/textFormatting";
import { nodeTitle } from "./nodePredicates";

/**
 * Element reminders: any node can carry `reminderAt` (epoch ms). When it comes due a desktop
 * notification shows the element's title, and `reminderFiredAt` records that it rang so a reload
 * never repeats it. Setting a new time clears `reminderFiredAt`.
 */
export interface PendingReminder {
  nodeId: string;
  at: number;
  title: string;
}

const BROWSER_CHECK_MS = 15_000;

export function reminderOf(node: Pick<Node, "data"> | null | undefined): { at: number; fired: boolean } | null {
  const d = (node?.data || {}) as Record<string, unknown>;
  const at = Number(d.reminderAt);
  if (!Number.isFinite(at) || at <= 0) return null;
  return { at, fired: Number(d.reminderFiredAt) >= at };
}

export function pendingReminders(nodes: Node[]): PendingReminder[] {
  const out: PendingReminder[] = [];
  for (const n of nodes) {
    const r = reminderOf(n);
    if (!r || r.fired) continue;
    out.push({ nodeId: n.id, at: r.at, title: clearTextFormatting(nodeTitle(n)) });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function setReminder(nodeId: string, at: number | null) {
  useFlowCanvasStore.getState().updateNodeData(nodeId, {
    reminderAt: at ?? undefined,
    reminderFiredAt: undefined,
  });
}

/** Marks a reminder as rung without adding an undo step, so undo cannot make it ring again. */
function markFired(nodeId: string) {
  const temporal = useFlowCanvasStore.temporal.getState();
  temporal.pause();
  try {
    useFlowCanvasStore.getState().updateNodeData(nodeId, { reminderFiredAt: Date.now() });
  } finally {
    temporal.resume();
  }
}

function revealNode(nodeId: string) {
  const store = useFlowCanvasStore.getState();
  if (!store.nodes.some((n) => n.id === nodeId)) return;
  store.setNodes(store.nodes.map((n) => (n.selected !== (n.id === nodeId) ? { ...n, selected: n.id === nodeId } : n)));
  store.setSelectedNodeId(nodeId);
  window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id: nodeId } }));
}

/** Short label for a reminder time: "14:30" today, "Tue 09:00" this week, else "Nov 3, 09:00". */
export function formatReminderTime(at: number, now = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return time;
  if (Math.abs(at - now) < 6 * 24 * 3600_000) {
    return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

/**
 * Keeps the reminder schedule in sync with the canvas. In Electron, main does the timing and
 * the notification; in a plain browser this checks on an interval and uses the Notification API.
 */
export function useReminders() {
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.focusStore?.reminders : undefined;

    if (bridge) {
      let last = "";
      const push = (nodes: Node[]) => {
        const list = pendingReminders(nodes);
        const key = JSON.stringify(list);
        if (key === last) return;
        last = key;
        bridge.set(list);
      };
      push(useFlowCanvasStore.getState().nodes);
      const unsubscribe = useFlowCanvasStore.subscribe((s, prev) => {
        if (s.nodes !== prev.nodes) push(s.nodes);
      });
      const offFired = bridge.onFired(markFired);
      const offOpen = bridge.onOpen(revealNode);
      return () => {
        unsubscribe();
        offFired();
        offOpen();
      };
    }

    const check = () => {
      const now = Date.now();
      for (const r of pendingReminders(useFlowCanvasStore.getState().nodes)) {
        if (r.at > now) break;
        markFired(r.nodeId);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            const n = new Notification("Reminder", { body: r.title });
            n.onclick = () => {
              window.focus();
              revealNode(r.nodeId);
            };
          } catch {
            // ignore
          }
        }
      }
    };
    check();
    const timer = window.setInterval(check, BROWSER_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);
}

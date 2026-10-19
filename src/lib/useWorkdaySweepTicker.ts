import { useEffect, useState, useCallback, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { useFocusAppSettingsOptional } from "@/context/FocusAppSettingsContext";

export interface SweepNotification {
  id: string;
  count: number;
  workdayId: string;
  sweptNodes: Node[];
  sweptEdges: Edge[];
}

/**
 * Background ticker and offline catch-up engine for the Workday Sweep.
 * Automatically runs at scheduled milestones (endMin / startMin) and provides an Undo toast window.
 */
export function useWorkdaySweepTicker() {
  const appSettings = useFocusAppSettingsOptional();
  const sweepCompletedTasks = useFlowCanvasStore((s) => s.sweepCompletedTasks);
  const restoreSweptTasks = useFlowCanvasStore((s) => s.restoreSweptTasks);
  const isTimerRunning = useFlowCanvasStore((s) => s.isTimerRunning);
  const activeFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId);

  const [activeSweepToast, setActiveSweepToast] = useState<SweepNotification | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workingHours = appSettings?.workingHours || { startMin: 540, endMin: 1020 };

  const handleSweepExecution = useCallback(
    async (force: boolean = false) => {
      // Focus guardrail: do not sweep while focus session is ticking
      if (isTimerRunning || activeFocusNodeId) {
        return;
      }

      try {
        const result = await sweepCompletedTasks({
          workingHours,
          force,
        });

        if (result && result.sweptCount > 0) {
          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
          }

          setActiveSweepToast({
            id: `sweep-${Date.now()}`,
            count: result.sweptCount,
            workdayId: result.workdayId,
            sweptNodes: result.sweptNodes,
            sweptEdges: result.sweptEdges,
          });

          toastTimeoutRef.current = setTimeout(() => {
            setActiveSweepToast(null);
          }, 10000);
        }
      } catch (e) {
        console.error("[useWorkdaySweepTicker] sweep failed:", e);
      }
    },
    [isTimerRunning, activeFocusNodeId, sweepCompletedTasks, workingHours]
  );

  // 1. Initial offline catch-up sweep on app mount
  useEffect(() => {
    const timer = setTimeout(() => {
      void handleSweepExecution(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [handleSweepExecution]);

  // 2. Periodic background check every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void handleSweepExecution(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [handleSweepExecution]);

  // 3. Custom event listener for on-demand user sweep
  useEffect(() => {
    const handleTriggerEvent = (e: any) => {
      const force = Boolean(e.detail?.force);
      void handleSweepExecution(force);
    };

    window.addEventListener("foqz:trigger-sweep-now", handleTriggerEvent);
    return () => window.removeEventListener("foqz:trigger-sweep-now", handleTriggerEvent);
  }, [handleSweepExecution]);

  const handleUndo = useCallback(async () => {
    if (!activeSweepToast) return;
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const { sweptNodes, sweptEdges } = activeSweepToast;
    setActiveSweepToast(null);
    await restoreSweptTasks(sweptNodes, sweptEdges);
  }, [activeSweepToast, restoreSweptTasks]);

  const handleDismiss = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setActiveSweepToast(null);
  }, []);

  return {
    activeSweepToast,
    undoSweep: handleUndo,
    dismissSweepToast: handleDismiss,
    triggerSweepNow: () => handleSweepExecution(true),
  };
}

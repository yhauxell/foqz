import React, { useState } from "react";
import { FolderGit2, AlertTriangle, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SKIP_REPARENT_KEY = "foqz_skip_reparent_confirm";

export interface ReparentConfirmState {
  isOpen: boolean;
  nodeId: string;
  nodeTitle: string;
  parentTitle: string;
  originalPosition: { x: number; y: number };
  targetAbsolutePosition: { x: number; y: number };
}

interface ReparentConfirmModalProps {
  state: ReparentConfirmState | null;
  onConfirm: (rememberChoice: boolean) => void;
  onCancel: () => void;
}

export function ReparentConfirmModal({
  state,
  onConfirm,
  onCancel,
}: ReparentConfirmModalProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  React.useEffect(() => {
    if (!state?.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm(dontAskAgain);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [state?.isOpen, onCancel, onConfirm, dontAskAgain]);

  if (!state || !state.isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-100"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-100"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <FolderGit2 className="size-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Move out of project?
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Reparent to main canvas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="size-7 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          Do you want to detach <strong className="font-semibold text-zinc-900 dark:text-zinc-100">"{state.nodeTitle || "this item"}"</strong> from{" "}
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">"{state.parentTitle || "Project"}"</strong> and place it on the root canvas?
        </p>

        <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="size-3.5 rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Don't ask me again
          </span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="h-8 text-xs px-3"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(dontAskAgain)}
            className="h-8 text-xs px-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 font-medium"
          >
            Move Out
          </Button>
        </div>
      </div>
    </div>
  );
}

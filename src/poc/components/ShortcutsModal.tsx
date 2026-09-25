import React, { memo } from "react";
import { CANVAS_SHORTCUTS } from "../shortcuts/shortcutsConfig";
import { X, Keyboard, Sparkles } from "lucide-react";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const ShortcutsModal = memo(function ShortcutsModal({
  open,
  onClose,
}: ShortcutsModalProps) {
  if (!open) return null;

  const categories = ["Tools", "Create", "Canvas & Navigation", "Interactions"] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Keyboard className="size-4" />
            </div>
            <div>
              <h2
                className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
                style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
              >
                Keyboard Shortcuts & Gestures
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Speed up your sketch workflow on the React Flow canvas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {categories.map((cat) => {
            const items = CANVAS_SHORTCUTS.filter((s) => s.category === cat);
            if (items.length === 0) return null;

            return (
              <div key={cat} className="space-y-2">
                <h3
                  className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1"
                  style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                >
                  {cat}
                </h3>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
                  {items.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="flex items-center justify-between px-3.5 py-2.5 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                          {cmd.name}
                        </div>
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                          {cmd.description}
                        </div>
                      </div>

                      <kbd className="shrink-0 px-2 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 shadow-2xs font-mono">
                        {cmd.keyDisplay}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-amber-500" />
            <span>Shortcuts automatically pause while typing inside inputs.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
});

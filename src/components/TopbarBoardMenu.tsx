import { memo, useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit2,
  FileCode,
  ImageIcon,
  Layers,
  Maximize2,
  MoreHorizontal,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlowCanvasStore, useTemporalFlowStore } from "@/poc/store/flowCanvasStore";

interface TopbarBoardMenuProps {
  onZoomToFit?: () => void;
  onZoomTo100?: () => void;
}

export const TopbarBoardMenu = memo(function TopbarBoardMenu({
  onZoomToFit,
  onZoomTo100,
}: TopbarBoardMenuProps) {
  const [boardName, setBoardName] = useState(() => {
    try {
      return localStorage.getItem("foqz_board_name") || "Foqz Board 1";
    } catch {
      return "Foqz Board 1";
    }
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const [editingName, setEditingName] = useState(boardName);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  const pageMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
        setPageMenuOpen(false);
      }
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pastCount = useTemporalFlowStore((state) => state.pastStates.length);
  const futureCount = useTemporalFlowStore((state) => state.futureStates.length);
  const canUndo = pastCount > 0;
  const canRedo = futureCount > 0;

  const selectedNodeId = useFlowCanvasStore((s) => s.selectedNodeId);
  const duplicateSelected = useFlowCanvasStore((s) => s.duplicateSelected);
  const deleteNode = useFlowCanvasStore((s) => s.deleteNode);
  const resetBoard = useFlowCanvasStore((s) => s.resetBoard);

  const handleUndo = useCallback(() => {
    useFlowCanvasStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    useFlowCanvasStore.temporal.getState().redo();
  }, []);

  const handleSaveRename = useCallback(() => {
    const trimmed = editingName.trim();
    if (trimmed) {
      setBoardName(trimmed);
      try {
        localStorage.setItem("foqz_board_name", trimmed);
      } catch {}
    }
    setIsRenaming(false);
  }, [editingName]);

  const handleExportJson = useCallback(() => {
    const { nodes, edges } = useFlowCanvasStore.getState();
    const data = JSON.stringify({ nodes, edges, version: 1 }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${boardName.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setActionsMenuOpen(false);
  }, [boardName]);

  const handleClearBoard = useCallback(() => {
    setActionsMenuOpen(false);
    setShowClearConfirmModal(true);
  }, []);

  const handleConfirmClearBoard = useCallback(() => {
    resetBoard();
    setShowClearConfirmModal(false);
  }, [resetBoard]);

  return (
    <div className="flex items-center gap-1.5">
      {/* 1. Board Selector / Renamer */}
      <div ref={pageMenuRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setPageMenuOpen((v) => !v);
            setActionsMenuOpen(false);
          }}
          className={`h-7 px-2.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer max-w-[160px] ${
            pageMenuOpen ? "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800" : ""
          }`}
          title="Board settings & name"
        >
          <Layers className="size-3.5 text-zinc-500 shrink-0" />
          <span className="truncate max-w-[90px]">{boardName}</span>
          <ChevronDown
            className={`size-3 text-zinc-400 shrink-0 transition-transform ${pageMenuOpen ? "rotate-180" : ""}`}
          />
        </button>

        {pageMenuOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-56 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl text-zinc-900 dark:text-zinc-100 z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold tracking-tight text-zinc-400 dark:text-zinc-500 uppercase">
              <span>Canvas Board</span>
            </div>

            <div className="flex flex-col gap-0.5 py-1">
              <div className="group flex items-center justify-between px-2 py-1.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-white font-medium">
                {isRenaming ? (
                  <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename();
                        if (e.key === "Escape") setIsRenaming(false);
                      }}
                      onBlur={handleSaveRename}
                      className="w-full text-xs px-1.5 py-0.5 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded outline-none text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <Check className="size-3 text-emerald-500 shrink-0" />
                      <span className="truncate">{boardName}</span>
                    </div>

                    <button
                      type="button"
                      title="Rename board"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRenaming(true);
                        setEditingName(boardName);
                      }}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <Edit2 className="size-2.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Undo & Redo History Controls */}
      <div className="flex items-center gap-0.5 px-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={!canUndo}
          onClick={handleUndo}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30"
          title="Undo (⌘Z)"
        >
          <Undo2 className="size-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={!canRedo}
          onClick={handleRedo}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30"
          title="Redo (⌘⇧Z)"
        >
          <Redo2 className="size-3.5" />
        </Button>
      </div>

      {/* 3. Selection Actions (shown when a node is selected) */}
      {selectedNodeId && (
        <div className="flex items-center gap-0.5 pl-1 border-l border-zinc-200 dark:border-zinc-800">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={duplicateSelected}
            className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            title="Duplicate selected item (⌘D)"
          >
            <Copy className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => deleteNode(selectedNodeId)}
            className="text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            title="Delete selected item (⌫)"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}

      {/* 4. Canvas Actions / More Menu (⋮) */}
      <div ref={actionsMenuRef} className="relative">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setActionsMenuOpen((v) => !v);
            setPageMenuOpen(false);
          }}
          className={`text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white ${
            actionsMenuOpen ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white" : ""
          }`}
          title="Board actions & exports"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>

        {actionsMenuOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-48 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl text-zinc-900 dark:text-zinc-100 z-50 animate-in fade-in zoom-in-95 duration-100">
            {/* View controls */}
            <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight">
              View
            </div>
            <button
              type="button"
              onClick={() => {
                onZoomToFit?.();
                window.dispatchEvent(new CustomEvent("foqz:flow-zoom-fit"));
                setActionsMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <div className="flex items-center gap-2">
                <Maximize2 className="size-3 text-zinc-500" />
                <span>Zoom to Fit</span>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">0</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onZoomTo100?.();
                window.dispatchEvent(new CustomEvent("foqz:flow-zoom-reset"));
                setActionsMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <div className="flex items-center gap-2">
                <ZoomIn className="size-3 text-zinc-500" />
                <span>Zoom to 100%</span>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">1</span>
            </button>

            {/* Export section */}
            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight border-t border-zinc-100 dark:border-zinc-800 mt-1">
              Export
            </div>
            <button
              type="button"
              onClick={handleExportJson}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <FileCode className="size-3 text-zinc-500" />
              <span>Export as JSON</span>
            </button>

            {/* Destructive actions */}
            <div className="pt-1 mt-1 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleClearBoard}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors"
              >
                <Trash2 className="size-3 text-red-500" />
                <span>Clear Board</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear Board Confirmation Modal */}
      {showClearConfirmModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setShowClearConfirmModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 text-zinc-900 dark:text-zinc-100 flex flex-col gap-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Clear entire board?</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    This will remove all shapes, tasks, frames, and connections from this board. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowClearConfirmModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleConfirmClearBoard}
                  className="bg-red-600 hover:bg-red-500 text-white"
                >
                  Clear Board
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

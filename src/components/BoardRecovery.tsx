import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, FolderOpen, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCanvasStorage, type BoardBackup } from "@/lib/storage";
import { flushActiveBoard } from "@/lib/storage/boardPersistence";
import { dismissUnreadable, useStorageHealth } from "@/lib/storage/health";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";

/** Backups are kept only by the desktop app, which stores boards as files. */
export const backupsAvailable = () => typeof window !== "undefined" && Boolean(window.focusStore?.boards);

function formatBackupTime(at: number) {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Replace the active board with a backup, as one undo step. The version it replaces is backed up too. */
async function restoreBackup(boardId: string, backupId: string) {
  const storage = getCanvasStorage();
  const snapshot = await storage.readBackup(boardId, backupId);
  if (!snapshot) throw new Error("That backup could not be read.");
  if (useFlowCanvasStore.getState().activeBoardId !== boardId) throw new Error("The board was switched.");
  storage.backupBeforeNextSave(boardId);
  useFlowCanvasStore.setState({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    annotations: snapshot.annotations,
  });
  dismissUnreadable();
}

export function RestoreBackupModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [backups, setBackups] = useState<BoardBackup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getCanvasStorage()
      .listBackups(boardId)
      .then((list) => live && setBackups(list))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [boardId]);

  const restore = async (backupId: string) => {
    setRestoring(backupId);
    setError(null);
    try {
      await restoreBackup(boardId, backupId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoring(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Restore from backup"
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 text-zinc-900 dark:text-zinc-100 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <History className="size-4 text-zinc-500" />
          <h3 className="text-sm font-semibold">Restore from backup</h3>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Earlier versions of this board are kept automatically. Restoring replaces what is on the board now; undo
          brings it back.
        </p>
        <div className="max-h-72 overflow-y-auto -mx-1">
          {error ? (
            <p className="px-1 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          {!backups && !error ? (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-zinc-500">
              <Loader2 className="size-3 animate-spin" /> Loading backups…
            </div>
          ) : backups && backups.length === 0 ? (
            <p className="px-1 py-2 text-xs text-zinc-500">
              No backups yet. One is kept every few minutes while you edit.
            </p>
          ) : (
            backups?.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className="flex-1">{formatBackupTime(b.at)}</span>
                <span className="text-[10px] text-zinc-400 font-mono">{formatSize(b.bytes)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={restoring !== null}
                  onClick={() => void restore(b.id)}
                  aria-label={`Restore backup from ${formatBackupTime(b.at)}`}
                >
                  {restoring === b.id ? <Loader2 className="size-3 animate-spin" /> : "Restore"}
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Topbar indicator for failed saves, and the prompt shown when a board could not be read. */
export function StorageStatus() {
  const saveError = useStorageHealth((s) => s.saveError);
  const unreadable = useStorageHealth((s) => s.unreadable);
  const activeBoardId = useFlowCanvasStore((s) => s.activeBoardId);
  const boardName = useFlowCanvasStore((s) => s.boards.find((b) => b.id === unreadable?.boardId)?.name);
  const [retrying, setRetrying] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await flushActiveBoard();
    } finally {
      setRetrying(false);
    }
  };

  const showUnreadable = unreadable && unreadable.boardId === activeBoardId;

  return (
    <>
      {saveError && (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          title={`Your latest changes are not saved: ${saveError}. Click to try again.`}
          className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-500/20"
        >
          {retrying ? <Loader2 className="size-3 animate-spin" /> : <AlertTriangle className="size-3" />}
          Not saved
        </button>
      )}

      {showUnreadable &&
        !restoreOpen &&
        createPortal(
          <div className="fixed left-1/2 top-16 z-[7000] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-white dark:bg-zinc-900 shadow-2xl p-4 text-zinc-900 dark:text-zinc-100">
            <div role="alert" className="flex items-start gap-2.5">
              <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-500" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">“{boardName || "This board"}” couldn’t be read</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Its saved data is damaged, so an empty board is shown instead. The original data was kept
                  {unreadable.keptAt ? ` in ${unreadable.keptAt}` : ""} and nothing has been overwritten.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {backupsAvailable() && (
                <Button type="button" variant="outline" size="sm" onClick={() => void window.focusStore?.boards?.revealUnreadable()}>
                  <FolderOpen className="size-3.5" /> Show kept data
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={dismissUnreadable}>
                Start empty
              </Button>
              {backupsAvailable() && (
                <Button type="button" size="sm" onClick={() => setRestoreOpen(true)}>
                  <RotateCcw className="size-3.5" /> Restore from backup…
                </Button>
              )}
            </div>
          </div>,
          document.body,
        )}

      {restoreOpen && <RestoreBackupModal boardId={activeBoardId} onClose={() => setRestoreOpen(false)} />}
    </>
  );
}

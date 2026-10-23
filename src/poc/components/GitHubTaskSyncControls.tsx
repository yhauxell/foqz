import { useState } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw, User, UserX } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { listAssignableUsers, type GitHubUser } from "@/lib/githubSync";
import { resolveSyncConflict, syncTask, useGitHubSyncStatus } from "@/lib/githubTaskSync";
import type { SyncField } from "@/lib/githubReconcile";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function avatarUrl(login: string) {
  return `https://github.com/${encodeURIComponent(login)}.png?size=40`;
}

/** Assignee chip with avatar; click to reassign. Changes sync to GitHub via the sync engine. */
export function GitHubAssigneePicker({
  nodeId,
  repo,
  assignee,
}: {
  nodeId: string;
  repo: string;
  assignee: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<GitHubUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next || users) return;
    setError(null);
    listAssignableUsers(repo)
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  const choose = (login: string | null) => {
    setOpen(false);
    useFlowCanvasStore.getState().updateNodeData(nodeId, { githubAssignee: login });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        onClick={stop}
        className="inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full text-[9px] font-mono text-zinc-600 dark:text-zinc-300 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 border border-black/5 dark:border-white/10 shrink-0 cursor-pointer transition-colors"
        title={assignee ? `Assignee: @${assignee} (click to change)` : "Assign on GitHub"}
      >
        {assignee ? (
          <img src={avatarUrl(assignee)} alt="" className="size-3.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        ) : (
          <User className="size-2.5 ml-0.5 text-zinc-500" />
        )}
        <span>{assignee ? `@${assignee}` : "Assign"}</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-56 max-h-64 overflow-y-auto rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl p-1 text-xs nodrag nopan nowheel"
        onClick={stop}
        onPointerDown={stop}
      >
        <button
          type="button"
          onClick={() => choose(null)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <UserX className="size-3.5 text-zinc-400" />
          <span className="flex-1">Unassigned</span>
          {!assignee && <Check className="size-3 text-emerald-500" />}
        </button>
        {error ? (
          <p className="px-2 py-1.5 text-[10px] text-rose-600 dark:text-rose-400">{error}</p>
        ) : !users ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-zinc-500">
            <Loader2 className="size-3 animate-spin" /> Loading collaborators…
          </div>
        ) : (
          users.map((u) => (
            <button
              key={u.login}
              type="button"
              onClick={() => choose(u.login)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <img src={u.avatar_url || avatarUrl(u.login)} alt="" className="size-4 rounded-full" />
              <span className="flex-1 truncate font-mono">@{u.login}</span>
              {assignee?.toLowerCase() === u.login.toLowerCase() && <Check className="size-3 text-emerald-500" />}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Small sync state icon next to the issue chip; click to sync now. */
export function GitHubSyncIndicator({ nodeId }: { nodeId: string }) {
  const runtime = useGitHubSyncStatus((s) => s.byNode[nodeId]);
  const status = runtime?.status;
  if (status === "conflict") return null;

  const title =
    status === "syncing"
      ? "Syncing with GitHub…"
      : status === "error"
        ? `GitHub sync failed: ${runtime?.error ?? "unknown error"} (click to retry)`
        : status === "synced"
          ? "In sync with GitHub (click to sync now)"
          : "Sync with GitHub now";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void syncTask(nodeId);
      }}
      disabled={status === "syncing"}
      className={`inline-flex items-center justify-center size-4 rounded-full shrink-0 transition-colors ${
        status === "error"
          ? "text-rose-500 hover:bg-rose-500/10"
          : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10"
      }`}
      title={title}
    >
      {status === "syncing" ? (
        <Loader2 className="size-2.5 animate-spin" />
      ) : status === "error" ? (
        <AlertTriangle className="size-2.5" />
      ) : (
        <RefreshCw className="size-2.5" />
      )}
    </button>
  );
}

const FIELD_LABELS: Record<SyncField, string> = {
  state: "status",
  assignee: "assignee",
};

/** Shown when the task and its GitHub issue were both changed since the last sync. */
export function GitHubConflictBanner({ nodeId }: { nodeId: string }) {
  const conflict = useGitHubSyncStatus((s) => s.byNode[nodeId]?.conflict);
  const status = useGitHubSyncStatus((s) => s.byNode[nodeId]?.status);
  if (status !== "conflict" || !conflict) return null;

  const fieldList = conflict.fields.map((f) => FIELD_LABELS[f]).join(", ");
  const fields = fieldList.charAt(0).toUpperCase() + fieldList.slice(1);
  const { remote } = conflict;
  const remoteSummary = conflict.fields
    .map((f) =>
      f === "state"
        ? remote.state
        : f === "assignee"
          ? remote.assignee
            ? `@${remote.assignee}`
            : "unassigned"
          : `labels: ${remote.labels.join(", ") || "none"}`,
    )
    .join(" · ");

  return (
    <div
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-800 dark:text-amber-300 nodrag"
      onClick={stop}
      onPointerDown={stop}
    >
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="size-3 mt-px shrink-0" />
        <span>
          {fields} changed here and on GitHub. GitHub has <span className="font-semibold">{remoteSummary}</span>.
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void resolveSyncConflict(nodeId, "mine")}
          className="rounded-md bg-amber-600 px-2 py-0.5 font-semibold text-white hover:bg-amber-700"
        >
          Keep mine
        </button>
        <button
          type="button"
          onClick={() => void resolveSyncConflict(nodeId, "github")}
          className="rounded-md border border-amber-600/50 px-2 py-0.5 font-semibold hover:bg-amber-500/15"
        >
          Use GitHub
        </button>
      </div>
    </div>
  );
}

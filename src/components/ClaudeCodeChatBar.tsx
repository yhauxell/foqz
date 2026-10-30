import { FolderOpen, Play, RotateCcw, X } from "lucide-react";
import { CLAUDE_CODE_PROFILES, type ClaudeCodeProfile } from "@/lib/appSettings";
import type { ClaudeCodeFolderAccess } from "@/lib/claudeCode";
import { PROFILE_LABELS } from "@/lib/claudeCodeTask";

function folderName(access: ClaudeCodeFolderAccess | null): string {
  if (!access) return "…";
  if (!access.ok) return "Folder missing";
  if (access.isDefault) return "Foqz folder";
  const parts = (access.cwd || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || access.cwd || "/";
}

/**
 * The strip under the chat header when Claude Code is the AI: which folder runs use and what
 * they may do there, the session, and "Run task" for to-dos.
 */
export function ClaudeCodeChatBar({
  access,
  hasOwnFolder,
  ownFolderLabel,
  onPickFolder,
  onClearFolder,
  onProfileChange,
  sessionActive,
  onNewSession,
  canRunTask,
  onRunTask,
  busy,
}: {
  access: ClaudeCodeFolderAccess | null;
  /** The item (not its region or Settings) has a folder of its own. */
  hasOwnFolder: boolean;
  ownFolderLabel: string;
  onPickFolder: () => void;
  onClearFolder: () => void;
  onProfileChange: (profile: ClaudeCodeProfile) => void;
  sessionActive: boolean;
  onNewSession: () => void;
  canRunTask: boolean;
  onRunTask: () => void;
  busy: boolean;
}) {
  const profile = access?.ok ? access.profile || "canvas" : "canvas";
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-zinc-50/70 dark:bg-zinc-900/40 text-[10px] shrink-0"
      data-claude-code-bar
    >
      <button
        type="button"
        onClick={onPickFolder}
        title={access?.ok ? `Runs in ${access.cwd}. Click to choose a folder for ${ownFolderLabel}.` : access?.error}
        className={`inline-flex items-center gap-1 min-w-0 max-w-[140px] px-1.5 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer ${
          access && !access.ok ? "text-rose-600 dark:text-rose-400" : "text-zinc-600 dark:text-zinc-300"
        }`}
      >
        <FolderOpen className="size-3 shrink-0" />
        <span className="truncate font-mono" data-testid="claude-code-folder">
          {folderName(access)}
        </span>
      </button>
      {hasOwnFolder && (
        <button
          type="button"
          onClick={onClearFolder}
          title="Stop using this item's own folder"
          className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
        >
          <X className="size-3" />
        </button>
      )}
      <select
        aria-label="Claude Code access for this folder"
        value={profile}
        disabled={!access?.ok || access.isDefault || access.protectedFolder}
        title={
          access?.isDefault
            ? "The Foqz folder is always canvas-only. Choose a folder to give Claude Code file access."
            : access?.protectedFolder
              ? "This folder is always canvas-only: it is the root, your home folder, or holds Foqz's own settings. Choose a project folder."
              : "What Claude Code may do in this folder (shared by everything using it)"
        }
        onChange={(e) => onProfileChange(e.target.value as ClaudeCodeProfile)}
        className={`h-5 rounded-md border px-1 text-[10px] bg-transparent ${
          profile === "workspace"
            ? "border-amber-400 text-amber-700 dark:text-amber-300"
            : "border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-300"
        }`}
      >
        {CLAUDE_CODE_PROFILES.map((p) => (
          <option key={p} value={p}>
            {PROFILE_LABELS[p]}
          </option>
        ))}
      </select>
      <span className="flex-1" />
      {sessionActive && (
        <button
          type="button"
          onClick={onNewSession}
          disabled={busy}
          title="Forget the Claude Code session; the next message starts a new one"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer disabled:opacity-40"
        >
          <RotateCcw className="size-3" />
          New session
        </button>
      )}
      {canRunTask && (
        <button
          type="button"
          onClick={onRunTask}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 cursor-pointer disabled:opacity-40"
        >
          <Play className="size-3 fill-current" />
          Run task
        </button>
      )}
    </div>
  );
}

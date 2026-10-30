import { useEffect, useState } from "react";
import { FolderOpen, Search } from "lucide-react";
import { CLAUDE_CODE_PROFILES, type ClaudeCodeProfile } from "@/lib/appSettings";
import { PROFILE_LABELS } from "@/lib/claudeCodeTask";

const PROFILE_HINTS: Record<ClaudeCodeProfile, string> = {
  canvas: "Claude Code only changes the canvas. It cannot see files.",
  read: "Claude Code can read and search files in this folder.",
  workspace:
    "Claude Code can read and edit files here and run the shell commands allowed in Settings → Intelligence. Imported GitHub issues land in its prompt, so only use this for folders you would let a stranger's issue touch with your review.",
};

/**
 * A local folder for Claude Code runs plus what Claude Code may do there. The access level
 * belongs to the folder (Settings → Intelligence), so every item using the folder shares it.
 */
export function ClaudeCodeFolderField({
  folder,
  onFolderChange,
  profile,
  onProfileChange,
  githubRepo,
}: {
  folder: string;
  onFolderChange: (folder: string) => void;
  profile: ClaudeCodeProfile;
  onProfileChange: (profile: ClaudeCodeProfile) => void;
  /** `owner/repo`, to look for a local clone. */
  githubRepo?: string;
}) {
  const api = typeof window !== "undefined" ? window.focusStore?.claudeCode : undefined;
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!api || !folder.trim()) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api.resolve({ folder }).then((r) => {
        if (cancelled) return;
        setStatus(r.ok ? { ok: true, text: r.cwd || folder } : { ok: false, text: r.error || "Folder not found." });
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [api, folder]);

  if (!api) return null;

  const findClone = async () => {
    if (!githubRepo) return;
    setSearching(true);
    try {
      const found = await api.findClone(githubRepo);
      if (found) onFolderChange(found);
      else setStatus({ ok: false, text: `No clone of ${githubRepo} found in ~/projects, ~/code, ~/src and similar folders.` });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2" data-claude-code-folder>
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="~/projects/my-repo"
          aria-label="Local folder"
          value={folder}
          onChange={(e) => onFolderChange(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder:font-sans placeholder:text-zinc-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="button"
          onClick={async () => {
            const picked = await api.pickFolder();
            if (picked) onFolderChange(picked);
          }}
          className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <FolderOpen className="size-3.5" />
          Browse
        </button>
        {githubRepo && (
          <button
            type="button"
            disabled={searching}
            onClick={() => void findClone()}
            title={`Look for a local clone of ${githubRepo}`}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
          >
            <Search className="size-3.5" />
            {searching ? "Looking..." : "Find clone"}
          </button>
        )}
      </div>
      {status && (
        <p className={`text-[11px] font-mono truncate ${status.ok ? "text-zinc-500" : "text-red-600 dark:text-red-400"}`}>
          {status.text}
        </p>
      )}
      {folder.trim() && (
        <>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800" role="radiogroup" aria-label="Claude Code access">
            {CLAUDE_CODE_PROFILES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={profile === p}
                onClick={() => onProfileChange(p)}
                className={`py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                  profile === p
                    ? p === "workspace"
                      ? "bg-amber-500 text-white shadow-2xs"
                      : "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {PROFILE_LABELS[p]}
              </button>
            ))}
          </div>
          <p className={`text-[11px] ${profile === "workspace" ? "text-amber-700 dark:text-amber-300" : "text-zinc-500 dark:text-zinc-400"}`}>
            {PROFILE_HINTS[profile]}
          </p>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLAUDE_CODE_PROFILES,
  normalizeBashAllowlist,
  type AppSettings,
  type ClaudeCodeFolder,
  type ClaudeCodeProfile,
} from "@/lib/appSettings";
import { PROFILE_LABELS } from "@/lib/claudeCodeTask";
import type { ClaudeCodeDetectResult } from "@/lib/claudeCode";

/** Settings → Intelligence card for running the local Claude Code CLI from the canvas chat. */
export function ClaudeCodeSettings({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (partial: Partial<AppSettings>) => unknown;
}) {
  const api = typeof window !== "undefined" ? window.focusStore?.claudeCode : undefined;
  const [pathDraft, setPathDraft] = useState(settings.claudeCodePath || "");
  const [cwdDraft, setCwdDraft] = useState(settings.claudeCodeCwd || "");
  const [modelDraft, setModelDraft] = useState(settings.claudeCodeModel || "");
  const [status, setStatus] = useState<ClaudeCodeDetectResult | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!api) return;
    setChecking(true);
    try {
      setStatus(await api.detect());
    } finally {
      setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    if (settings.claudeCodeEnabled) void check();
  }, [settings.claudeCodeEnabled, settings.claudeCodePath, check]);

  if (!api) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/60 p-5 shadow-sm text-[11px] text-muted-foreground">
        Claude Code runs only in the Foqz desktop app.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/60 p-5 shadow-sm" data-claude-code-settings>
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
          <div>
            <div className="text-xs font-semibold text-foreground">Enable Claude Code</div>
            <div className="text-[11px] text-muted-foreground">
              Chat with your local Claude Code from the canvas. It uses your Claude login and edits the board
              through the Foqz MCP server.
            </div>
          </div>
          <input
            type="checkbox"
            aria-label="Enable Claude Code"
            className="size-4 shrink-0 rounded border-border accent-primary"
            checked={settings.claudeCodeEnabled === true}
            onChange={(e) => void update({ claudeCodeEnabled: e.target.checked })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Path to claude</label>
            <Input
              inputSize="sm"
              placeholder="Found automatically"
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={() => void update({ claudeCodePath: pathDraft.trim() })}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Working folder</label>
            <Input
              inputSize="sm"
              placeholder="An empty folder Foqz owns"
              value={cwdDraft}
              onChange={(e) => setCwdDraft(e.target.value)}
              onBlur={() => void update({ claudeCodeCwd: cwdDraft.trim() })}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Runs at once</label>
            <Input
              inputSize="sm"
              type="number"
              min={1}
              max={10}
              aria-label="Runs at once"
              defaultValue={settings.claudeCodeMaxRuns ?? 3}
              onBlur={(e) => void update({ claudeCodeMaxRuns: Number(e.target.value) || 3 })}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Timeout (minutes)</label>
            <Input
              inputSize="sm"
              type="number"
              min={1}
              max={240}
              aria-label="Timeout in minutes"
              defaultValue={settings.claudeCodeTimeoutMinutes ?? 15}
              onBlur={(e) => void update({ claudeCodeTimeoutMinutes: Number(e.target.value) || 15 })}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Model</label>
            <Input
              inputSize="sm"
              placeholder="Claude Code default"
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              onBlur={() => void update({ claudeCodeModel: modelDraft.trim() })}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <FolderAccessList folders={settings.claudeCodeFolders || []} update={update} />

        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
          <Button type="button" variant="outline" size="sm" disabled={checking} onClick={() => void check()}>
            {checking ? "Checking..." : "Find Claude Code"}
          </Button>
          {status && (
            <span
              className={`text-xs ${status.ok ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive"}`}
            >
              {status.ok
                ? `${status.version}${status.canvasTools ? "" : " · turn on the Foqz MCP server in Integrations so it can edit the canvas"}`
                : status.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const PROFILE_HELP: Record<ClaudeCodeProfile, string> = {
  canvas: "Canvas tools only, no files.",
  read: "Read and search files in the folder.",
  workspace: "Read and edit files, and run the commands below.",
};

/**
 * What Claude Code may do in each folder. Folders not listed are canvas-only. Regions and to-dos
 * pick a folder in their connectors; access is set here (or there) and shared by everything
 * using the folder.
 */
function FolderAccessList({
  folders,
  update,
}: {
  folders: ClaudeCodeFolder[];
  update: (partial: Partial<AppSettings>) => unknown;
}) {
  const api = typeof window !== "undefined" ? window.focusStore?.claudeCode : undefined;
  const save = (next: ClaudeCodeFolder[]) => void update({ claudeCodeFolders: next });
  const patch = (path: string, change: Partial<ClaudeCodeFolder>) =>
    save(folders.map((f) => (f.path === path ? { ...f, ...change } : f)));

  const addFolder = async () => {
    const picked = await api?.pickFolder();
    if (!picked) return;
    const resolved = await api?.resolve({ folder: picked });
    const path = resolved?.ok && resolved.cwd ? resolved.cwd : picked;
    if (folders.some((f) => f.path === path)) return;
    save([...folders, { path, profile: "read", bashAllowlist: [] }]);
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/40" data-claude-code-folders>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-foreground">Folder access</div>
          <div className="text-[11px] text-muted-foreground">
            Folders not listed are canvas-only. Imported GitHub issues can reach the prompt, so grant the least you need.
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void addFolder()}>
          Add folder
        </Button>
      </div>
      {folders.map((f) => (
        <div key={f.path} className="rounded-xl border border-border/60 p-3 space-y-2" data-folder-path={f.path}>
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-foreground" title={f.path}>
              {f.path}
            </span>
            <select
              aria-label={`Access for ${f.path}`}
              value={f.profile}
              onChange={(e) => patch(f.path, { profile: e.target.value as ClaudeCodeProfile })}
              className="h-7 rounded-md border border-border bg-background px-2 text-[11px]"
            >
              {CLAUDE_CODE_PROFILES.map((p) => (
                <option key={p} value={p}>
                  {PROFILE_LABELS[p]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => save(folders.filter((x) => x.path !== f.path))}
              className="text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
            >
              Remove
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground">{PROFILE_HELP[f.profile]}</div>
          {f.profile === "workspace" && (
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                Allowed commands (one per line, matched as a prefix)
              </label>
              <textarea
                aria-label={`Allowed commands for ${f.path}`}
                rows={3}
                placeholder={"npm test\ngit status\ngit diff"}
                defaultValue={f.bashAllowlist.join("\n")}
                onBlur={(e) => patch(f.path, { bashAllowlist: normalizeBashAllowlist(e.target.value.split("\n")) })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              />
              <div className="text-[10px] text-muted-foreground">
                No commands means no shell. Characters like ( ) , : * are not allowed.
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

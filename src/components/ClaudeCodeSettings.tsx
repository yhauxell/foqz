import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppSettings } from "@/lib/appSettings";
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
              placeholder="Home folder"
              value={cwdDraft}
              onChange={(e) => setCwdDraft(e.target.value)}
              onBlur={() => void update({ claudeCodeCwd: cwdDraft.trim() })}
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

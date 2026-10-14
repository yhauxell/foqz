import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { McpHostStatus } from "@/lib/mcpTypes";
import { AlertCircle, Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ClientId = "claude-code" | "claude-desktop" | "cursor";

const CLIENTS: { id: ClientId; label: string; hint: string }[] = [
  { id: "claude-code", label: "Claude Code", hint: "Run in a terminal." },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    hint: "Add to claude_desktop_config.json (bridged over stdio with mcp-remote).",
  },
  { id: "cursor", label: "Cursor", hint: "Add to ~/.cursor/mcp.json." },
];

function clientSnippet(client: ClientId, url: string, token: string): string {
  switch (client) {
    case "claude-code":
      return `claude mcp add --transport http foqz ${url} --header "Authorization: Bearer ${token}"`;
    case "claude-desktop":
      return JSON.stringify(
        {
          mcpServers: {
            foqz: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", "Authorization:${FOQZ_AUTH}"],
              env: { FOQZ_AUTH: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      );
    case "cursor":
      return JSON.stringify(
        { mcpServers: { foqz: { url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      );
  }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  }, []);
  return { copied, copy };
}

/**
 * Controls for the embedded Foqz MCP server that lets external agents drive the canvas.
 */
export function McpHostSettings() {
  const api = typeof window !== "undefined" ? window.focusStore?.mcpHost : undefined;
  const [status, setStatus] = useState<McpHostStatus | null>(null);
  const [portDraft, setPortDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [client, setClient] = useState<ClientId>("claude-code");
  const { copied, copy } = useCopy();

  const apply = useCallback((next: McpHostStatus) => {
    setStatus(next);
    setPortDraft(String(next.port));
  }, []);

  useEffect(() => {
    if (!api) return;
    api.getStatus().then(apply).catch(() => {});
  }, [api, apply]);

  const run = useCallback(
    async (fn: () => Promise<McpHostStatus>) => {
      setBusy(true);
      try {
        apply(await fn());
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  if (!api) {
    return (
      <p className="text-xs text-muted-foreground">
        The Foqz MCP server is only available in the desktop app.
      </p>
    );
  }
  if (!status) return null;

  const portValue = Number(portDraft);
  const portValid = Number.isInteger(portValue) && portValue >= 1024 && portValue <= 65535;
  const portDirty = portDraft !== String(status.port);
  const maskedToken = `${status.token.slice(0, 4)}${"•".repeat(16)}`;
  const snippet = clientSnippet(client, status.url, status.token);
  const displayedSnippet = showToken ? snippet : clientSnippet(client, status.url, maskedToken);
  const statusLabel =
    status.status === "running"
      ? "Running"
      : status.status === "error"
        ? "Error"
        : status.status === "starting"
          ? "Starting"
          : "Stopped";
  const statusColor =
    status.status === "running"
      ? "bg-emerald-500"
      : status.status === "error"
        ? "bg-red-500"
        : "bg-muted-foreground/40";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Let Claude, Cursor, and other agents read your board, create tasks and notes, and start
        focus sessions. The server only listens on this machine and requires the access token below.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${statusColor}`} />
            <span className="text-xs font-semibold text-foreground">{statusLabel}</span>
            {status.status === "running" ? (
              <span className="text-[11px] text-muted-foreground">
                {status.toolCount} tools exposed
              </span>
            ) : null}
          </div>
          <span className="truncate font-mono text-[11px] text-muted-foreground" title={status.url}>
            {status.url}
          </span>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
          <span>Enable</span>
          <input
            type="checkbox"
            className="size-4 shrink-0 rounded border-border accent-primary disabled:opacity-50"
            checked={status.enabled}
            disabled={busy}
            onChange={(e) => void run(() => api.updateConfig({ enabled: e.target.checked }))}
          />
        </label>
      </div>

      {status.error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{status.error}</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Port</span>
          <div className="flex gap-1.5">
            <Input
              className="h-8 font-mono text-xs"
              inputMode="numeric"
              value={portDraft}
              onChange={(e) => setPortDraft(e.target.value.replace(/[^\d]/g, ""))}
            />
            {portDirty ? (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={!portValid || busy}
                onClick={() => void run(() => api.updateConfig({ port: portValue }))}
              >
                Save
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Access token</span>
          <div className="flex gap-1.5">
            <Input
              readOnly
              className="h-8 font-mono text-xs"
              value={showToken ? status.token : maskedToken}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              title={showToken ? "Hide token" : "Show token"}
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              title="Copy token"
              onClick={() => copy("token", status.token)}
            >
              {copied === "token" ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              title="Generate a new token (connected agents must be reconfigured)"
              disabled={busy}
              onClick={() => void run(() => api.regenerateToken())}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {CLIENTS.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant={client === c.id ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setClient(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {CLIENTS.find((c) => c.id === client)?.hint}
        </p>
        <div className="relative">
          <pre className="max-h-56 overflow-auto rounded-lg border border-border/70 bg-muted/40 p-3 pr-10 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
            {displayedSnippet}
          </pre>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1.5 top-1.5 h-7 px-2"
            title="Copy configuration"
            onClick={() => copy("snippet", snippet)}
          >
            {copied === "snippet" ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

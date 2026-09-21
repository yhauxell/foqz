import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  McpConfigFile,
  McpServerConfig,
  McpServerStatus,
  McpTool,
} from "@/lib/mcpTypes";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Globe,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface QuickTemplate {
  name: string;
  label: string;
  description: string;
  config: McpServerConfig;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    name: "filesystem",
    label: "Local Filesystem",
    description: "Secure local file access for reading, writing, and directory listing",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users"],
      enabled: true,
    },
  },
  {
    name: "github",
    label: "GitHub",
    description: "Search repos, inspect files, manage issues, and create pull requests",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
      enabled: true,
    },
  },
  {
    name: "sqlite",
    label: "SQLite Database",
    description: "Query and inspect SQLite database tables, views, and schemas",
    config: {
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-sqlite", "--db-path", "~/database.sqlite"],
      enabled: true,
    },
  },
  {
    name: "memory",
    label: "Knowledge Graph / Memory",
    description: "Persistent graph-based entity memory across sessions",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      enabled: true,
    },
  },
];

export function McpSettingsTab() {
  const isElectron = typeof window !== "undefined" && !!window.focusStore?.mcp;

  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [config, setConfig] = useState<McpConfigFile>({ mcpServers: {} });
  const [configPath, setConfigPath] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [restartingServer, setRestartingServer] = useState<string | null>(null);

  // Tools inspection per server
  const [expandedToolsServer, setExpandedToolsServer] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, McpTool[]>>({});
  const [loadingTools, setLoadingTools] = useState(false);

  // Add / Edit Server Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formTransport, setFormTransport] = useState<"stdio" | "sse">("stdio");
  const [formCommand, setFormCommand] = useState("npx");
  const [formArgs, setFormArgs] = useState("-y @modelcontextprotocol/server-filesystem /Users");
  const [formUrl, setFormUrl] = useState("http://localhost:3000/sse");
  const [formEnv, setFormEnv] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch initial MCP status & config
  const refreshData = useCallback(async () => {
    if (!isElectron || !window.focusStore?.mcp) return;
    try {
      setRefreshing(true);
      const [serversList, mcpCfg, cfgPath] = await Promise.all([
        window.focusStore.mcp.listServers().catch(() => []),
        window.focusStore.mcp.getConfig().catch(() => ({ mcpServers: {} })),
        window.focusStore.mcp.getConfigPath().catch(() => ""),
      ]);
      setServers(serversList || []);
      setConfig(mcpCfg || { mcpServers: {} });
      setConfigPath(cfgPath || "");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("foqz:mcp-updated"));
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [isElectron]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // Copy config path to clipboard
  const handleCopyPath = useCallback(() => {
    if (!configPath) return;
    navigator.clipboard.writeText(configPath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  }, [configPath]);

  // Toggle enable/disable server
  const handleToggleServer = useCallback(
    async (serverName: string, currentEnabled: boolean) => {
      if (!isElectron || !window.focusStore?.mcp) return;
      const targetConfig = config.mcpServers[serverName];
      if (!targetConfig) return;

      const updatedConfig: McpConfigFile = {
        mcpServers: {
          ...config.mcpServers,
          [serverName]: {
            ...targetConfig,
            enabled: !currentEnabled,
          },
        },
      };

      // Optimistic update
      setConfig(updatedConfig);
      setServers((prev) =>
        prev.map((s) =>
          s.name === serverName
            ? {
                ...s,
                enabled: !currentEnabled,
                status: !currentEnabled ? "connecting" : "disabled",
              }
            : s,
        ),
      );

      await window.focusStore.mcp.saveConfig(updatedConfig);
      await refreshData();
    },
    [config, isElectron, refreshData],
  );

  // Restart a server
  const handleRestartServer = useCallback(
    async (serverName: string) => {
      if (!isElectron || !window.focusStore?.mcp) return;
      setRestartingServer(serverName);
      try {
        await window.focusStore.mcp.restartServer(serverName);
        await refreshData();
        if (expandedToolsServer === serverName) {
          const tools = await window.focusStore.mcp.listTools(serverName);
          setServerTools((prev) => ({ ...prev, [serverName]: tools || [] }));
        }
      } catch {
        // ignore
      } finally {
        setRestartingServer(null);
      }
    },
    [expandedToolsServer, isElectron, refreshData],
  );

  // Delete server
  const handleDeleteServer = useCallback(
    async (serverName: string) => {
      if (!isElectron || !window.focusStore?.mcp) return;
      if (!window.confirm(`Are you sure you want to remove MCP server "${serverName}"?`)) {
        return;
      }

      const updatedServers = { ...config.mcpServers };
      delete updatedServers[serverName];

      const updatedConfig: McpConfigFile = {
        mcpServers: updatedServers,
      };

      setConfig(updatedConfig);
      await window.focusStore.mcp.saveConfig(updatedConfig);
      await refreshData();
      if (expandedToolsServer === serverName) {
        setExpandedToolsServer(null);
      }
    },
    [config, expandedToolsServer, isElectron, refreshData],
  );

  // Expand / collapse tools view
  const toggleToolsExpanded = useCallback(
    async (serverName: string) => {
      if (expandedToolsServer === serverName) {
        setExpandedToolsServer(null);
        return;
      }

      setExpandedToolsServer(serverName);
      if (!serverTools[serverName]) {
        setLoadingTools(true);
        try {
          const tools = await window.focusStore?.mcp?.listTools(serverName);
          setServerTools((prev) => ({ ...prev, [serverName]: tools || [] }));
        } catch {
          // ignore
        } finally {
          setLoadingTools(false);
        }
      }
    },
    [expandedToolsServer, serverTools],
  );

  // Apply a quick template
  const applyTemplate = useCallback((tpl: QuickTemplate) => {
    setFormName(tpl.name);
    setFormTransport(tpl.config.transport || "stdio");
    if (tpl.config.transport === "sse") {
      setFormUrl(tpl.config.url || "");
    } else {
      setFormCommand(tpl.config.command || "npx");
      setFormArgs((tpl.config.args || []).join(" "));
      if (tpl.config.env) {
        setFormEnv(
          Object.entries(tpl.config.env)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n"),
        );
      } else {
        setFormEnv("");
      }
    }
    setFormError(null);
  }, []);

  // Open add form
  const handleOpenAddForm = useCallback(() => {
    setEditingServerName(null);
    setFormName("");
    setFormTransport("stdio");
    setFormCommand("npx");
    setFormArgs("");
    setFormUrl("http://localhost:3000/sse");
    setFormEnv("");
    setFormError(null);
    setIsAdding(true);
  }, []);

  // Open edit form
  const handleOpenEditForm = useCallback(
    (serverName: string) => {
      const target = config.mcpServers[serverName];
      if (!target) return;

      setEditingServerName(serverName);
      setFormName(serverName);
      setFormTransport(target.transport || "stdio");
      if (target.transport === "sse") {
        setFormUrl(target.url || "");
      } else {
        setFormCommand(target.command || "npx");
        setFormArgs((target.args || []).join(" "));
        if (target.env) {
          setFormEnv(
            Object.entries(target.env)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n"),
          );
        } else {
          setFormEnv("");
        }
      }
      setFormError(null);
      setIsAdding(true);
    },
    [config.mcpServers],
  );

  // Save server config from form
  const handleSaveForm = useCallback(async () => {
    if (!isElectron || !window.focusStore?.mcp) return;

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError("Server identifier name is required.");
      return;
    }

    if (!editingServerName && config.mcpServers[trimmedName]) {
      setFormError(`A server named "${trimmedName}" already exists.`);
      return;
    }

    // Parse env lines (KEY=VALUE)
    const envObj: Record<string, string> = {};
    if (formTransport === "stdio" && formEnv.trim()) {
      const lines = formEnv.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          if (k) envObj[k] = v;
        }
      }
    }

    // Parse args
    let parsedArgs: string[] = [];
    if (formTransport === "stdio" && formArgs.trim()) {
      // Split by whitespace respecting quotes if possible or simple split
      parsedArgs = formArgs
        .match(/(?:[^\s"]+|"[^"]*")+/g)
        ?.map((a) => a.replace(/^"|"$/g, "")) || [];
    }

    const serverConf: McpServerConfig = {
      transport: formTransport,
      enabled: editingServerName
        ? config.mcpServers[editingServerName]?.enabled ?? true
        : true,
    };

    if (formTransport === "sse") {
      if (!formUrl.trim()) {
        setFormError("SSE URL is required.");
        return;
      }
      serverConf.url = formUrl.trim();
    } else {
      if (!formCommand.trim()) {
        setFormError("Command is required for stdio transport.");
        return;
      }
      serverConf.command = formCommand.trim();
      serverConf.args = parsedArgs;
      if (Object.keys(envObj).length > 0) {
        serverConf.env = envObj;
      }
    }

    const updatedServers = { ...config.mcpServers };
    // If renamed during edit, remove old key
    if (editingServerName && editingServerName !== trimmedName) {
      delete updatedServers[editingServerName];
    }
    updatedServers[trimmedName] = serverConf;

    const updatedConfig: McpConfigFile = {
      mcpServers: updatedServers,
    };

    setLoading(true);
    const res = await window.focusStore.mcp.saveConfig(updatedConfig);
    if (!res.ok) {
      setFormError(res.error || "Failed to save MCP configuration.");
      setLoading(false);
      return;
    }

    setIsAdding(false);
    setEditingServerName(null);
    await refreshData();
  }, [
    isElectron,
    formName,
    editingServerName,
    config.mcpServers,
    formTransport,
    formEnv,
    formArgs,
    formUrl,
    formCommand,
    refreshData,
  ]);

  if (!isElectron) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <AlertCircle className="size-8 text-amber-500 mb-2" />
        <h4 className="text-sm font-semibold text-foreground">
          Desktop Environment Required
        </h4>
        <p className="mt-1 text-xs max-w-sm">
          MCP client transports and subprocess execution require running Foqz inside
          the Electron desktop application.
        </p>
      </div>
    );
  }

  // Combine config servers and runtime servers
  const allServerNames = Array.from(
    new Set([
      ...Object.keys(config.mcpServers || {}),
      ...servers.map((s) => s.name),
    ]),
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header Info Banner */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Config File</span>
            <span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-600 dark:text-violet-400">
              foqz-mcp.json
            </span>
          </div>
          {configPath ? (
            <p
              className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
              title={configPath}
            >
              {configPath}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
          {configPath ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleCopyPath}
            >
              {copiedPath ? (
                <>
                  <Check className="size-3 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>Copy Path</span>
                </>
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void refreshData()}
            disabled={refreshing}
            title="Refresh servers"
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin text-primary" : ""}`}
            />
          </Button>
          {!isAdding && (
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleOpenAddForm}
            >
              <Plus className="size-3.5" />
              <span>Add Server</span>
            </Button>
          )}
        </div>
      </div>

      {/* Add / Edit Form */}
      {isAdding && (
        <div className="flex flex-col gap-4 rounded-xl border border-violet-500/40 bg-violet-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              {editingServerName ? `Edit Server: ${editingServerName}` : "Add New MCP Server"}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setIsAdding(false);
                setEditingServerName(null);
              }}
            >
              Cancel
            </Button>
          </div>

          {/* Quick Templates (Only when adding new) */}
          {!editingServerName && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Quick-Start Templates:
              </span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="flex flex-col items-start rounded-lg border border-border/80 bg-background/80 p-2 text-left transition hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/30"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      {tpl.label}
                    </span>
                    <span className="line-clamp-1 text-[10px] text-muted-foreground">
                      {tpl.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Server Name <span className="text-destructive">*</span>
              </label>
              <Input
                inputSize="sm"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. filesystem, github, postgres"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Transport Mode
              </label>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setFormTransport("stdio")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium border transition ${
                    formTransport === "stdio"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  <Terminal className="size-3" />
                  <span>stdio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormTransport("sse")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium border transition ${
                    formTransport === "sse"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  <Globe className="size-3" />
                  <span>SSE (HTTP)</span>
                </button>
              </div>
            </div>
          </div>

          {formTransport === "stdio" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1 sm:col-span-1">
                  <label className="text-xs font-medium text-foreground">
                    Command <span className="text-destructive">*</span>
                  </label>
                  <Input
                    inputSize="sm"
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    placeholder="npx, uvx, node, python"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-xs font-medium text-foreground">
                    Arguments (space separated)
                  </label>
                  <Input
                    inputSize="sm"
                    value={formArgs}
                    onChange={(e) => setFormArgs(e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-filesystem /path"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground">
                  Environment Variables (KEY=VALUE, one per line)
                </label>
                <textarea
                  value={formEnv}
                  onChange={(e) => setFormEnv(e.target.value)}
                  placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx"
                  rows={2}
                  className="rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                SSE Endpoint URL <span className="text-destructive">*</span>
              </label>
              <Input
                inputSize="sm"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="http://localhost:3000/sse"
                className="font-mono text-xs"
              />
            </div>
          )}

          {formError ? (
            <p className="text-xs font-medium text-destructive">{formError}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setEditingServerName(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveForm()}
            >
              {editingServerName ? "Save Changes" : "Connect Server"}
            </Button>
          </div>
        </div>
      )}

      {/* Servers List */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Configured Servers ({allServerNames.length})
          </h3>
          <span className="text-[10px] text-muted-foreground">
            Disable servers to reduce prompt context size
          </span>
        </div>

        {allServerNames.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
            <Wrench className="size-8 text-muted-foreground/50 mb-2" />
            <h4 className="text-sm font-semibold text-foreground">
              No MCP Servers Configured
            </h4>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Add Model Context Protocol servers to grant Ollama tools for filesystem
              browsing, GitHub management, or database access.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={handleOpenAddForm}
            >
              <Plus className="size-3.5" />
              <span>Add First Server</span>
            </Button>
          </div>
        ) : (
          allServerNames.map((serverName) => {
            const runtime = servers.find((s) => s.name === serverName);
            const conf = config.mcpServers[serverName];
            const isEnabled = conf?.enabled ?? runtime?.enabled ?? true;
            const transport = conf?.transport || runtime?.transport || "stdio";
            const status = runtime?.status || (isEnabled ? "connecting" : "disabled");
            const toolCount = runtime?.toolCount ?? 0;
            const isExpanded = expandedToolsServer === serverName;
            const tools = serverTools[serverName] || [];

            return (
              <div
                key={serverName}
                className={`flex flex-col rounded-xl border transition-all ${
                  isEnabled
                    ? "border-border/90 bg-card shadow-2xs"
                    : "border-border/50 bg-muted/20 opacity-70"
                }`}
              >
                {/* Server Card Header */}
                <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {serverName}
                      </span>

                      {/* Transport Badge */}
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {transport === "sse" ? (
                          <Globe className="size-2.5" />
                        ) : (
                          <Terminal className="size-2.5" />
                        )}
                        {transport}
                      </span>

                      {/* Status Badge */}
                      {status === "connected" && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          <span>Connected</span>
                          <span className="text-[10px] opacity-75">
                            ({toolCount} tool{toolCount !== 1 ? "s" : ""})
                          </span>
                        </span>
                      )}

                      {status === "connecting" && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <span>Connecting...</span>
                        </span>
                      )}

                      {status === "error" && (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          <span className="size-1.5 rounded-full bg-rose-500" />
                          <span>Error</span>
                        </span>
                      )}

                      {status === "disabled" && (
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                          <span className="size-1.5 rounded-full bg-zinc-400" />
                          <span>Disabled</span>
                        </span>
                      )}
                    </div>

                    {/* Command or URL Info */}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground truncate max-w-[340px]">
                        {transport === "sse"
                          ? conf?.url || "SSE endpoint"
                          : `${conf?.command || "npx"} ${(conf?.args || []).join(" ")}`}
                      </span>
                    </div>

                    {/* Runtime Error Message */}
                    {status === "error" && runtime?.error ? (
                      <p className="mt-1.5 rounded bg-destructive/10 p-1.5 text-[11px] font-medium text-destructive">
                        {runtime.error}
                      </p>
                    ) : null}
                  </div>

                  {/* Actions & Enable Toggle */}
                  <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0 self-end sm:self-center">
                    {/* View Tools button */}
                    {status === "connected" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => void toggleToolsExpanded(serverName)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                        <span>Tools ({toolCount})</span>
                      </Button>
                    )}

                    {/* Restart Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      title="Restart MCP Server"
                      disabled={restartingServer === serverName || !isEnabled}
                      onClick={() => void handleRestartServer(serverName)}
                    >
                      <RefreshCw
                        className={`size-3 text-muted-foreground ${
                          restartingServer === serverName ? "animate-spin text-primary" : ""
                        }`}
                      />
                    </Button>

                    {/* Edit Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      title="Edit server configuration"
                      onClick={() => handleOpenEditForm(serverName)}
                    >
                      <Code className="size-3 text-muted-foreground" />
                    </Button>

                    {/* Delete Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 hover:text-destructive"
                      title="Delete server"
                      onClick={() => void handleDeleteServer(serverName)}
                    >
                      <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                    </Button>

                    {/* Enable / Disable Switch */}
                    <label className="flex items-center gap-1.5 pl-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-border accent-primary cursor-pointer"
                        checked={isEnabled}
                        onChange={() => void handleToggleServer(serverName, isEnabled)}
                        title={isEnabled ? "Disable server" : "Enable server"}
                      />
                    </label>
                  </div>
                </div>

                {/* Expanded Tools View */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-muted/20 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      Exposed Tools ({tools.length})
                    </div>

                    {loadingTools && !tools.length ? (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        Loading tools schema...
                      </div>
                    ) : tools.length === 0 ? (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        No tools reported by this MCP server.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {tools.map((t) => (
                          <div
                            key={t.name}
                            className="flex flex-col gap-1 rounded-lg border border-border/70 bg-background p-2.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {t.name}
                              </span>
                              {t.inputSchema?.required?.length ? (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  required: {t.inputSchema.required.join(", ")}
                                </span>
                              ) : null}
                            </div>
                            {t.description ? (
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {t.description}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Editor, TLShapeId } from "tldraw";
import {
  Plug,
  GitBranch,
  X,
  Check,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  FolderGit2,
  Trash2,
  BookOpen,
  Sparkles,
  RefreshCw,
  Loader2,
  FileText,
} from "lucide-react";
import {
  ALL_PROJECT_ACCENTS,
  ACCENT_STYLES,
  type ProjectAccent,
  type TLProjectFrameShape,
} from "@/shapes/projectFrame/ProjectFrameShapeUtil";

interface ProjectConnectorsModalProps {
  editor: Editor | null;
  shapeId: TLShapeId | null;
  onClose: () => void;
  initialTab?: "connectors" | "context";
}

export function normalizeGithubRepo(input: string): string {
  let trimmed = input.trim();
  if (!trimmed) return "";
  // Remove git@github.com:
  trimmed = trimmed.replace(/^git@github\.com:/, "");
  // Remove https://github.com/ or http://github.com/
  trimmed = trimmed.replace(/^https?:\/\/(www\.)?github\.com\//, "");
  // Remove trailing .git
  trimmed = trimmed.replace(/\.git$/, "");
  // Remove query params or hashes
  trimmed = trimmed.replace(/[?#].*$/, "");
  // Remove subpaths like /issues, /pulls, /tree/main
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return trimmed;
}

/**
 * Clean markdown by stripping raw badge images, HTML comments, raw SVGs, and noise
 * to keep high-density architectural and product information.
 */
export function cleanReadmeMarkdown(raw: string): string {
  let cleaned = raw;
  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  // Remove image badge links: [![...](...)](...)
  cleaned = cleaned.replace(/\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)/g, "");
  // Remove standalone badges / images: ![...](...)
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  // Remove raw inline SVGs
  cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  // Strip trailing whitespace per line
  cleaned = cleaned.replace(/[ \t]+$/gm, "");
  // Collapse 3+ consecutive newlines to 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

/**
 * Decodes base64 text with proper UTF-8 handling in the browser.
 */
function decodeBase64Utf8(base64: string): string {
  const clean = base64.replace(/[\s\r\n]+/g, "");
  const binary = window.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(bytes);
}

/**
 * Extracts pure markdown from a GitHub response, whether it is:
 * - An MCP result payload [{ type: "text", text: "..." }]
 * - A GitHub REST contents API JSON payload { content: "...", encoding: "base64" }
 * - A stringified JSON payload with content and encoding
 * - Raw markdown text
 */
export function extractMarkdownFromGithubResponse(raw: any): string {
  if (!raw) return "";

  let candidate = raw;

  // Handle MCP tool call result object with content array
  if (typeof candidate === "object" && candidate !== null) {
    if (Array.isArray(candidate.content) && candidate.content.length > 0) {
      candidate = candidate.content.map((c: any) => c.text || "").join("\n");
    } else if (candidate.content && typeof candidate.content === "string") {
      // Direct object with content field
      if (candidate.encoding === "base64" || /^[A-Za-z0-9+/=\s\r\n]+$/.test(candidate.content)) {
        try {
          return decodeBase64Utf8(candidate.content);
        } catch {}
      }
      return candidate.content;
    }
  }

  // If it's a string, it might be a stringified JSON of the GitHub API response
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          // Check for GitHub contents object
          if (typeof parsed.content === "string") {
            if (parsed.encoding === "base64" || /^[A-Za-z0-9+/=\s\r\n]+$/.test(parsed.content)) {
              try {
                return decodeBase64Utf8(parsed.content);
              } catch {}
            }
            return parsed.content;
          }
          // If parsed object has a text field
          if (typeof parsed.text === "string") {
            return extractMarkdownFromGithubResponse(parsed.text);
          }
        }
      } catch {
        // Not JSON, treat as raw markdown
      }
    }
    return candidate;
  }

  return String(candidate);
}

/**
 * Fetches repository README via GitHub MCP or raw GitHub endpoints,
 * strictly returning decoded, formatted Markdown (never raw JSON descriptors).
 */
async function fetchRepoReadme(repoInput: string): Promise<string> {
  const normalized = normalizeGithubRepo(repoInput);
  if (!normalized || !normalized.includes("/")) {
    throw new Error("Please specify a valid GitHub repository (e.g. owner/repo) first.");
  }
  const [owner, repo] = normalized.split("/");

  // 1. Try GitHub MCP if available
  if (typeof window !== "undefined" && window.focusStore?.mcp?.callTool) {
    try {
      const res: any = await window.focusStore.mcp.callTool("github", "get_file_contents", {
        owner,
        repo,
        path: "README.md",
      });
      if (res) {
        const extracted = extractMarkdownFromGithubResponse(res);
        if (extracted && extracted.trim().length > 10) {
          return extracted;
        }
      }
    } catch (e) {
      console.warn("[ProjectConnectorsModal] GitHub MCP call failed, falling back to raw fetch:", e);
    }
  }

  // 2. Try raw GitHub UserContent (main, master, HEAD)
  const branches = ["main", "master", "HEAD"];
  for (const branch of branches) {
    try {
      const resp = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`
      );
      if (resp.ok) {
        const text = await resp.text();
        if (text && !text.includes("404: Not Found") && text.trim().length > 10) {
          return extractMarkdownFromGithubResponse(text);
        }
      }
    } catch {}
  }

  // 3. Try GitHub REST API
  try {
    const apiResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { Accept: "application/vnd.github.raw+json" },
    });
    if (apiResp.ok) {
      const text = await apiResp.text();
      if (text && text.trim().length > 10) {
        return extractMarkdownFromGithubResponse(text);
      }
    }
  } catch {}

  throw new Error(`Could not find README.md for ${owner}/${repo}. Check the repository name and network connection.`);
}

export function ProjectConnectorsModal({
  editor,
  shapeId,
  onClose,
  initialTab = "connectors",
}: ProjectConnectorsModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const shape = useMemo(() => {
    if (!editor || !shapeId) return null;
    try {
      const s = editor.getShape(shapeId);
      if (s && s.type === "project-frame") {
        return s as TLProjectFrameShape;
      }
    } catch {
      // Shape may have been deleted
    }
    return null;
  }, [editor, shapeId]);

  const [activeTab, setActiveTab] = useState<"connectors" | "context">(initialTab);
  const [accentDraft, setAccentDraft] = useState<ProjectAccent>("blue");
  const [githubRepoDraft, setGithubRepoDraft] = useState("");
  const [sentryDraft, setSentryDraft] = useState("");
  const [notionDraft, setNotionDraft] = useState("");
  const [selectedMcpServers, setSelectedMcpServers] = useState<string[]>([]);
  const [availableMcpServers, setAvailableMcpServers] = useState<string[]>([]);
  const [hasGithubMcp, setHasGithubMcp] = useState<boolean>(false);

  // Project context state
  const [projectContextDraft, setProjectContextDraft] = useState("");
  const [lastSyncedAtDraft, setLastSyncedAtDraft] = useState<number | undefined>(undefined);
  const [isSyncingReadme, setIsSyncingReadme] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load shape state into drafts
  useEffect(() => {
    if (!shape) return;
    const conn = shape.props.connectors || {};
    setAccentDraft((shape.props.accent as ProjectAccent) || "blue");
    setGithubRepoDraft(conn.githubRepo || "");
    setSentryDraft(conn.sentryProject || "");
    setNotionDraft(conn.notionWorkspace || "");
    setSelectedMcpServers(conn.mcpServers || []);
    const currentContext = shape.props.projectContext || "";
    if (currentContext.trim().startsWith("{") && currentContext.includes('"encoding": "base64"')) {
      const extracted = extractMarkdownFromGithubResponse(currentContext);
      setProjectContextDraft(cleanReadmeMarkdown(extracted));
    } else {
      setProjectContextDraft(currentContext);
    }
    setLastSyncedAtDraft(shape.props.readmeCachedAt);

    // Check available MCP servers
    if (typeof window !== "undefined" && window.focusStore?.mcp?.listServers) {
      window.focusStore.mcp
        .listServers()
        .then((servers) => {
          const names = (servers || []).map((s: any) => s.name || s);
          setAvailableMcpServers(names);
          setHasGithubMcp(names.includes("github"));
        })
        .catch(() => {});
    }

    setTimeout(() => {
      if (activeTab === "connectors") {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }, 50);
  }, [shape, activeTab]);

  // Suggested repos from canvas or default workspace
  const suggestedRepos = useMemo(() => {
    if (!editor) return ["yhauxell/foqz"];
    const set = new Set<string>();
    set.add("yhauxell/foqz");
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === "project-frame") {
        const repo = (s as any).props?.connectors?.githubRepo;
        if (repo && typeof repo === "string" && repo.trim()) {
          set.add(repo.trim());
        }
      }
    }
    return Array.from(set);
  }, [editor]);

  // Close on Escape, Save on Enter (when not inside textarea)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!shape) return null;

  const handleSave = () => {
    if (!editor || !shapeId) return;
    const normalizedRepo = normalizeGithubRepo(githubRepoDraft);
    editor.updateShape({
      id: shapeId,
      type: "project-frame",
      props: {
        ...shape.props,
        accent: accentDraft,
        connectors: {
          githubRepo: normalizedRepo || undefined,
          sentryProject: sentryDraft.trim() || undefined,
          notionWorkspace: notionDraft.trim() || undefined,
          mcpServers: selectedMcpServers.length > 0 ? selectedMcpServers : undefined,
        },
        projectContext: projectContextDraft.trim() || undefined,
        readmeCachedAt: lastSyncedAtDraft || shape.props.readmeCachedAt,
      },
    });
    onClose();
  };

  const handleDisconnectRepo = () => {
    setGithubRepoDraft("");
    if (!editor || !shapeId) return;
    editor.updateShape({
      id: shapeId,
      type: "project-frame",
      props: {
        ...shape.props,
        connectors: {
          ...shape.props.connectors,
          githubRepo: undefined,
        },
      },
    });
  };

  const handleSyncReadme = async () => {
    const repoTarget = githubRepoDraft.trim() || shape.props.connectors?.githubRepo;
    if (!repoTarget) {
      setSyncStatusMsg({
        type: "error",
        text: "Please enter a GitHub repository first (e.g. yhauxell/foqz).",
      });
      return;
    }

    setIsSyncingReadme(true);
    setSyncStatusMsg(null);

    try {
      const raw = await fetchRepoReadme(repoTarget);
      const cleaned = cleanReadmeMarkdown(raw);
      const now = Date.now();
      setLastSyncedAtDraft(now);

      // If user already had custom notes, append or merge
      if (projectContextDraft.trim() && !projectContextDraft.includes(cleaned.slice(0, 100))) {
        setProjectContextDraft(
          `# AI Guidelines & Notes\n\n# Repository Overview\n${cleaned}`
        );
      } else {
        setProjectContextDraft(cleaned);
      }

      setSyncStatusMsg({
        type: "success",
        text: `Successfully synced README (${cleaned.length} characters).`,
      });
    } catch (err: any) {
      setSyncStatusMsg({
        type: "error",
        text: err.message || "Failed to fetch repository README.",
      });
    } finally {
      setIsSyncingReadme(false);
    }
  };

  const projectTitle = shape.props.title || "Untitled Project";
  const tokenEstimate = Math.round(projectContextDraft.length / 4);

  return (
    <div
      className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-100"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-[24px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Plug className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Project Settings & Context
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[320px]">
                {projectTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 px-5 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab("connectors")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === "connectors"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            <Plug className="size-3.5" />
            <span>Connectors & Repos</span>
            {githubRepoDraft && (
              <span className="size-1.5 rounded-full bg-blue-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("context")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === "context"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            <BookOpen className="size-3.5" />
            <span>Context & Guidelines</span>
            {projectContextDraft.trim() && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {activeTab === "connectors" ? (
            <>
              {/* Project Color Theme Section */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span
                      className="size-3.5 rounded-full shrink-0 border border-black/10 dark:border-white/20"
                      style={{ backgroundColor: ACCENT_STYLES[accentDraft]?.dotHex }}
                    />
                    <span>Project Theme</span>
                  </label>
                  <span className="text-[11px] font-mono text-zinc-500 capitalize">
                    {ACCENT_STYLES[accentDraft]?.name || accentDraft}
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {ALL_PROJECT_ACCENTS.map((acc) => {
                    const theme = ACCENT_STYLES[acc];
                    const isSelected = accentDraft === acc;
                    return (
                      <button
                        key={acc}
                        type="button"
                        onClick={() => setAccentDraft(acc)}
                        title={theme.name}
                        className={`h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? "ring-2 ring-blue-500 scale-105 shadow-sm"
                            : "hover:scale-105 opacity-85 hover:opacity-100 border border-black/5 dark:border-white/10"
                        }`}
                        style={{ backgroundColor: theme.dotHex }}
                      >
                        {isSelected && <Check className="size-3.5 text-white drop-shadow" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* GitHub Repository Section */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <GitBranch className="size-3.5 text-blue-600 dark:text-blue-400" />
                    <span>GitHub Repository</span>
                  </label>

                  {hasGithubMcp ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      GitHub MCP Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      GitHub MCP Offline
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="relative flex items-center">
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="owner/repo (or paste https://github.com/owner/repo)"
                      value={githubRepoDraft}
                      onChange={(e) => setGithubRepoDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                      }}
                      className="w-full pl-3 pr-20 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder:font-sans placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs"
                    />
                    {githubRepoDraft.trim() && (
                      <button
                        type="button"
                        onClick={handleDisconnectRepo}
                        title="Clear repository"
                        className="absolute right-2 px-2 py-1 rounded text-[10px] text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>Associates tasks with this repo for tool-calling (issues, commits, PRs).</span>
                    {githubRepoDraft.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("context");
                          handleSyncReadme();
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                      >
                        Sync README →
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Suggestions */}
                {suggestedRepos.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 mr-1">
                      Quick Pick:
                    </span>
                    {suggestedRepos.map((repo) => (
                      <button
                        key={repo}
                        type="button"
                        onClick={() => setGithubRepoDraft(repo)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono border transition-colors cursor-pointer ${
                          normalizeGithubRepo(githubRepoDraft) === repo
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-blue-400"
                        }`}
                      >
                        {repo}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Secondary Connectors: Sentry & Notion */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                    Sentry Project Slug
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. foqz-desktop"
                    value={sentryDraft}
                    onChange={(e) => setSentryDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                    }}
                    className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-blue-500 transition-all shadow-2xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                    Notion Workspace / Doc
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Workspace or Page URL"
                    value={notionDraft}
                    onChange={(e) => setNotionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                    }}
                    className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-blue-500 transition-all shadow-2xs"
                  />
                </div>
              </div>

              {/* Connected MCP Servers */}
              {availableMcpServers.length > 0 && (
                <div>
                  <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    Active MCP Tool Servers
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableMcpServers.map((srv) => {
                      const isSelected = selectedMcpServers.includes(srv);
                      return (
                        <button
                          key={srv}
                          type="button"
                          onClick={() => {
                            setSelectedMcpServers((prev) =>
                              isSelected ? prev.filter((s) => s !== srv) : [...prev, srv],
                            );
                          }}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                          }`}
                        >
                          {isSelected && <Check className="size-3" />}
                          <span>{srv}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Context & Guidelines Tab */
            <div className="space-y-3 animate-in fade-in duration-100">
              {/* Context Actions Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 dark:bg-zinc-950/40 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncReadme}
                    disabled={isSyncingReadme}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSyncingReadme ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    <span>Sync README from GitHub</span>
                  </button>

                  {lastSyncedAtDraft && (
                    <span className="text-[10px] text-zinc-400">
                      Synced {new Date(lastSyncedAtDraft).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    {projectContextDraft.length} chars (~{tokenEstimate} tokens)
                  </span>
                  {projectContextDraft.trim() && (
                    <button
                      type="button"
                      onClick={() => setProjectContextDraft("")}
                      className="text-[10px] text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Status Message */}
              {syncStatusMsg && (
                <div
                  className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 border ${
                    syncStatusMsg.type === "success"
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                      : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60"
                  }`}
                >
                  {syncStatusMsg.type === "success" ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="size-3.5 shrink-0" />
                  )}
                  <span>{syncStatusMsg.text}</span>
                </div>
              )}

              {/* Textarea Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">
                  <span>Project Overview, Architecture & AI Guidelines</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Markdown supported</span>
                </div>

                <textarea
                  value={projectContextDraft}
                  onChange={(e) => setProjectContextDraft(e.target.value)}
                  placeholder={`# Project Architecture & Stack\n- Vite + React 19 + tldraw + Electron\n- Strict TypeScript, Tailwind CSS\n\n# Core Goals\n- Infinite canvas desktop command center\n\n# AI Directives\n- When triaging tasks, prioritize launch blockers and performance\n- Ground code suggestions in existing codebase patterns`}
                  rows={11}
                  className="w-full p-3 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-y leading-relaxed"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 flex items-start gap-2.5 text-[11px] text-blue-800 dark:text-blue-300">
                <Sparkles className="size-3.5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <span>
                  <strong>Pervasive AI Grounding:</strong> This context is automatically injected into
                  Assistant, Element Inline Chat, and Triage whenever you interact with this project or
                  any tasks inside its frame.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40">
          <span className="text-[10px] text-zinc-400">
            Press <kbd className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded">Enter</kbd> to save, <kbd className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded">Esc</kbd> to exit
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
            >
              Save Project Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

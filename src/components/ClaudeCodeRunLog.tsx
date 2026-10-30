import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, RotateCcw, Terminal } from "lucide-react";
import type { ClaudeCodeRunRecord } from "@/lib/claudeCode";
import { PROFILE_LABELS } from "@/lib/claudeCodeTask";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/** The log as plain text, for the clipboard. */
export function runLogText(run: ClaudeCodeRunRecord): string {
  const head = [
    `Claude Code run, ${new Date(run.startedAt).toISOString()}`,
    run.cwd ? `Folder: ${run.cwd}` : "",
    run.profile ? `Access: ${PROFILE_LABELS[run.profile]}` : "",
    `Duration: ${formatDuration(run.durationMs)}${run.costUsd !== undefined ? `, cost $${run.costUsd.toFixed(4)}` : ""}`,
    run.changedFiles.length ? `Changed: ${run.changedFiles.join(", ")}` : "",
  ].filter(Boolean);
  const body = run.entries.map((e) => {
    if (e.kind === "tool_use") return `> ${e.name}\n${e.text}`;
    if (e.kind === "tool_result") return `< ${e.name}${e.isError ? " (error)" : ""}\n${e.text}`;
    if (e.kind === "stderr") return `stderr:\n${e.text}`;
    return e.text;
  });
  return [...head, "", ...body].join("\n");
}

/** Collapsible record of one Claude Code run under its chat answer. */
export function ClaudeCodeRunLog({
  run,
  onRerun,
  onMarkDone,
}: {
  run: ClaudeCodeRunRecord;
  onRerun?: () => void;
  /** Shown for runs started from a to-do that is still open. */
  onMarkDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const tools = run.entries.filter((e) => e.kind === "tool_use").length;
  const summary = [
    formatDuration(run.durationMs),
    run.costUsd !== undefined ? `$${run.costUsd.toFixed(3)}` : "",
    `${tools} tool call${tools === 1 ? "" : "s"}`,
    run.changedFiles.length ? `${run.changedFiles.length} file${run.changedFiles.length === 1 ? "" : "s"} changed` : "",
    run.profile ? PROFILE_LABELS[run.profile] : "",
  ].filter(Boolean);

  return (
    <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] space-y-1.5" data-claude-code-run-log>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1 text-[10px] font-medium cursor-pointer ${
            run.isError ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <Terminal className="size-3" />
          <span>Run log · {summary.join(" · ")}</span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          title="Copy the run log"
          onClick={() => {
            void navigator.clipboard?.writeText(runLogText(run)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
        {onRerun && (
          <button
            type="button"
            title="Run the same request again"
            onClick={onRerun}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <RotateCcw className="size-3" />
            Re-run
          </button>
        )}
        {onMarkDone && (
          <button
            type="button"
            onClick={onMarkDone}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
          >
            <Check className="size-3" />
            Mark task done
          </button>
        )}
      </div>
      {open && (
        <div className="max-h-72 overflow-auto rounded-lg bg-zinc-950 text-zinc-200 p-2 font-mono text-[10px] leading-relaxed space-y-1.5" role="log">
          {run.cwd && <div className="text-zinc-500">$ cd {run.cwd}</div>}
          {run.entries.map((e, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              {e.kind === "tool_use" && (
                <>
                  <span className="text-sky-400">▸ {e.name}</span>
                  <div className="text-zinc-400">{e.text}</div>
                </>
              )}
              {e.kind === "tool_result" && (
                <div className={e.isError ? "text-rose-400" : "text-zinc-400"}>
                  {e.isError ? "✗ " : "✓ "}
                  {e.text || "(no output)"}
                </div>
              )}
              {e.kind === "text" && <div className="text-zinc-100">{e.text}</div>}
              {e.kind === "stderr" && <div className={e.isError ? "text-rose-400" : "text-amber-300"}>{e.text}</div>}
              {e.kind === "notice" && <div className="text-amber-300">{e.text}</div>}
            </div>
          ))}
          {run.changedFiles.length > 0 && (
            <div className="text-emerald-400">Changed: {run.changedFiles.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

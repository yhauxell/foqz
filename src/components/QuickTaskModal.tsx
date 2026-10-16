import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AtSign,
  CheckCircle2,
  Folder,
  Loader2,
  PlaneTakeoff,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import {
  extractExplicitMentions,
  getMentionTrigger,
  insertMentionToken,
  parseQuickTaskCapture,
  type QuickTaskCitationOption,
  type QuickTaskDestinationOption,
} from "@/lib/quickTaskParse";

interface QuickTaskModalProps {
  open: boolean;
  onClose: () => void;
}

function isRunwayNode(node: { type?: string; data?: unknown }) {
  return (
    node.type === "runwayFrame" ||
    String((node.data as { title?: string } | undefined)?.title || "").includes(
      "Runway"
    )
  );
}

type AutocompleteItem =
  | {
      kind: "destination";
      id: string;
      title: string;
      destKind: "project" | "runway";
      token: string;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      token: string;
    };

export function QuickTaskModal({ open, onClose }: QuickTaskModalProps) {
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [destinationId, setDestinationId] = useState<string | undefined>();
  const [citedTaskIds, setCitedTaskIds] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    destinationLabel: string;
    cites: string[];
    usedAi: boolean;
  } | null>(null);

  const destinations = useMemo<QuickTaskDestinationOption[]>(() => {
    const list: QuickTaskDestinationOption[] = [];
    for (const n of nodes) {
      if (n.type === "projectFrame" && !isRunwayNode(n)) {
        list.push({
          id: n.id,
          title: String((n.data as any)?.title || "Untitled Project"),
          kind: "project",
        });
      } else if (isRunwayNode(n)) {
        list.push({
          id: n.id,
          title: String((n.data as any)?.title || "Today's Runway"),
          kind: "runway",
        });
      }
    }
    return list;
  }, [nodes]);

  const tasks = useMemo<QuickTaskCitationOption[]>(() => {
    return nodes
      .filter((n) => n.type === "focusTask")
      .map((n) => ({
        id: n.id,
        title: String((n.data as any)?.title || "Untitled Task"),
      }));
  }, [nodes]);

  const destinationLabel = useMemo(() => {
    if (!destinationId) return null;
    const d = destinations.find((x) => x.id === destinationId);
    return d ? d.title : null;
  }, [destinationId, destinations]);

  const citedLabels = useMemo(() => {
    return citedTaskIds
      .map((id) => tasks.find((t) => t.id === id)?.title)
      .filter(Boolean) as string[];
  }, [citedTaskIds, tasks]);

  const trigger = useMemo(
    () => getMentionTrigger(text, cursor),
    [text, cursor]
  );

  const suggestions = useMemo<AutocompleteItem[]>(() => {
    if (!trigger || menuDismissed) return [];
    const q = trigger.query.toLowerCase();

    if (trigger.type === "/") {
      return destinations
        .filter((d) => !q || d.title.toLowerCase().includes(q))
        .slice(0, 8)
        .map((d) => ({
          kind: "destination" as const,
          id: d.id,
          title: d.title,
          destKind: d.kind,
          token: `/${d.title}`,
        }));
    }

    return tasks
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((t) => ({
        kind: "task" as const,
        id: t.id,
        title: t.title,
        token: `@${t.title}`,
      }));
  }, [trigger, destinations, tasks, menuDismissed]);

  useEffect(() => {
    setSelectedIndex(0);
    setMenuDismissed(false);
  }, [trigger?.type, trigger?.start, trigger?.query]);

  // Keep chips in sync with typed / and @ tokens (not only autocomplete picks)
  useEffect(() => {
    if (!open) return;
    const fromText = extractExplicitMentions(text, destinations, tasks);
    if (fromText.destinationId) {
      setDestinationId(fromText.destinationId);
    }
    if (fromText.citedTaskIds.length > 0) {
      setCitedTaskIds((prev) =>
        Array.from(new Set([...prev, ...fromText.citedTaskIds]))
      );
    }
  }, [text, destinations, tasks, open]);

  useEffect(() => {
    if (!open) return;
    setText("");
    setCursor(0);
    setDestinationId(undefined);
    setCitedTaskIds([]);
    setMenuDismissed(false);
    setErrorMsg(null);
    setPreview(null);
    setIsParsing(false);

    // Prefill destination from selection context
    const state = useFlowCanvasStore.getState();
    const selected = state.selectedNodeId
      ? state.nodes.find((n) => n.id === state.selectedNodeId)
      : null;
    if (selected) {
      if (selected.type === "projectFrame" && !isRunwayNode(selected)) {
        setDestinationId(selected.id);
      } else if (isRunwayNode(selected)) {
        setDestinationId(selected.id);
      } else if (selected.parentId) {
        const parent = state.nodes.find((n) => n.id === selected.parentId);
        if (
          parent &&
          (parent.type === "projectFrame" || isRunwayNode(parent))
        ) {
          setDestinationId(parent.id);
        }
      }
    }

    const t = window.setTimeout(() => textareaRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const applySuggestion = useCallback(
    (item: AutocompleteItem) => {
      if (!trigger) return;
      const next = insertMentionToken(text, cursor, trigger.start, item.token);
      setText(next.text);
      setCursor(next.cursor);
      if (item.kind === "destination") {
        setDestinationId(item.id);
      } else {
        setCitedTaskIds((prev) =>
          prev.includes(item.id) ? prev : [...prev, item.id]
        );
      }
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.cursor, next.cursor);
      });
    },
    [trigger, text, cursor]
  );

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMsg("Write what you need to capture.");
      textareaRef.current?.focus();
      return;
    }

    setIsParsing(true);
    setErrorMsg(null);
    try {
      const parsed = await parseQuickTaskCapture({
        text: trimmed,
        destinations,
        tasks,
        explicitDestinationId: destinationId,
        explicitCitedTaskIds: citedTaskIds,
      });

      setPreview({
        title: parsed.title,
        destinationLabel:
          parsed.parentId
            ? destinations.find((d) => d.id === parsed.parentId)?.title ||
              "Workspace"
            : "Canvas",
        cites: parsed.relatedTaskIds
          .map((id) => tasks.find((t) => t.id === id)?.title || id)
          .filter(Boolean),
        usedAi: parsed.usedAi,
      });

      window.dispatchEvent(
        new CustomEvent("foqz:new-task", {
          detail: {
            title: parsed.title,
            notes: parsed.notes,
            parentId: parsed.parentId,
            relatedTaskIds: parsed.relatedTaskIds,
            priority: 3,
          },
        })
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not parse this capture.");
    } finally {
      setIsParsing(false);
    }
  }, [
    text,
    destinations,
    tasks,
    destinationId,
    citedTaskIds,
    onClose,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (suggestions.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setMenuDismissed(true);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, suggestions.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/55 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-task-title"
        className="relative w-full max-w-xl flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden text-zinc-900 dark:text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="quick-task-title"
                className="text-sm font-semibold tracking-tight"
              >
                Quick Task
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                Write naturally — AI files it.{" "}
                <span className="font-mono">/</span> project ·{" "}
                <span className="font-mono">@</span> task
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[10px] font-mono text-zinc-500">
              ⌘⇧N
            </kbd>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Close quick task"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {errorMsg && (
            <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              {errorMsg}
            </div>
          )}

          <div className="relative">
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 bottom-[calc(100%+6px)] max-h-56 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-xl p-1.5 z-20 animate-in fade-in slide-in-from-bottom-1 duration-100">
                <div className="px-2 py-1 mb-1 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    {trigger?.type === "/"
                      ? "Project or runway"
                      : "Cite a task"}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    ↑↓ · ↵ · esc
                  </span>
                </div>
                {suggestions.map((item, idx) => {
                  const active = idx === selectedIndex;
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => applySuggestion(item)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        active
                          ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {item.kind === "destination" ? (
                        item.destKind === "runway" ? (
                          <PlaneTakeoff className="size-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <Folder className="size-3.5 text-blue-500 shrink-0" />
                        )
                      ) : (
                        <AtSign className="size-3.5 text-violet-500 shrink-0" />
                      )}
                      <span className="font-medium truncate">{item.title}</span>
                      <span className="ml-auto text-[10px] text-zinc-400 shrink-0">
                        {item.kind === "destination"
                          ? item.destKind
                          : "task"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <label htmlFor="quick-task-capture" className="sr-only">
              Capture note
            </label>
            <textarea
              ref={textareaRef}
              id="quick-task-capture"
              value={text}
              rows={5}
              placeholder={
                "Ship onboarding polish tomorrow for /Acme, blocked by @Login rewrite…"
              }
              disabled={isParsing}
              onChange={(e) => {
                setText(e.target.value);
                setCursor(e.target.selectionStart);
                if (errorMsg) setErrorMsg(null);
              }}
              onClick={(e) =>
                setCursor((e.target as HTMLTextAreaElement).selectionStart)
              }
              onKeyUp={(e) =>
                setCursor((e.target as HTMLTextAreaElement).selectionStart)
              }
              onSelect={(e) =>
                setCursor((e.target as HTMLTextAreaElement).selectionStart)
              }
              onKeyDown={(e) => {
                if (suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedIndex((i) => (i + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedIndex(
                      (i) => (i - 1 + suggestions.length) % suggestions.length
                    );
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey)) {
                    e.preventDefault();
                    const target =
                      suggestions[selectedIndex] || suggestions[0];
                    if (target) applySuggestion(target);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMenuDismissed(true);
                    return;
                  }
                }

                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="w-full px-3.5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50 resize-none placeholder:text-zinc-400 disabled:opacity-60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
            {destinationLabel ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/60">
                <Folder className="size-3" />
                <span className="truncate max-w-[160px]">{destinationLabel}</span>
                <button
                  type="button"
                  className="ml-0.5 p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
                  onClick={() => {
                    setDestinationId(undefined);
                    if (destinationLabel) {
                      setText((prev) =>
                        prev
                          .replace(
                            new RegExp(
                              `/${destinationLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
                              "i"
                            ),
                            ""
                          )
                          .replace(/\s{2,}/g, " ")
                      );
                    }
                  }}
                  aria-label="Clear destination"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-700">
                <span className="font-mono">/</span> to file under a project or
                runway
              </span>
            )}
            {citedLabels.map((label, idx) => (
              <span
                key={`${citedTaskIds[idx]}-${label}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200/70 dark:border-violet-800/60"
              >
                <AtSign className="size-3" />
                <span className="truncate max-w-[140px]">{label}</span>
                <button
                  type="button"
                  className="ml-0.5 p-0.5 rounded hover:bg-violet-100 dark:hover:bg-violet-900 cursor-pointer"
                  onClick={() => {
                    const id = citedTaskIds[idx];
                    setCitedTaskIds((prev) => prev.filter((x) => x !== id));
                    setText((prev) =>
                      prev
                        .replace(
                          new RegExp(
                            `@${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
                            "i"
                          ),
                          ""
                        )
                        .replace(/\s{2,}/g, " ")
                    );
                  }}
                  aria-label={`Remove citation ${label}`}
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
            {citedLabels.length === 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-700">
                <span className="font-mono">@</span> to cite related tasks
              </span>
            )}
          </div>

          {preview && (
            <div className="text-[11px] text-zinc-500 px-1">
              Parsed as <strong>{preview.title}</strong> → {preview.destinationLabel}
              {preview.usedAi ? " · AI" : " · local"}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-[11px] text-zinc-400 hidden sm:flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              <span>
                <kbd className="font-mono">⌘↵</kbd> capture
              </span>
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isParsing}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={isParsing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                {isParsing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                {isParsing ? "Parsing…" : "Capture"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

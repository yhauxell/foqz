import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Folder,
  LayoutGrid,
  PlaneTakeoff,
  Plus,
  X,
} from "lucide-react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";

export type QuickTaskDestination =
  | { kind: "canvas" }
  | { kind: "project" | "runway"; id: string; title: string };

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

function resolveDefaultDestination(
  nodes: ReturnType<typeof useFlowCanvasStore.getState>["nodes"],
  selectedNodeId: string | null
): QuickTaskDestination {
  const selected = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  if (selected) {
    if (selected.type === "projectFrame" && !isRunwayNode(selected)) {
      return {
        kind: "project",
        id: selected.id,
        title: String((selected.data as any)?.title || "Project"),
      };
    }
    if (isRunwayNode(selected)) {
      return {
        kind: "runway",
        id: selected.id,
        title: String((selected.data as any)?.title || "Runway"),
      };
    }
    if (selected.parentId) {
      const parent = nodes.find((n) => n.id === selected.parentId);
      if (parent?.type === "projectFrame" && !isRunwayNode(parent)) {
        return {
          kind: "project",
          id: parent.id,
          title: String((parent.data as any)?.title || "Project"),
        };
      }
      if (parent && isRunwayNode(parent)) {
        return {
          kind: "runway",
          id: parent.id,
          title: String((parent.data as any)?.title || "Runway"),
        };
      }
    }
  }

  return { kind: "canvas" };
}

export function QuickTaskModal({ open, onClose }: QuickTaskModalProps) {
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(3);
  const [destination, setDestination] = useState<QuickTaskDestination>({
    kind: "canvas",
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const destinations = useMemo(() => {
    const projects: QuickTaskDestination[] = [];
    const runways: QuickTaskDestination[] = [];

    for (const n of nodes) {
      if (n.type === "projectFrame" && !isRunwayNode(n)) {
        projects.push({
          kind: "project",
          id: n.id,
          title: String((n.data as any)?.title || "Untitled Project"),
        });
      } else if (isRunwayNode(n)) {
        runways.push({
          kind: "runway",
          id: n.id,
          title: String((n.data as any)?.title || "Today's Runway"),
        });
      }
    }

    return { projects, runways };
  }, [nodes]);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority(3);
    setErrorMsg(null);
    setDestination(
      resolveDefaultDestination(
        useFlowCanvasStore.getState().nodes,
        useFlowCanvasStore.getState().selectedNodeId
      )
    );
    const t = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const submit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setErrorMsg("Add a title to capture this task.");
      titleRef.current?.focus();
      return;
    }

    const parentId =
      destination.kind === "canvas" ? undefined : destination.id;

    window.dispatchEvent(
      new CustomEvent("foqz:new-task", {
        detail: {
          title: trimmed,
          notes: description.trim(),
          priority,
          parentId,
        },
      })
    );
    onClose();
  }, [title, description, priority, destination, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, submit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  if (!open) return null;

  const destinationValue =
    destination.kind === "canvas"
      ? "canvas"
      : `${destination.kind}:${destination.id}`;

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
        className="relative w-full max-w-lg flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden text-zinc-900 dark:text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              <Plus className="size-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="quick-task-title"
                className="text-sm font-semibold tracking-tight"
              >
                Quick Task
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                Capture an idea with title, notes, and destination
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="quick-task-name"
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Title
            </label>
            <input
              ref={titleRef}
              id="quick-task-name"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="What needs to happen?"
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-task-description"
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Description
            </label>
            <textarea
              id="quick-task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Context, acceptance notes, or a quick checklist…"
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-task-destination"
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Add to project or runway
            </label>
            <div className="relative">
              <select
                id="quick-task-destination"
                value={destinationValue}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "canvas") {
                    setDestination({ kind: "canvas" });
                    return;
                  }
                  const [kind, id] = value.split(":") as [
                    "project" | "runway",
                    string,
                  ];
                  const list =
                    kind === "runway"
                      ? destinations.runways
                      : destinations.projects;
                  const match = list.find(
                    (d) => d.kind !== "canvas" && d.id === id
                  );
                  if (match && match.kind !== "canvas") {
                    setDestination(match);
                  }
                }}
                className="w-full appearance-none px-3 py-2.5 pr-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50 cursor-pointer"
              >
                <option value="canvas">Canvas (unassigned)</option>
                {destinations.runways.length > 0 && (
                  <optgroup label="Runways">
                    {destinations.runways.map((r) =>
                      r.kind === "runway" ? (
                        <option key={r.id} value={`runway:${r.id}`}>
                          {r.title}
                        </option>
                      ) : null
                    )}
                  </optgroup>
                )}
                {destinations.projects.length > 0 && (
                  <optgroup label="Projects">
                    {destinations.projects.map((p) =>
                      p.kind === "project" ? (
                        <option key={p.id} value={`project:${p.id}`}>
                          {p.title}
                        </option>
                      ) : null
                    )}
                  </optgroup>
                )}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                {destination.kind === "runway" ? (
                  <PlaneTakeoff className="size-3.5" />
                ) : destination.kind === "project" ? (
                  <Folder className="size-3.5" />
                ) : (
                  <LayoutGrid className="size-3.5" />
                )}
              </span>
            </div>
            {destinations.projects.length === 0 &&
              destinations.runways.length === 0 && (
                <p className="text-[11px] text-zinc-400">
                  No project or runway on the board yet — task lands on the
                  canvas.
                </p>
              )}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Priority
            </span>
            <div className="flex gap-1.5">
              {(
                [
                  { value: 1 as const, label: "P1", hint: "Urgent" },
                  { value: 2 as const, label: "P2", hint: "High" },
                  { value: 3 as const, label: "P3", hint: "Normal" },
                  { value: 4 as const, label: "P4", hint: "Low" },
                ] as const
              ).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.hint}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    priority === p.value
                      ? p.value === 1
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400"
                        : p.value === 2
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400"
                          : p.value === 3
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                            : "bg-zinc-500/15 border-zinc-500/40 text-zinc-600 dark:text-zinc-300"
                      : "bg-transparent border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-[11px] text-zinc-400 hidden sm:flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              <span>
                <kbd className="font-mono">⌘↵</kbd> to create
              </span>
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="size-3.5" />
                Create Task
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

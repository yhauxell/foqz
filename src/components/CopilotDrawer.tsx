import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Sparkles,
  PanelRightClose,
  X,
  Send,
  Square,
  Copy,
  Check,
  Target,
  Layers,
  ArrowRight,
  FileText,
  StickyNote,
  Type,
  Box,
  MousePointerClick,
  Timer,
  Wrench,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Settings as SettingsIcon,
} from "lucide-react";
import { type Editor, type TLShapeId, useValue } from "tldraw";
import { useOllama } from "@/lib/ollama";
import { runAgentLoop, type AgentToolCallEvent } from "@/lib/mcpAgentLoop";
import { NATIVE_FOQZ_TOOLS, createCanvasToolExecutor } from "@/lib/canvasTools";
import type { McpTool } from "@/lib/mcpTypes";
import {
  FOQZ_SYSTEM_PROMPT,
  parseCanvasActions,
  parseOutputSegments,
  spawnShapesOnCanvas,
  spawnSingleShapeOnCanvas,
  spawnWorkflowForProject,
  type SpawnableShape,
} from "@/lib/canvasSpawner";
import { CanvasActionList } from "@/components/CanvasActionList";
import { renderMarkdownBlock } from "@/lib/markdown";
import {
  extractShapeContext,
  getCanvasContext,
  type ShapeContextItem,
} from "@/lib/canvasContext";
import type { TLProjectFrameShape } from "@/shapes/projectFrame/ProjectFrameShapeUtil";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";

interface CopilotDrawerProps {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
  selectedShapeId: TLShapeId | null;
  onOpenSettings?: (tab?: "general" | "workingHours" | "mcp" | "data") => void;
}

export function CopilotDrawer({
  editor,
  open,
  onClose,
  selectedShapeId,
  onOpenSettings,
}: CopilotDrawerProps) {
  const { online, models, selectedModel, setSelectedModel } = useOllama();
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [spawnedCount, setSpawnedCount] = useState<number | null>(null);
  const [storeTick, setStoreTick] = useState(0);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [executedTools, setExecutedTools] = useState<AgentToolCallEvent[]>([]);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);

  // HUD and accordion states
  const [showToolsHud, setShowToolsHud] = useState(false);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const [copiedToolKey, setCopiedToolKey] = useState<string | null>(null);

  const toggleToolExpanded = useCallback((id: string) => {
    setExpandedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const copyPayload = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToolKey(key);
    setTimeout(() => setCopiedToolKey(null), 2000);
  }, []);

  // Load external MCP tools from Electron main process
  useEffect(() => {
    if (typeof window !== "undefined" && window.focusStore?.mcp?.listTools) {
      window.focusStore.mcp
        .listTools()
        .then((tools) => setMcpTools(tools || []))
        .catch(() => {});
    }
  }, [open]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when output updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  // Synchronize store mutations & selection changes immediately
  useEffect(() => {
    if (!editor) return;

    const unlistenStore = editor.store.listen(() => {
      setStoreTick((t) => t + 1);
    });

    const offChange = editor.on("change", () => {
      setStoreTick((t) => t + 1);
    });

    return () => {
      unlistenStore();
      offChange();
    };
  }, [editor]);

  // Ensure external selectedShapeId is selected in the editor
  useEffect(() => {
    if (editor && selectedShapeId) {
      if (!editor.getSelectedShapeIds().includes(selectedShapeId)) {
        editor.select(selectedShapeId);
      }
    }
  }, [editor, selectedShapeId]);

  // Reactively track selected shapes and all shapes on the current page
  const selectedShapes = useValue(
    "selectedShapes",
    () => (editor ? editor.getSelectedShapes() : []),
    [editor],
  );

  const allPageShapes = useValue(
    "allPageShapes",
    () => (editor ? editor.getCurrentPageShapes() : []),
    [editor],
  );

  // Extract human-readable text and context from all canvas shapes
  const canvasCtx = useMemo(
    () => getCanvasContext(editor),
    [editor, selectedShapes, allPageShapes, selectedShapeId, storeTick],
  );

  const { selectedItems, selectedSummary, boardItems, boardSummary, primaryShape } =
    canvasCtx;

  // Detect spawnable actions in current output
  const spawnableActions = useMemo(
    () => parseCanvasActions(output),
    [output],
  );

  // Parse structured segments (markdown text, canvas items, streaming canvas)
  const outputSegments = useMemo(
    () => parseOutputSegments(output),
    [output],
  );

  // Cycle available models
  const cycleModel = useCallback(() => {
    if (!models.length) return;
    const idx = models.indexOf(selectedModel);
    const next = models[(idx + 1) % models.length];
    setSelectedModel(next);
  }, [models, selectedModel, setSelectedModel]);

  // Stop streaming
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setActiveTool(null);
  }, []);

  // Send prompt to Ollama with full canvas context & MCP tool calling
  const handleSend = useCallback(
    async (customPrompt?: string) => {
      const userText = (customPrompt ?? prompt).trim();
      if (!userText && selectedItems.length === 0 && boardItems.length === 0)
        return;
      if (!online) return;

      handleStop();
      setIsStreaming(true);
      setOutput("");
      setSpawnedCount(null);
      setExecutedTools([]);
      setActiveTool(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Build rich context from canvas
      let contextMsg = "";
      if (selectedItems.length > 0) {
        contextMsg = `[Selected Shapes on Canvas (${selectedItems.length} item${selectedItems.length > 1 ? "s" : ""})]:\n${selectedSummary}`;
      } else if (boardItems.length > 0) {
        contextMsg = `[Active Canvas Board Context (${boardItems.length} item${boardItems.length > 1 ? "s" : ""})]:\n${boardSummary}`;
      }

      const promptToRun =
        userText ||
        (selectedItems.length > 0
          ? "Analyze the selected canvas items and break them down into actionable subtasks."
          : "Review all items on the canvas and suggest next steps.");

      const localToolExecutor = createCanvasToolExecutor(editor, () => primaryShape);
      const allTools = [...NATIVE_FOQZ_TOOLS, ...mcpTools];

      try {
        await runAgentLoop({
          model: selectedModel || "qwen2.5-coder:7b",
          userPrompt: promptToRun,
          systemPrompt: FOQZ_SYSTEM_PROMPT,
          canvasContext: contextMsg,
          tools: allTools,
          onChunk: (delta) => {
            setOutput((prev) => prev + delta);
          },
          onToolCallStart: (evt) => {
            setActiveTool(`${evt.serverName || "foqz"}:${evt.toolName}`);
          },
          onToolCallEnd: (evt) => {
            setActiveTool(null);
            setExecutedTools((prev) => [...prev, evt]);
          },
          localToolExecutor,
          signal: controller.signal,
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setOutput(
            (prev) =>
              prev +
              `\n\n[Error: ${err.message || "Failed to communicate with Ollama"}]`,
          );
        }
      } finally {
        setIsStreaming(false);
        setActiveTool(null);
        abortControllerRef.current = null;
      }
    },
    [
      prompt,
      selectedItems,
      selectedSummary,
      boardItems,
      boardSummary,
      online,
      handleStop,
      selectedModel,
      editor,
      primaryShape,
      mcpTools,
    ],
  );

  // Spawn items on canvas
  const handleSpawn = useCallback(() => {
    if (!editor || !spawnableActions.length) return;

    if (primaryShape && primaryShape.type === "project-frame") {
      const count = spawnWorkflowForProject(
        editor,
        primaryShape as TLProjectFrameShape,
        spawnableActions,
      );
      setSpawnedCount(count);
    } else {
      const count = spawnShapesOnCanvas(editor, primaryShape, spawnableActions);
      setSpawnedCount(count);
    }

    setTimeout(() => setSpawnedCount(null), 3000);
  }, [editor, spawnableActions, primaryShape]);

  // Spawn single item on canvas
  const handleSpawnSingle = useCallback(
    (action: SpawnableShape, index: number) => {
      if (!editor) return;
      spawnSingleShapeOnCanvas(editor, action, primaryShape, index);
    },
    [editor, primaryShape],
  );

  // Copy output to clipboard
  const handleCopy = useCallback(() => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  if (!open) return null;

  const singleShape = selectedItems.length === 1 ? selectedItems[0] : null;

  return (
    <aside
      className="w-96 bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800/80 flex flex-col text-zinc-900 dark:text-zinc-100 font-sans select-none shrink-0 z-40 animate-in slide-in-from-right duration-200"
      style={{
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div className="h-12 px-3 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Copilot
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Active Tools HUD Pill */}
          <button
            type="button"
            title={`${NATIVE_FOQZ_TOOLS.length + mcpTools.length} tools available (click to inspect HUD)`}
            onClick={() => {
              setShowToolsHud((prev) => !prev);
              if (window.focusStore?.mcp?.listTools) {
                window.focusStore.mcp
                  .listTools()
                  .then((tools) => setMcpTools(tools || []))
                  .catch(() => {});
              }
            }}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
              showToolsHud
                ? "bg-violet-100 dark:bg-violet-950/70 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300"
                : "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white"
            }`}
          >
            <Wrench className="size-3 text-violet-500" />
            <span>{NATIVE_FOQZ_TOOLS.length + mcpTools.length}</span>
          </button>

          {/* Model Pill */}
          <button
            type="button"
            title={
              online
                ? `Ollama Model: ${selectedModel || "Auto"} (click to cycle)`
                : "Ollama is offline (start localhost:11434)"
            }
            onClick={cycleModel}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
              online
                ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                : "bg-zinc-100/60 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                online ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
              }`}
            />
            <span className="truncate max-w-[100px]">
              {selectedModel || "ollama"}
            </span>
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            title="Collapse Copilot (⌘J)"
            className="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <PanelRightClose className="size-4" />
          </button>
        </div>
      </div>

      {/* Live Tools HUD Panel */}
      {showToolsHud && (
        <div className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-950/80 p-3 space-y-3 font-sans shrink-0 max-h-72 overflow-y-auto animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wrench className="size-3.5 text-violet-500" />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Active Tools HUD ({NATIVE_FOQZ_TOOLS.length + mcpTools.length})
              </span>
            </div>
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings("mcp")}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                <SettingsIcon className="size-3" />
                <span>Configure MCP</span>
              </button>
            )}
          </div>

          {/* Canvas Native Tools */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold">
              Canvas Native Tools ({NATIVE_FOQZ_TOOLS.length})
            </div>
            <div className="grid grid-cols-1 gap-1">
              {NATIVE_FOQZ_TOOLS.map((tool) => (
                <div
                  key={tool.name}
                  className="px-2 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-[11px] shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-violet-600 dark:text-violet-400">
                      foqz:{tool.name}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">built-in</span>
                  </div>
                  {tool.description && (
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                      {tool.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* External MCP Tools */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold">
              External MCP Tools ({mcpTools.length})
            </div>
            {mcpTools.length === 0 ? (
              <div className="px-2.5 py-2.5 rounded bg-white/60 dark:bg-zinc-900/60 border border-dashed border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-400 text-center">
                No external MCP tools connected. Click &quot;Configure MCP&quot; to connect servers.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1">
                {mcpTools.map((tool) => (
                  <div
                    key={`${tool.serverName}_${tool.name}`}
                    className="px-2 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-[11px] shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {tool.serverName}:{tool.name}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">mcp</span>
                    </div>
                    {tool.description && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                        {tool.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Card: Displays any selected shape(s) or board context */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 shrink-0">
        {singleShape ? (
          /* Single shape selected */
          <div className="space-y-2.5">
            {/* Header with Type, Icon, and Deselect Button */}
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5 font-mono uppercase tracking-wider text-[10px] text-zinc-500 dark:text-zinc-400">
                {singleShape.rawType === "focus-task" ? (
                  <FileText className="size-3.5 text-blue-500" />
                ) : singleShape.rawType === "project-frame" ? (
                  <Layers className="size-3.5 text-indigo-500" />
                ) : singleShape.rawType === "note" ? (
                  <StickyNote className="size-3.5 text-amber-500" />
                ) : singleShape.rawType === "text" ? (
                  <Type className="size-3.5 text-emerald-500" />
                ) : singleShape.rawType === "focus-timer" ? (
                  <Timer className="size-3.5 text-orange-500" />
                ) : singleShape.rawType === "arrow" ? (
                  <ArrowRight className="size-3.5 text-violet-500" />
                ) : (
                  <Box className="size-3.5 text-zinc-400" />
                )}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Selected: {singleShape.type}
                </span>
              </span>

              <div className="flex items-center gap-1.5">
                {singleShape.rawType === "focus-task" && (
                  <span className="capitalize px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] border border-zinc-200 dark:border-zinc-700 font-mono">
                    {(singleShape.shape as TLFocusTaskShape).props.status}
                  </span>
                )}
                {singleShape.color && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] capitalize border border-zinc-200 dark:border-zinc-700">
                    <span
                      className="size-2 rounded-full border border-black/10 dark:border-white/10"
                      style={{
                        backgroundColor:
                          singleShape.color === "yellow"
                            ? "#facc15"
                            : singleShape.color === "blue"
                            ? "#3b82f6"
                            : singleShape.color === "green"
                            ? "#10b981"
                            : singleShape.color === "red"
                            ? "#ef4444"
                            : singleShape.color === "violet"
                            ? "#8b5cf6"
                            : singleShape.color === "orange"
                            ? "#f97316"
                            : singleShape.color === "grey"
                            ? "#a1a1aa"
                            : singleShape.color === "black"
                            ? "#18181b"
                            : "#a1a1aa",
                      }}
                    />
                    {singleShape.color}
                  </span>
                )}
                {singleShape.dimensions && (
                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] font-mono">
                    {singleShape.dimensions.w}×{singleShape.dimensions.h}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => editor?.selectNone()}
                  title="Deselect shape (Escape)"
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>

            {/* Selected Item Content Preview Card */}
            <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-xs shadow-xs">
              {singleShape.hasText ? (
                <div className="space-y-1">
                  <p className="text-zinc-900 dark:text-zinc-100 font-medium leading-relaxed select-text line-clamp-4 whitespace-pre-wrap">
                    {singleShape.label}
                  </p>
                  {singleShape.rawType === "focus-task" && (singleShape.shape as TLFocusTaskShape).props.notes && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic line-clamp-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                      {(singleShape.shape as TLFocusTaskShape).props.notes}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-zinc-400 dark:text-zinc-500 italic text-[11px]">
                  Empty {singleShape.type.toLowerCase()} — write text on canvas or use quick actions below.
                </p>
              )}
            </div>

            {/* Quick Action Chips tailored to the shape type */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {singleShape.rawType === "focus-task" ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Break down the task "${singleShape.label}" into 3-4 actionable sequential subtasks. Output them in a \`\`\`canvas block so they can be placed on the board.`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Break into subtasks
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Write the technical specs and implementation steps for: "${singleShape.label}".`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Generate specs
                  </button>
                </>
              ) : singleShape.rawType === "project-frame" ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Break down the goal "${(singleShape.shape as TLProjectFrameShape).props.goal || singleShape.label}" into a 4-5 step sequential task workflow. Output them in a \`\`\`canvas block.`,
                      )
                    }
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-medium text-xs shadow transition-colors"
                  >
                    <Sparkles className="size-3.5 text-violet-400 dark:text-violet-600" />
                    <span>Generate Workflow on Canvas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `List the key milestones and deliverables for project: "${singleShape.label}".`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    List milestones
                  </button>
                </>
              ) : singleShape.rawType === "focus-timer" ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Plan a focused, distraction-free roadmap for a ${(singleShape.shape.props as any).durationPreset || 25}-minute focus session.`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Plan focus session
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Suggest 3 quick micro-tasks that can be accomplished in ${(singleShape.shape.props as any).durationPreset || 25} minutes. Output them in a \`\`\`canvas block.`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Quick tasks
                  </button>
                </>
              ) : singleShape.hasText ? (
                /* Text, notes, geo shapes WITH text */
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Turn this ${singleShape.type}: "${singleShape.label}" into 2-3 structured task cards. Output them in a \`\`\`canvas block.`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Convert into Tasks
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Expand on this idea and give constructive feedback or execution advice: "${singleShape.label}".`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Expand idea
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Summarize the key takeaways and next steps for: "${singleShape.label}".`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Summarize
                  </button>
                </>
              ) : (
                /* Empty geometric shapes / containers */
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Generate 3-4 structured task cards to organize inside this ${singleShape.type}. Output them in a \`\`\`canvas block.`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Generate tasks inside
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        `Brainstorm a plan and purpose for this ${singleShape.type} section on my board. Output structured items in a \`\`\`canvas block.`,
                      )
                    }
                    className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                  >
                    Brainstorm section plan
                  </button>
                </>
              )}
            </div>
          </div>
        ) : selectedItems.length > 1 ? (
          /* Multiple shapes selected */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-mono uppercase tracking-wider text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold">
                Selected Shapes ({selectedItems.length})
              </span>
              <button
                type="button"
                onClick={() => editor?.selectNone()}
                title="Deselect all (Escape)"
                className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="size-3" />
                <span>Clear selection</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 rounded bg-zinc-100/70 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60">
              {selectedItems.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] text-zinc-700 dark:text-zinc-300 truncate max-w-[160px]"
                >
                  <span className="size-1.5 rounded-full bg-violet-500" />
                  {item.label}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() =>
                  handleSend(
                    `Synthesize and organize these selected canvas items into a clear sequential workflow:\n${selectedSummary}\nOutput new or connected tasks in a \`\`\`canvas block.`,
                  )
                }
                className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
              >
                Synthesize into workflow
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSend(
                    `Summarize the relationship and priority between these selected items:\n${selectedSummary}`,
                  )
                }
                className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
              >
                Summarize selection
              </button>
            </div>
          </div>
        ) : (
          /* No shape selected — shows Board context */
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-mono uppercase tracking-wider text-[10px] text-zinc-400 dark:text-zinc-500">
                Active Board Context ({boardItems.length} items)
              </span>
              <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                <MousePointerClick className="size-3" />
                Select any shape to focus
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-normal">
              {boardItems.length > 0
                ? `Copilot has read ${boardItems.length} items on this board (tasks, notes, text). Click any shape on the canvas to focus on it.`
                : "No shapes with text found on this board. Create a task, note, or prompt Copilot to generate a plan."}
            </p>

            {boardItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    handleSend(
                      `Review all items currently on my canvas board and give me a clear daily execution plan:\n${boardSummary}`,
                    )
                  }
                  className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                >
                  Plan daily execution
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSend(
                      `Analyze what is on my canvas board and point out what is missing or should be tackled next:\n${boardSummary}`,
                    )
                  }
                  className="text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
                >
                  Analyze board gaps
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stream / Output Content Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-300 select-text"
      >
        {/* Active Tool Execution Indicator */}
        {activeTool && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/60 text-xs text-violet-700 dark:text-violet-300 animate-pulse font-mono shadow-xs">
            <Wrench className="size-3.5 animate-spin text-violet-500" />
            <span className="font-semibold">Calling {activeTool}...</span>
          </div>
        )}

        {/* Executed Tools Collapsible Accordion */}
        {executedTools.length > 0 && (
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1.5 font-sans">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold px-0.5">
              <span>Executed Tools ({executedTools.length})</span>
              <span>
                {executedTools.reduce((acc, t) => acc + (t.durationMs || 0), 0)}ms total
              </span>
            </div>
            <div className="space-y-1.5">
              {executedTools.map((t) => {
                const isExpanded = expandedToolIds.has(t.id);
                const argsStr = JSON.stringify(t.args || {}, null, 2);
                let resultText = "";
                if (t.result?.content) {
                  resultText = t.result.content
                    .map((c) =>
                      typeof c === "string" ? c : c.text || JSON.stringify(c, null, 2),
                    )
                    .join("\n");
                } else if (t.result) {
                  resultText = JSON.stringify(t.result, null, 2);
                }

                return (
                  <div
                    key={t.id}
                    className="overflow-hidden rounded-md border border-zinc-200/80 dark:border-zinc-700/70 bg-white dark:bg-zinc-800/80 text-[11px] shadow-2xs"
                  >
                    {/* Header Row (Clickable Accordion Trigger) */}
                    <button
                      type="button"
                      onClick={() => toggleToolExpanded(t.id)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/40 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {isExpanded ? (
                          <ChevronDown className="size-3 text-zinc-400 shrink-0" />
                        ) : (
                          <ChevronRight className="size-3 text-zinc-400 shrink-0" />
                        )}
                        {t.isError ? (
                          <AlertTriangle className="size-3 text-rose-500 shrink-0" />
                        ) : (
                          <Wrench className="size-3 text-violet-500 shrink-0" />
                        )}
                        <span className="font-semibold font-mono text-zinc-900 dark:text-zinc-100 truncate">
                          {t.serverName || "foqz"}:{t.toolName}
                        </span>
                      </span>

                      <span className="flex items-center gap-1.5 shrink-0 pl-2">
                        {t.isError ? (
                          <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-1 rounded">
                            failed
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1 rounded">
                            success
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {t.durationMs ? `${t.durationMs}ms` : "done"}
                        </span>
                      </span>
                    </button>

                    {/* Collapsible Content */}
                    {isExpanded && (
                      <div className="border-t border-zinc-200/60 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-900/50 p-2 space-y-2 text-[10px] font-mono">
                        {/* Input Arguments */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-zinc-500">
                            <span className="font-semibold uppercase tracking-wider">
                              Input Arguments
                            </span>
                            <button
                              type="button"
                              onClick={() => copyPayload(`in_${t.id}`, argsStr)}
                              className="inline-flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200"
                            >
                              {copiedToolKey === `in_${t.id}` ? (
                                <>
                                  <Check className="size-2.5 text-emerald-500" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="size-2.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 overflow-x-auto max-h-36 text-zinc-800 dark:text-zinc-200 leading-tight">
                            {argsStr}
                          </pre>
                        </div>

                        {/* Output Result */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-zinc-500">
                            <span className="font-semibold uppercase tracking-wider">
                              Output Result
                            </span>
                            {resultText && (
                              <button
                                type="button"
                                onClick={() => copyPayload(`out_${t.id}`, resultText)}
                                className="inline-flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200"
                              >
                                {copiedToolKey === `out_${t.id}` ? (
                                  <>
                                    <Check className="size-2.5 text-emerald-500" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-2.5" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                          <pre
                            className={`p-1.5 rounded border overflow-x-auto max-h-36 leading-tight whitespace-pre-wrap ${
                              t.isError
                                ? "bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                                : "bg-zinc-100 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
                            }`}
                          >
                            {resultText || "(No output returned)"}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {output ? (
          <div className="space-y-3 font-sans">
            {outputSegments.map((seg, sIdx) => {
              if (seg.type === "text") {
                return (
                  <div
                    key={sIdx}
                    className="prose prose-xs dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 leading-relaxed break-words [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_code]:text-[11px] [&_code]:font-mono [&_code]:bg-zinc-100 dark:[&_code]:bg-zinc-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownBlock(seg.content),
                    }}
                  />
                );
              }

              if (seg.type === "canvas") {
                return (
                  <CanvasActionList
                    key={sIdx}
                    actions={seg.actions}
                    onSpawnAll={handleSpawn}
                    onSpawnSingle={handleSpawnSingle}
                    spawnedCount={spawnedCount}
                  />
                );
              }

              if (seg.type === "streaming-canvas") {
                return (
                  <div
                    key={sIdx}
                    className="p-3 rounded-xl border border-dashed border-violet-300 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-950/20 text-xs text-violet-700 dark:text-violet-300 flex items-center gap-2 animate-pulse"
                  >
                    <Sparkles className="size-3.5" />
                    <span>Structuring canvas cards & tasks...</span>
                  </div>
                );
              }

              return null;
            })}
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 py-4 font-sans text-xs">
            <span className="size-2 rounded-full bg-violet-500 animate-pulse" />
            <span>Generating with {selectedModel}...</span>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 dark:text-zinc-600 font-sans space-y-2 py-12">
            <Sparkles className="size-8 stroke-1 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xs max-w-[240px]">
              Ask Copilot to plan tasks, convert notes, or break down goals into connected canvas workflows.
            </p>
          </div>
        )}
      </div>

      {/* Output Toolbar (Copy / Clear) */}
      {output ? (
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-zinc-900/40 flex items-center justify-between text-xs shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            {copied ? (
              <Check className="size-3 text-emerald-500" />
            ) : (
              <Copy className="size-3" />
            )}
            <span>{copied ? "Copied" : "Copy output"}</span>
          </button>
          <button
            type="button"
            onClick={() => setOutput("")}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Bottom Prompt Input */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0">
        <div className="relative flex flex-col gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              singleShape
                ? `Ask about "${singleShape.label.slice(0, 24)}${singleShape.label.length > 24 ? "..." : ""}" (⌘Enter)`
                : selectedItems.length > 1
                ? `Ask about ${selectedItems.length} selected shapes... (⌘Enter)`
                : "Ask Copilot... (⌘Enter to send)"
            }
            rows={2}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none resize-none transition-colors shadow-xs"
          />

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              ⌘Enter sends
            </span>
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition-colors"
              >
                <Square className="size-3" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!online || (!prompt.trim() && selectedItems.length === 0 && boardItems.length === 0)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-900 dark:disabled:hover:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-medium transition-colors shadow-sm"
              >
                <Send className="size-3" />
                <span>Send</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

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
  ChevronUp,
  AlertTriangle,
  Settings as SettingsIcon,
  RotateCcw,
  Cpu,
  RefreshCw,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { type Editor, type TLShapeId, useValue } from "tldraw";
import { useOllama, type OllamaChatMessage } from "@/lib/ollama";
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

export interface CopilotChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  activeTool?: string | null;
  executedTools?: AgentToolCallEvent[];
  error?: string;
}

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
  const { online, models, modelDetails, selectedModel, setSelectedModel, refresh } =
    useOllama();
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [spawnedCount, setSpawnedCount] = useState<number | null>(null);
  const [storeTick, setStoreTick] = useState(0);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);

  // HUD and accordion states
  const [showToolsHud, setShowToolsHud] = useState(false);
  const [contextCardCollapsed, setContextCardCollapsed] = useState(false);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const [copiedToolKey, setCopiedToolKey] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

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

  const copyMessage = useCallback((msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }, []);

  // Load external MCP tools from Electron main process
  useEffect(() => {
    const fetchTools = () => {
      if (typeof window !== "undefined" && window.focusStore?.mcp?.listTools) {
        window.focusStore.mcp
          .listTools()
          .then((tools) => setMcpTools(tools || []))
          .catch(() => {});
      }
    };

    fetchTools();
    window.addEventListener("foqz:mcp-updated", fetchTools);
    return () => window.removeEventListener("foqz:mcp-updated", fetchTools);
  }, [open]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    if (scrollRef.current && isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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


  // Stop streaming
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? { ...m, isStreaming: false, activeTool: null }
          : m,
      ),
    );
  }, []);

  // Clear conversation / Start new chat
  const handleNewChat = useCallback(() => {
    handleStop();
    setMessages([]);
  }, [handleStop]);

  // Send prompt to Ollama with full canvas context & MCP tool calling
  const handleSend = useCallback(
    async (customPrompt?: string) => {
      const userText = (customPrompt ?? prompt).trim();
      if (!userText && selectedItems.length === 0 && boardItems.length === 0)
        return;
      if (!online) return;

      const promptToRun =
        userText ||
        (selectedItems.length > 0
          ? "Analyze the selected canvas items and break them down into actionable subtasks."
          : "Review all items on the canvas and suggest next steps.");

      // Immediately clear the prompt input so the user can type the next message
      setPrompt("");

      // Stop any existing stream
      handleStop();
      setIsStreaming(true);
      isAtBottomRef.current = true;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMsgId = `msg_${Date.now()}_user`;
      const assistantMsgId = `msg_${Date.now()}_assistant`;

      const userMessage: CopilotChatMessage = {
        id: userMsgId,
        role: "user",
        content: promptToRun,
        timestamp: Date.now(),
      };

      const assistantMessage: CopilotChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
        executedTools: [],
        activeTool: null,
      };

      // Extract prior multi-turn context (excluding empty/error messages)
      const previousHistory: OllamaChatMessage[] = messages
        .filter((m) => m.content.trim().length > 0 && !m.isStreaming && !m.error)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      // Build rich context from canvas
      let contextMsg = "";
      if (selectedItems.length > 0) {
        contextMsg = `[Selected Shapes on Canvas (${selectedItems.length} item${selectedItems.length > 1 ? "s" : ""})]:\n${selectedSummary}`;
      } else if (boardItems.length > 0) {
        contextMsg = `[Active Canvas Board Context (${boardItems.length} item${boardItems.length > 1 ? "s" : ""})]:\n${boardSummary}`;
      }

      const localToolExecutor = createCanvasToolExecutor(editor, () => primaryShape);

      // Refresh MCP tools immediately before running loop
      let currentMcpTools = mcpTools;
      if (typeof window !== "undefined" && window.focusStore?.mcp?.listTools) {
        try {
          const fresh = await window.focusStore.mcp.listTools();
          if (fresh && fresh.length > 0) {
            currentMcpTools = fresh;
            setMcpTools(fresh);
          }
        } catch {}
      }

      const allTools = [...NATIVE_FOQZ_TOOLS, ...(currentMcpTools || [])];

      try {
        const result = await runAgentLoop({
          model: selectedModel || "qwen2.5-coder:7b",
          userPrompt: promptToRun,
          systemPrompt: FOQZ_SYSTEM_PROMPT,
          canvasContext: contextMsg,
          conversationHistory: previousHistory,
          tools: allTools,
          onChunk: (delta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + delta }
                  : m,
              ),
            );
          },
          onToolCallStart: (evt) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      activeTool: `${evt.serverName || "foqz"}:${evt.toolName}`,
                      // Clear any raw tool-call JSON text that was streamed into chat bubble
                      content: "",
                    }
                  : m,
              ),
            );
          },
          onToolCallEnd: (evt) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      activeTool: null,
                      executedTools: [...(m.executedTools || []), evt],
                    }
                  : m,
              ),
            );
          },
          localToolExecutor,
          signal: controller.signal,
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  activeTool: null,
                  content: m.content || result.finalText,
                  executedTools:
                    result.executedTools.length > 0
                      ? result.executedTools
                      : m.executedTools,
                }
              : m,
          ),
        );
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    activeTool: null,
                    error: err.message || "Failed to communicate with Ollama",
                  }
                : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, isStreaming: false, activeTool: null }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
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
      messages,
    ],
  );

  // Spawn items on canvas
  const handleSpawn = useCallback(
    (actions: SpawnableShape[]) => {
      if (!editor || !actions.length) return;

      if (primaryShape && primaryShape.type === "project-frame") {
        const count = spawnWorkflowForProject(
          editor,
          primaryShape as TLProjectFrameShape,
          actions,
        );
        setSpawnedCount(count);
      } else {
        const count = spawnShapesOnCanvas(editor, primaryShape, actions);
        setSpawnedCount(count);
      }

      setTimeout(() => setSpawnedCount(null), 3000);
    },
    [editor, primaryShape],
  );

  // Spawn single item on canvas
  const handleSpawnSingle = useCallback(
    (action: SpawnableShape, index: number) => {
      if (!editor) return;
      spawnSingleShapeOnCanvas(editor, action, primaryShape, index);
    },
    [editor, primaryShape],
  );

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

          {/* Model Selector Dropdown */}
          <Popover open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  title={
                    online
                      ? `Selected Model: ${selectedModel || "Auto"} (click to change)`
                      : "Ollama is offline (start localhost:11434)"
                  }
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
                    online
                      ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                      : "bg-zinc-100/60 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
                  }`}
                />
              }
            >
              <span
                className={`size-1.5 rounded-full shrink-0 ${
                  online ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
                }`}
              />
              <span className="truncate max-w-[85px]">
                {selectedModel || (online ? "Select" : "offline")}
              </span>
              <ChevronDown className="size-3 text-zinc-400 shrink-0" />
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-64 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl text-zinc-900 dark:text-zinc-100 z-50 font-sans"
            >
              {/* Dropdown Header */}
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/80 pb-1.5 mb-1">
                <span className="flex items-center gap-1.5">
                  <Cpu className="size-3 text-violet-500" />
                  <span>Ollama Models</span>
                </span>
                <span className="font-mono">
                  {online ? `${models.length} installed` : "offline"}
                </span>
              </div>

              {/* Model Options List */}
              <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto py-0.5">
                {!online ? (
                  <div className="p-3 text-center space-y-1 text-zinc-500 dark:text-zinc-400">
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      Ollama is unreachable
                    </p>
                    <p className="text-[10px] leading-tight">
                      Ensure Ollama is running on port 11434 (<code className="font-mono">ollama serve</code>).
                    </p>
                  </div>
                ) : models.length === 0 ? (
                  <div className="p-3 text-center space-y-1 text-zinc-500 dark:text-zinc-400">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      No models installed
                    </p>
                    <p className="text-[10px] leading-tight">
                      Run <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">ollama pull qwen2.5-coder:7b</code> in terminal.
                    </p>
                  </div>
                ) : (
                  models.map((modelName) => {
                    const isSelected = modelName === selectedModel;
                    const detail = modelDetails?.find((d) => d.name === modelName);
                    const sizeLabel =
                      detail?.parameterSize ||
                      (detail?.size ? `${(detail.size / 1e9).toFixed(1)} GB` : null);

                    return (
                      <button
                        key={modelName}
                        type="button"
                        onClick={() => {
                          setSelectedModel(modelName);
                          setModelMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-violet-50 dark:bg-violet-950/60 text-violet-900 dark:text-violet-100 font-medium"
                            : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={`size-1.5 rounded-full shrink-0 ${
                              isSelected
                                ? "bg-violet-600 dark:bg-violet-400"
                                : "bg-zinc-300 dark:bg-zinc-700"
                            }`}
                          />
                          <span className="truncate font-mono text-[11px]">
                            {modelName}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pl-2">
                          {sizeLabel && (
                            <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 px-1 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800">
                              {sizeLabel}
                            </span>
                          )}
                          {isSelected ? (
                            <Check className="size-3.5 text-violet-600 dark:text-violet-400" />
                          ) : (
                            <div className="size-3.5" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer Refresh Action */}
              <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-1 mt-1">
                <button
                  type="button"
                  onClick={() => refresh()}
                  className="w-full flex items-center justify-center gap-1.5 py-1 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                >
                  <RefreshCw className="size-2.5" />
                  <span>Refresh installed models</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {/* New Chat Button */}
          <button
            type="button"
            onClick={handleNewChat}
            title="New Chat (clear conversation)"
            className="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw className="size-3.5" />
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
                  onClick={() => setContextCardCollapsed((c) => !c)}
                  title={contextCardCollapsed ? "Expand context card" : "Collapse context card"}
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  {contextCardCollapsed ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronUp className="size-3" />
                  )}
                </button>
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

            {!contextCardCollapsed && (
              <>
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
              </>
            )}
          </div>
        ) : selectedItems.length > 1 ? (
          /* Multiple shapes selected */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-mono uppercase tracking-wider text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold">
                Selected Shapes ({selectedItems.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setContextCardCollapsed((c) => !c)}
                  title={contextCardCollapsed ? "Expand context card" : "Collapse context card"}
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  {contextCardCollapsed ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronUp className="size-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => editor?.selectNone()}
                  title="Deselect all (Escape)"
                  className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <X className="size-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {!contextCardCollapsed && (
              <>
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
              </>
            )}
          </div>
        ) : (
          /* No shape selected — shows Board context */
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-mono uppercase tracking-wider text-[10px] text-zinc-400 dark:text-zinc-500">
                Active Board Context ({boardItems.length} items)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setContextCardCollapsed((c) => !c)}
                  title={contextCardCollapsed ? "Expand context card" : "Collapse context card"}
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  {contextCardCollapsed ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronUp className="size-3" />
                  )}
                </button>
                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <MousePointerClick className="size-3" />
                  Select shape to focus
                </span>
              </div>
            </div>

            {!contextCardCollapsed && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 text-xs leading-relaxed select-text"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 dark:text-zinc-600 font-sans space-y-3 py-12">
            <div className="size-10 rounded-full bg-violet-50 dark:bg-violet-950/40 border border-violet-200/60 dark:border-violet-800/60 flex items-center justify-center text-violet-500">
              <Sparkles className="size-5" />
            </div>
            <div className="space-y-1 max-w-[260px]">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Foqz Copilot Agent
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-normal">
                Ask Copilot to plan tasks, convert notes, invoke MCP tools, or break down goals into connected canvas workflows.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end animate-in fade-in duration-150">
                  <div className="max-w-[88%] rounded-2xl rounded-tr-xs bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/60 px-3.5 py-2.5 text-xs shadow-2xs select-text whitespace-pre-wrap leading-relaxed font-sans">
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Assistant message
            const segments = parseOutputSegments(msg.content);

            return (
              <div
                key={msg.id}
                className="space-y-2.5 font-sans animate-in fade-in duration-150"
              >
                {/* Assistant Message Header */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-violet-500" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Copilot
                    </span>
                  </div>

                  {msg.content && !msg.isStreaming && (
                    <button
                      type="button"
                      onClick={() => copyMessage(msg.id, msg.content)}
                      className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors p-0.5 rounded"
                      title="Copy response"
                    >
                      {copiedMsgId === msg.id ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          <span className="text-emerald-500 font-sans">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span className="font-sans">Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Active Tool Execution Indicator */}
                {msg.activeTool && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/60 text-xs text-violet-700 dark:text-violet-300 animate-pulse font-mono shadow-2xs">
                    <Wrench className="size-3.5 animate-spin text-violet-500" />
                    <span className="font-semibold">Calling {msg.activeTool}...</span>
                  </div>
                )}

                {/* Executed Tools Collapsible Accordion */}
                {msg.executedTools && msg.executedTools.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1.5 font-sans">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold px-0.5">
                      <span>Executed Tools ({msg.executedTools.length})</span>
                      <span>
                        {msg.executedTools.reduce((acc, t) => acc + (t.durationMs || 0), 0)}ms total
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {msg.executedTools.map((t) => {
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

                {/* Error Box */}
                {msg.error && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-rose-500" />
                    <span>{msg.error}</span>
                  </div>
                )}

                {/* Content Stream / Markdown / Canvas Blocks */}
                {msg.content ? (
                  <div className="space-y-3 font-sans">
                    {segments.map((seg, sIdx) => {
                      if (seg.type === "text") {
                        return (
                          <div
                            key={sIdx}
                            className="prose prose-xs dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 leading-relaxed break-words [&_p]:my-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_code]:text-[11px] [&_code]:font-mono [&_code]:bg-zinc-100 dark:[&_code]:bg-zinc-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
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
                            onSpawnAll={() => handleSpawn(seg.actions)}
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
                ) : msg.isStreaming && !msg.activeTool ? (
                  <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 py-2 font-sans text-xs">
                    <span className="size-2 rounded-full bg-violet-500 animate-pulse" />
                    <span>Thinking with {selectedModel}...</span>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Prompt Input */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0">
        <div className="relative flex flex-col gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              singleShape
                ? `Ask about "${singleShape.label.slice(0, 24)}${singleShape.label.length > 24 ? "..." : ""}" (Enter to send)`
                : selectedItems.length > 1
                ? `Ask about ${selectedItems.length} selected shapes... (Enter to send)`
                : "Ask Copilot... (Enter to send, Shift+Enter for newline)"
            }
            rows={2}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none resize-none transition-colors shadow-xs"
          />

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Enter to send • Shift+Enter for newline
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

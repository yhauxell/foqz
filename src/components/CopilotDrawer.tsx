import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Sparkles,
  PanelRightClose,
  X,
  Send,
  ArrowUp,
  Plus,
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
import { useFocusAppSettingsOptional } from "@/context/FocusAppSettingsContext";
import { getCachedAppSettings, patchCachedAppSettings } from "@/lib/appSettingsCache";
import { resolveActiveAiConfig } from "@/lib/appSettings";
import { OPENAI_DEFAULT_MODELS, GEMINI_DEFAULT_MODELS } from "@/lib/aiConnectors";
import type { AiProviderName } from "@/lib/aiProvider";
import { NATIVE_FOQZ_TOOLS, createCanvasToolExecutor } from "@/lib/canvasTools";
import type { McpTool } from "@/lib/mcpTypes";
import {
  FOQZ_SYSTEM_PROMPT,
  findContainingProjectFrame,
  parseCanvasActions,
  parseOutputSegments,
  spawnShapesOnCanvas,
  spawnSingleShapeOnCanvas,
  spawnWorkflowForProject,
  type SpawnableShape,
} from "@/lib/canvasSpawner";
import { CanvasActionList } from "@/components/CanvasActionList";
import { renderMarkdownBlock } from "@/lib/markdown";
import { MarkdownView } from "@/components/MarkdownView";
import {
  extractShapeContext,
  getCanvasContext,
  type ShapeContextItem,
} from "@/lib/canvasContext";
import {
  ACCENT_STYLES,
  type ProjectAccent,
  type TLProjectFrameShape,
} from "@/shapes/projectFrame/ProjectFrameShapeUtil";
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
  onOpenSettings?: (tab?: "general" | "workingHours" | "ai" | "mcp" | "data") => void;
}

export function CopilotDrawer({
  editor,
  open,
  onClose,
  selectedShapeId,
  onOpenSettings,
}: CopilotDrawerProps) {
  const {
    online: ollamaOnline,
    models: ollamaModels,
    modelDetails: ollamaModelDetails,
    selectedModel: selectedOllamaModel,
    setSelectedModel: setSelectedOllamaModel,
    refresh: refreshOllama,
  } = useOllama();

  const appSettingsCtx = useFocusAppSettingsOptional();
  const settings = appSettingsCtx?.settings || getCachedAppSettings();
  const activeConfig = useMemo(() => resolveActiveAiConfig(settings), [settings]);
  const isAiReady =
    activeConfig.isConfigured &&
    (activeConfig.provider !== "ollama" || ollamaOnline);

  const activeModelLabel = useMemo(() => {
    if (activeConfig.provider === "openai") {
      return activeConfig.model || "gpt-4o-mini";
    }
    if (activeConfig.provider === "gemini") {
      return activeConfig.model || "gemini-1.5-flash";
    }
    return selectedOllamaModel || (ollamaOnline ? "Select" : "offline");
  }, [activeConfig, selectedOllamaModel, ollamaOnline]);

  const handleSelectProvider = useCallback(
    (prov: AiProviderName) => {
      const updates: any = { activeAiProvider: prov };
      if (prov === "openai") updates.openaiEnabled = true;
      if (prov === "gemini") updates.geminiEnabled = true;
      if (prov === "ollama") updates.ollamaEnabled = true;

      if (appSettingsCtx?.update) {
        appSettingsCtx.update(updates);
      }
      patchCachedAppSettings(updates);
      try {
        localStorage.setItem("foqz_active_ai_provider", prov);
      } catch {}
    },
    [appSettingsCtx],
  );

  const handleSelectModel = useCallback(
    (prov: AiProviderName, modelName: string) => {
      if (prov === "openai") {
        if (appSettingsCtx?.update) {
          appSettingsCtx.update({ activeAiProvider: "openai", openaiDefaultModel: modelName });
        }
        patchCachedAppSettings({ activeAiProvider: "openai", openaiDefaultModel: modelName });
        try {
          localStorage.setItem("foqz_openai_model", modelName);
        } catch {}
      } else if (prov === "gemini") {
        if (appSettingsCtx?.update) {
          appSettingsCtx.update({ activeAiProvider: "gemini", geminiDefaultModel: modelName });
        }
        patchCachedAppSettings({ activeAiProvider: "gemini", geminiDefaultModel: modelName });
        try {
          localStorage.setItem("foqz_gemini_model", modelName);
        } catch {}
      } else if (prov === "ollama") {
        setSelectedOllamaModel(modelName);
        if (appSettingsCtx?.update) {
          appSettingsCtx.update({ activeAiProvider: "ollama", ollamaDefaultModel: modelName });
        }
        patchCachedAppSettings({ activeAiProvider: "ollama", ollamaDefaultModel: modelName });
        try {
          localStorage.setItem("foqz_ollama_model", modelName);
        } catch {}
      }
    },
    [appSettingsCtx, setSelectedOllamaModel],
  );

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

  // Synchronize store mutations only when drawer is open and actual document shapes change
  useEffect(() => {
    if (!editor || !open) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlistenStore = editor.store.listen(
      (entry) => {
        const changes = entry.changes;
        const hasShapeChange =
          Object.keys(changes.added || {}).length > 0 ||
          Object.keys(changes.removed || {}).length > 0 ||
          Object.keys(changes.updated || {}).length > 0;

        if (hasShapeChange) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            setStoreTick((t) => t + 1);
          }, 300);
        }
      },
      { scope: "document" },
    );

    return () => {
      if (timer) clearTimeout(timer);
      unlistenStore();
    };
  }, [editor, open]);

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

  // Send prompt to Copilot with full canvas context & MCP tool calling
  const handleSend = useCallback(
    async (customPrompt?: string) => {
      const userText = (customPrompt ?? prompt).trim();
      if (!userText && selectedItems.length === 0 && boardItems.length === 0)
        return;

      let runProvider = activeConfig.provider;
      let runModel =
        activeConfig.provider === "ollama"
          ? selectedOllamaModel || "qwen2.5-coder:7b"
          : activeConfig.model;
      let runApiKey = activeConfig.apiKey;
      let runBaseUrl = activeConfig.baseUrl;

      const hasConfiguredOpenAi = Boolean(settings.openaiApiKey?.trim() && settings.openaiEnabled !== false);
      const hasConfiguredGemini = Boolean(settings.geminiApiKey?.trim() && settings.geminiEnabled !== false);

      // Graceful automatic fallback if Ollama is selected but offline
      if (runProvider === "ollama" && !ollamaOnline) {
        if (hasConfiguredOpenAi) {
          runProvider = "openai";
          runModel = settings.openaiDefaultModel || "gpt-4o-mini";
          runApiKey = settings.openaiApiKey;
          runBaseUrl = settings.openaiBaseUrl || "https://api.openai.com/v1";
          handleSelectProvider("openai");
          setMessages((prev) => [
            ...prev,
            {
              id: `msg_${Date.now()}_notice`,
              role: "assistant",
              content: `> **Notice**: Local AI (Ollama) is offline on \`127.0.0.1:11434\`. Automatically switched to your configured **OpenAI** provider (\`${runModel}\`).\n\n*(To use local Ollama, start it in terminal with \`ollama serve\`)*`,
              timestamp: Date.now(),
            },
          ]);
        } else if (hasConfiguredGemini) {
          runProvider = "gemini";
          runModel = settings.geminiDefaultModel || "gemini-1.5-flash";
          runApiKey = settings.geminiApiKey;
          handleSelectProvider("gemini");
          setMessages((prev) => [
            ...prev,
            {
              id: `msg_${Date.now()}_notice`,
              role: "assistant",
              content: `> **Notice**: Local AI (Ollama) is offline on \`127.0.0.1:11434\`. Automatically switched to your configured **Google Gemini** provider (\`${runModel}\`).\n\n*(To use local Ollama, start it in terminal with \`ollama serve\`)*`,
              timestamp: Date.now(),
            },
          ]);
        } else {
          setPrompt("");
          setMessages((prev) => [
            ...prev,
            {
              id: `msg_${Date.now()}_user`,
              role: "user",
              content: userText || "Canvas analysis",
              timestamp: Date.now(),
            },
            {
              id: `msg_${Date.now()}_err`,
              role: "assistant",
              content: `**Local AI (Ollama) is Offline**\n\nFoqz cannot connect to Ollama at \`${activeConfig.baseUrl || "http://127.0.0.1:11434"}\`.\n\n• Start Ollama by running \`ollama serve\` in your terminal.\n• Or configure **OpenAI** or **Google Gemini** in **Settings → AI**.`,
              timestamp: Date.now(),
            },
          ]);
          return;
        }
      } else if (!activeConfig.isConfigured) {
        const name = activeConfig.provider === "openai" ? "OpenAI" : "Google Gemini";
        setPrompt("");
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_user`,
            role: "user",
            content: userText || "Canvas analysis",
            timestamp: Date.now(),
          },
          {
            id: `msg_${Date.now()}_err`,
            role: "assistant",
            content: `**${name} API Key Missing**\n\nPlease add your ${name} API key in **Settings → AI** to use this provider.`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

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
          provider: runProvider,
          model: runModel,
          apiKey: runApiKey,
          baseUrl: runBaseUrl,
          userPrompt: promptToRun,
          systemPrompt: `${FOQZ_SYSTEM_PROMPT}

PORTFOLIO AUDIT:
You have access to the \`jev_audit_portfolio\` native tool.
- When the user asks to plan their day, audit projects, prioritize across the canvas, or ask "what project makes the most sense to push for today?":
  1. ALWAYS invoke the \`jev_audit_portfolio\` tool.
  2. Evaluates all project frames across the canvas on Strategic Leverage, Operational Urgency, and Execution Readiness.
  3. Present the resulting executive briefing clearly in markdown, highlighting the winning project, why it won, and its top focus tasks!

ITEM TRIAGE:
You also have access to \`jev_triage_items\` to prioritize individual candidate tasks or issues against canvas goals.`,
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
                    error: err.message || `Failed to communicate with ${activeConfig.provider}`,
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
      isAiReady,
      activeConfig,
      handleStop,
      selectedOllamaModel,
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

      const targetProject = findContainingProjectFrame(editor, primaryShape);
      if (targetProject) {
        const count = spawnWorkflowForProject(
          editor,
          targetProject,
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
      const targetProject = findContainingProjectFrame(editor, primaryShape);
      if (targetProject) {
        spawnWorkflowForProject(editor, targetProject, [action]);
      } else {
        spawnSingleShapeOnCanvas(editor, action, primaryShape, index);
      }
    },
    [editor, primaryShape],
  );

  if (!open) return null;

  const singleShape = selectedItems.length === 1 ? selectedItems[0] : null;

  return (
    <aside
      className="glass-panel absolute top-3 bottom-3 right-3 w-96 max-w-[calc(100vw-2rem)] rounded-[24px] flex flex-col text-zinc-900 dark:text-zinc-100 font-sans select-none z-40 animate-in slide-in-from-right-4 duration-200 overflow-hidden"
    >
      {/* Header */}
      <div className="h-12 px-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-white/20 dark:bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-blue-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Assistant
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
            className={`h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs ${
              showToolsHud
                ? "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300"
                : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-black/20 dark:hover:border-white/20 hover:text-zinc-950 dark:hover:text-white"
            }`}
          >
            <Wrench className="size-3 text-blue-500" />
            <span>{NATIVE_FOQZ_TOOLS.length + mcpTools.length}</span>
          </button>

          {/* AI Provider & Model Selector Dropdown */}
          <Popover open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  title={
                    isAiReady
                      ? `Active AI: ${activeConfig.provider.toUpperCase()} (${activeModelLabel})`
                      : activeConfig.provider === "ollama"
                      ? "Ollama is offline (start localhost:11434)"
                      : `${activeConfig.provider === "openai" ? "OpenAI" : "Gemini"} API key missing`
                  }
                  className={`h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                    isAiReady
                      ? "border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-200 hover:border-black/20 dark:hover:border-white/20 hover:text-zinc-950 dark:hover:text-white"
                      : "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                  }`}
                />
              }
            >
              <span
                className={`size-1.5 rounded-full shrink-0 ${
                  isAiReady ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="truncate max-w-[95px] font-mono text-[10px]">
                {activeConfig.provider === "openai"
                  ? "OpenAI"
                  : activeConfig.provider === "gemini"
                  ? "Gemini"
                  : "Ollama"}
                : {activeModelLabel}
              </span>
              <ChevronDown className="size-3 text-zinc-400 shrink-0" />
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-72 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl text-zinc-900 dark:text-zinc-100 z-50 font-sans space-y-2"
            >
              {/* Dropdown Header */}
              <div className="flex items-center justify-between px-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <Cpu className="size-3 text-blue-500" />
                  <span>AI Provider & Model</span>
                </span>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setModelMenuOpen(false);
                      onOpenSettings("ai");
                    }}
                    className="text-[10px] lowercase text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    <SettingsIcon className="size-2.5" />
                    <span>settings</span>
                  </button>
                )}
              </div>

              {/* Provider Selection Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-0.5 rounded-full text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectProvider("ollama")}
                  className={`py-1 px-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                    activeConfig.provider === "ollama"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  Ollama
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProvider("openai")}
                  className={`py-1 px-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                    activeConfig.provider === "openai"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  OpenAI
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProvider("gemini")}
                  className={`py-1 px-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                    activeConfig.provider === "gemini"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  Gemini
                </button>
              </div>

              {/* Provider Details & Models */}
              {activeConfig.provider === "openai" && (
                <div className="space-y-1.5 pt-0.5">
                  {!settings.openaiApiKey?.trim() ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
                      <p className="font-semibold">OpenAI API Key Missing</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                        Add your API key or custom endpoint in Settings to use OpenAI models with tools.
                      </p>
                      {onOpenSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            setModelMenuOpen(false);
                            onOpenSettings("ai");
                          }}
                          className="text-[10px] font-semibold text-amber-900 dark:text-amber-200 underline"
                        >
                          Configure in Settings &rarr;
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {OPENAI_DEFAULT_MODELS.map((m) => {
                        const isSelected = activeConfig.model === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              handleSelectModel("openai", m);
                              setModelMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-medium"
                                : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            <span className="font-mono text-[11px]">{m}</span>
                            {isSelected && <Check className="size-3 text-blue-600 dark:text-blue-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeConfig.provider === "gemini" && (
                <div className="space-y-1.5 pt-0.5">
                  {!settings.geminiApiKey?.trim() ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
                      <p className="font-semibold">Gemini API Key Missing</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                        Add your Google Gemini API key in Settings to use Gemini Flash or Pro with tools.
                      </p>
                      {onOpenSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            setModelMenuOpen(false);
                            onOpenSettings("ai");
                          }}
                          className="text-[10px] font-semibold text-amber-900 dark:text-amber-200 underline"
                        >
                          Configure in Settings &rarr;
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {GEMINI_DEFAULT_MODELS.map((m) => {
                        const isSelected = activeConfig.model === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              handleSelectModel("gemini", m);
                              setModelMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-medium"
                                : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            <span className="font-mono text-[11px]">{m}</span>
                            {isSelected && <Check className="size-3 text-blue-600 dark:text-blue-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeConfig.provider === "ollama" && (
                <div className="space-y-1 pt-0.5">
                  {!ollamaOnline ? (
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1.5 text-center">
                      <p className="font-semibold text-rose-600 dark:text-rose-400">Ollama Offline</p>
                      <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                        Start Ollama with <code className="font-mono bg-zinc-200/60 dark:bg-zinc-700 px-1 py-0.5 rounded">ollama serve</code>
                      </p>
                      <div className="flex items-center justify-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => refreshOllama()}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <RefreshCw className="size-2.5" />
                          <span>Retry</span>
                        </button>
                      </div>
                      {settings.openaiApiKey?.trim() ? (
                        <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60">
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectProvider("openai");
                              setModelMenuOpen(false);
                            }}
                            className="w-full px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                          >
                            Switch to OpenAI (Configured)
                          </button>
                        </div>
                      ) : settings.geminiApiKey?.trim() ? (
                        <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60">
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectProvider("gemini");
                              setModelMenuOpen(false);
                            }}
                            className="w-full px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                          >
                            Switch to Gemini (Configured)
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : ollamaModels.length === 0 ? (
                    <div className="p-2 text-center text-xs text-zinc-500">No Ollama models installed</div>
                  ) : (
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {ollamaModels.map((m) => {
                        const isSelected = selectedOllamaModel === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setSelectedOllamaModel(m);
                              handleSelectModel("ollama", m);
                              setModelMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-medium"
                                : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            <span className="font-mono text-[11px] truncate max-w-[170px]">{m}</span>
                            {isSelected && <Check className="size-3 text-blue-600 dark:text-blue-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {ollamaOnline && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-1 mt-1">
                      <button
                        type="button"
                        onClick={() => refreshOllama()}
                        className="w-full flex items-center justify-center gap-1.5 py-1 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                      >
                        <RefreshCw className="size-2.5" />
                        <span>Refresh Ollama Models</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* New Chat Button */}
          <button
            type="button"
            onClick={handleNewChat}
            title="New Chat (clear conversation)"
            className="size-7 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/90 dark:hover:bg-zinc-800/80 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCcw className="size-3" />
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            title="Collapse Assistant (⌘J)"
            className="size-7 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/90 dark:hover:bg-zinc-800/80 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
          >
            <PanelRightClose className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Live Tools HUD Panel */}
      {showToolsHud && (
        <div className="border-b border-black/[0.06] dark:border-white/[0.08] bg-white/30 dark:bg-black/30 backdrop-blur-md p-3 space-y-3 font-sans shrink-0 max-h-72 overflow-y-auto animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wrench className="size-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Active Tools HUD ({NATIVE_FOQZ_TOOLS.length + mcpTools.length})
              </span>
            </div>
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings("mcp")}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
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
                  className="px-2 py-1.5 rounded-lg bg-white/50 dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-[11px] shadow-2xs backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
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
      <div className="p-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
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
                  <ArrowRight className="size-3.5 text-blue-500" />
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
                          ACCENT_STYLES[singleShape.color as ProjectAccent]?.dotHex ||
                          (singleShape.color === "yellow"
                            ? "#facc15"
                            : singleShape.color === "blue"
                            ? "#3b82f6"
                            : singleShape.color === "green"
                            ? "#10b981"
                            : singleShape.color === "red"
                            ? "#ef4444"
                            : singleShape.color === "orange"
                            ? "#f97316"
                            : singleShape.color === "grey"
                            ? "#a1a1aa"
                            : singleShape.color === "black"
                            ? "#18181b"
                            : "#3b82f6"),
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
                  className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
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
                  className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>

            {!contextCardCollapsed && (
              <>
                {/* Selected Item Content Preview Card */}
                <div className="p-2.5 rounded-xl bg-white/50 dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs shadow-2xs backdrop-blur-sm">
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="w-full flex items-center justify-center gap-1.5 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-medium text-xs shadow-2xs transition-all cursor-pointer"
                      >
                        <Sparkles className="size-3.5 text-blue-400 dark:text-blue-500" />
                        <span>Generate Workflow on Canvas</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSend(
                            `List the key milestones and deliverables for project: "${singleShape.label}".`,
                          )
                        }
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                        className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                      <span className="size-1.5 rounded-full bg-blue-500" />
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
                    className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                    className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                  className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
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
                    ? `Assistant has read ${boardItems.length} items on this board (tasks, notes, text). Click any shape on the canvas to focus on it.`
                    : "No shapes with text found on this board. Create a task, note, or prompt Assistant to generate a plan."}
                </p>

                {boardItems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleSend(
                          `Audit all projects across the canvas and recommend which project makes the most sense to push for today.`,
                        )
                      }
                      className="h-6.5 px-3 rounded-full border border-blue-500/30 dark:border-blue-500/40 bg-blue-500/10 dark:bg-blue-500/20 hover:bg-blue-500/20 dark:hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 text-[11px] font-medium transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
                    >
                      <Target className="size-3 text-blue-600 dark:text-blue-400" />
                      <span>Plan My Day</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSend(
                          `Review all items currently on my canvas board and give me a clear daily execution plan:\n${boardSummary}`,
                        )
                      }
                      className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
                      className="h-6.5 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] hover:bg-white/95 dark:hover:bg-white/[0.15] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
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
          <div className="h-full flex flex-col items-center justify-center text-center font-sans space-y-4 py-12 px-4">
            <div className="size-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200 shadow-xs">
              <Sparkles className="size-5 text-blue-500" />
            </div>
            <div className="space-y-1.5 max-w-[280px]">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                How can I help you today?
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Break down projects, summon canvas cards, plan execution, or query MCP tools.
              </p>
            </div>

            {/* Quick Action Suggestion Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 max-w-sm">
              <button
                type="button"
                onClick={() =>
                  handleSend(
                    `Audit all elements and workflows on this canvas. Provide prioritized next steps.`
                  )
                }
                className="h-7 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] px-3 hover:bg-white/95 dark:hover:bg-white/[0.15] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
              >
                <Sparkles className="size-3 text-blue-500" />
                <span>Audit Canvas</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSend(
                    `Review all items currently on my canvas board and give me a clear daily execution plan:\n${boardSummary}`
                  )
                }
                className="h-7 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] px-3 hover:bg-white/95 dark:hover:bg-white/[0.15] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
              >
                <Target className="size-3 text-emerald-500" />
                <span>Plan My Day</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSend(
                    `Analyze what is on my canvas board and point out what is missing or should be tackled next:\n${boardSummary}`
                  )
                }
                className="h-7 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.08] px-3 hover:bg-white/95 dark:hover:bg-white/[0.15] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
              >
                <Layers className="size-3 text-blue-500" />
                <span>Analyze Gaps</span>
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end animate-in fade-in duration-150">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 px-3.5 py-2.5 text-xs shadow-xs select-text whitespace-pre-wrap leading-relaxed font-sans">
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
                className="rounded-2xl rounded-tl-sm bg-white/50 dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] p-3.5 space-y-2.5 shadow-2xs backdrop-blur-sm font-sans animate-in fade-in duration-150"
              >
                {/* Assistant Message Header */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-blue-500" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Assistant
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
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-700 dark:text-blue-300 animate-pulse font-mono shadow-2xs">
                    <Wrench className="size-3.5 animate-spin text-blue-500" />
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
                                  <Wrench className="size-3 text-blue-500 shrink-0" />
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
                          <MarkdownView
                            key={sIdx}
                            content={seg.content}
                            className="text-zinc-800 dark:text-zinc-200"
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
                            className="p-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2 animate-pulse"
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
                    <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>
                      Thinking with{" "}
                      {activeConfig.provider === "ollama"
                        ? selectedOllamaModel || "Ollama"
                        : activeConfig.model}
                      ...
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Prompt Input */}
      <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/20 dark:bg-white/[0.02] shrink-0">
        <div className="rounded-[22px] bg-white/60 dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] p-3 shadow-xs backdrop-blur-sm transition-all focus-within:border-blue-500/50 dark:focus-within:border-blue-400/50">
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
              !isAiReady && !settings.openaiApiKey?.trim() && !settings.geminiApiKey?.trim()
                ? activeConfig.provider === "ollama"
                  ? "Ollama offline. Start 'ollama serve' in terminal..."
                  : `${activeConfig.provider === "openai" ? "OpenAI" : "Gemini"} API key required in Settings...`
                : singleShape
                ? `Ask about "${singleShape.label.slice(0, 24)}${singleShape.label.length > 24 ? "..." : ""}" (Enter to send)`
                : selectedItems.length > 1
                ? `Ask about ${selectedItems.length} selected shapes... (Enter to send)`
                : "Ask Assistant or run MCP tools... (Enter to send, Shift+Enter for newline)"
            }
            rows={2}
            className="w-full bg-transparent border-0 outline-none resize-none text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 leading-relaxed font-sans max-h-32"
          />

          <div className="flex items-center justify-between pt-1 mt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
            <div className="flex items-center gap-1.5">
              {singleShape ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200/60 dark:border-blue-800/60">
                  <span className="size-1.5 rounded-full bg-blue-500" />
                  {singleShape.type}
                </span>
              ) : selectedItems.length > 1 ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                  {selectedItems.length} shapes
                </span>
              ) : (
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Foqz Agent
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 font-mono">⌘↵</span>
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="size-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-xs"
                  title="Stop generating"
                >
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={isStreaming || (!prompt.trim() && selectedItems.length === 0 && boardItems.length === 0)}
                  className="size-7 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:opacity-30 disabled:hover:bg-blue-600 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs disabled:cursor-not-allowed"
                  title="Send message (Enter)"
                >
                  <ArrowUp className="size-3.5 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

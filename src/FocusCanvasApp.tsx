import { FocusSettings, type SettingsTab } from "@/components/FocusSettings";
import { FocusAppSettingsProvider, useFocusAppSettings } from "@/context/FocusAppSettingsContext";
import { TopbarBoardMenu } from "@/components/TopbarBoardMenu";
import { StorageStatus } from "@/components/BoardRecovery";
import { FocusInPlace } from "@/components/FocusInPlace";
import { GlobalSpotlight, type CommandBarView } from "@/components/GlobalSpotlight";
import { ProjectConnectorsModal } from "@/components/ProjectConnectorsModal";
import { GitHubIssuesModal } from "@/components/GitHubIssuesModal";
import { CreateGitHubIssueModal } from "@/components/CreateGitHubIssueModal";
import { useOllama } from "@/lib/ollama";
import { BookOpen, Maximize2, Minimize2, Search, Settings, Sparkles, MessageSquare, X, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AnnotationsPanel } from "@/components/AnnotationsPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LogbookDrawer } from "@/components/LogbookDrawer";
import { useWorkdaySweepTicker } from "@/lib/useWorkdaySweepTicker";
import { FlowCanvasAppWrapper } from "./poc/FlowCanvasAppWrapper";
import { useFlowCanvasStore } from "./poc/store/flowCanvasStore";
import { useGitHubSyncEngine } from "@/lib/githubTaskSync";
import { useMcpHostBridge } from "@/lib/mcpHostBridge";
import { useReminders } from "@/lib/reminders";
import { isActionable, startFocus, stopFocus } from "@/lib/nodeBehaviors";
import { playFocusBlockEndFeedback } from "@/lib/focusSessionFeedback";

export function FocusCanvasApp() {
  return (
    <ErrorBoundary>
      <FocusAppSettingsProvider>
        <FocusCanvasAppInner />
      </FocusAppSettingsProvider>
    </ErrorBoundary>
  );
}

function FocusCanvasAppInner() {
  useGitHubSyncEngine();
  useMcpHostBridge();
  useReminders();
  const flowSelectedNodeId = useFlowCanvasStore((s) => s.selectedNodeId);
  const storeActiveFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId);
  const isTimerRunning = useFlowCanvasStore((s) => s.isTimerRunning);
  const [connectorsShapeId, setConnectorsShapeId] = useState<string | null>(null);
  const [connectorsInitialTab, setConnectorsInitialTab] = useState<"connectors" | "context">("connectors");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightView, setSpotlightView] = useState<CommandBarView>("search");
  const [spotlightCapture, setSpotlightCapture] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("app");
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [githubIssuesOpen, setGithubIssuesOpen] = useState(false);
  const [githubIssuesProjectId, setGithubIssuesProjectId] = useState<string | null>(null);
  const [githubIssuesRepo, setGithubIssuesRepo] = useState<string>("");

  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [createIssueTaskId, setCreateIssueTaskId] = useState<string | null>(null);
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);
  const [logbookOpen, setLogbookOpen] = useState(false);
  const { activeSweepToast, undoSweep, dismissSweepToast } = useWorkdaySweepTicker();
  const annotations = useFlowCanvasStore((s) => s.annotations);

  // Global Link Click Interceptor: Ensure all links open in user's external browser
  useEffect(() => {
    const handleGlobalLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (
        anchor &&
        anchor.href &&
        (anchor.href.startsWith("http:") ||
          anchor.href.startsWith("https:") ||
          anchor.href.startsWith("mailto:"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (window.focusStore?.openExternal) {
          void window.focusStore.openExternal(anchor.href);
        } else if (window.electron?.openExternal) {
          void window.electron.openExternal(anchor.href);
        } else {
          window.open(anchor.href, "_blank", "noopener,noreferrer");
        }
      }
    };
    window.addEventListener("click", handleGlobalLinkClick, true);
    return () => window.removeEventListener("click", handleGlobalLinkClick, true);
  }, []);

  const isMac =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);
  const isElectron =
    typeof window !== "undefined" && Boolean(window.focusStore?.getSettings || (window as any).focusStore);
  const isMacDesktop = isElectron && isMac;

  const { settings, update } = useFocusAppSettings();
  const { online } = useOllama();

  const isDark =
    settings.colorScheme === "dark" ||
    (settings.colorScheme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (window.focusStore?.isMaximized) {
      window.focusStore.isMaximized().then(setIsWindowMaximized).catch(() => {});
    }
    if (window.focusStore?.onMaximizedChange) {
      const unsub = window.focusStore.onMaximizedChange((max) => {
        setIsWindowMaximized(max);
      });
      return () => unsub();
    } else if (typeof document !== "undefined") {
      const onFullscreenChange = () => {
        setIsWindowMaximized(Boolean(document.fullscreenElement));
      };
      document.addEventListener("fullscreenchange", onFullscreenChange);
      return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
    }
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    if (window.focusStore?.toggleMaximize) {
      try {
        const next = await window.focusStore.toggleMaximize();
        setIsWindowMaximized(next);
      } catch (e) {
        console.error("Failed to toggle maximize:", e);
      }
    } else if (typeof document !== "undefined") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  }, []);

  const handleOpenSettings = useCallback(
    (initialTab: SettingsTab = "app") => {
      setSettingsInitialTab(initialTab);
      setSettingsOpen(true);
    },
    [],
  );

  // Custom Event Listeners
  useEffect(() => {
    const onOpenCopilotEvent = (e: any) => {
      const shapeId =
        e.detail?.shapeId ||
        e.detail?.nodeId ||
        (typeof e.detail === "string" ? e.detail : null);
      if (shapeId && shapeId !== "__canvas__") {
        useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
      }
      window.dispatchEvent(
        new CustomEvent("foqz:open-inline-chat", {
          detail: { nodeId: shapeId || "__canvas__" },
        })
      );
    };

    const onFocusTargetEvent = (e: any) => {
      const shapeId = e.detail?.shapeId || (typeof e.detail === "string" ? e.detail : null);
      if (shapeId) {
        if (useFlowCanvasStore.getState().activeFocusNodeId === shapeId) return;
        useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
        startFocus(shapeId);
      } else if (useFlowCanvasStore.getState().activeFocusNodeId) {
        stopFocus();
      }
    };

    const openCommandBar = (view: CommandBarView = "search", capture = false) => {
      setSpotlightView(view);
      setSpotlightCapture(capture);
      setSpotlightOpen(true);
    };

    const onOpenSpotlightEvent = () => openCommandBar();

    const onOpenConnectorsEvent = (e: any) => {
      const shapeId = e.detail?.shapeId || (typeof e.detail === "string" ? e.detail : null);
      const tab = e.detail?.initialTab || "connectors";
      if (shapeId) {
        useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
        setConnectorsShapeId(shapeId);
        setConnectorsInitialTab(tab);
      }
    };

    const onOpenShortcutsEvent = () => openCommandBar("shortcuts");

    const onOpenGithubIssuesEvent = (e: any) => {
      const projectId = e.detail?.projectId || null;
      const repo = e.detail?.githubRepo || "";
      setGithubIssuesProjectId(projectId);
      setGithubIssuesRepo(repo);
      setGithubIssuesOpen(true);
    };

    const onOpenCreateGithubIssueEvent = (e: any) => {
      const taskId = e.detail?.taskId || null;
      setCreateIssueTaskId(taskId);
      setCreateIssueOpen(true);
    };

    const onOpenCaptureEvent = () => openCommandBar("search", true);

    const onOpenLogbookEvent = () => {
      setLogbookOpen(true);
    };

    const onOpenSettingsEvent = () => {
      setSettingsInitialTab("app");
      setSettingsOpen(true);
    };

    window.addEventListener("foqz:open-copilot", onOpenCopilotEvent);
    window.addEventListener("foqz:set-focus-target", onFocusTargetEvent);
    window.addEventListener("foqz:open-spotlight", onOpenSpotlightEvent);
    window.addEventListener("foqz:open-project-connectors", onOpenConnectorsEvent);
    window.addEventListener("foqz:open-shortcuts", onOpenShortcutsEvent);
    window.addEventListener("foqz:open-github-issues", onOpenGithubIssuesEvent);
    window.addEventListener("foqz:open-create-github-issue", onOpenCreateGithubIssueEvent);
    window.addEventListener("foqz:open-quick-task", onOpenCaptureEvent);
    window.addEventListener("foqz:open-logbook", onOpenLogbookEvent);
    window.addEventListener("foqz:open-settings", onOpenSettingsEvent);

    return () => {
      window.removeEventListener("foqz:open-copilot", onOpenCopilotEvent);
      window.removeEventListener("foqz:set-focus-target", onFocusTargetEvent);
      window.removeEventListener("foqz:open-spotlight", onOpenSpotlightEvent);
      window.removeEventListener("foqz:open-project-connectors", onOpenConnectorsEvent);
      window.removeEventListener("foqz:open-shortcuts", onOpenShortcutsEvent);
      window.removeEventListener("foqz:open-github-issues", onOpenGithubIssuesEvent);
      window.removeEventListener("foqz:open-create-github-issue", onOpenCreateGithubIssueEvent);
      window.removeEventListener("foqz:open-quick-task", onOpenCaptureEvent);
      window.removeEventListener("foqz:open-logbook", onOpenLogbookEvent);
      window.removeEventListener("foqz:open-settings", onOpenSettingsEvent);
    };
  }, []);

  // Global focus countdown runner: single source of truth across all components
  useEffect(() => {
    if (!storeActiveFocusNodeId || !isTimerRunning) return;
    const interval = setInterval(() => {
      let reachedZero = false;
      useFlowCanvasStore.getState().setTimerSecondsRemaining((prev) => {
        if (prev <= 1) {
          reachedZero = true;
          useFlowCanvasStore.getState().setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
      if (reachedZero) playFocusBlockEndFeedback("timer");

      // Accumulate focus time on the focused node (any actionable text)
      const state = useFlowCanvasStore.getState();
      const activeNode = state.nodes.find((n) => n.id === storeActiveFocusNodeId);
      if (activeNode && isActionable(activeNode)) {
        const currentSeconds = Number((activeNode.data as any)?.focusSecondsSpent) || 0;
        const currentTrackedMs = Number((activeNode.data as any)?.trackedMs) || 0;
        state.updateNodeData(storeActiveFocusNodeId, {
          focusSecondsSpent: currentSeconds + 1,
          trackedMs: currentTrackedMs + 1000,
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [storeActiveFocusNodeId, isTimerRunning]);

  // Global Shell Keyboard Shortcuts (Canvas shortcuts are managed by useFlowCanvasShortcuts)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Spotlight: Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSpotlightView("search");
        setSpotlightCapture(false);
        setSpotlightOpen((prev) => !prev);
        return;
      }

      // Capture: Cmd+Shift+N / Ctrl+Shift+N opens the command bar ready to write (works while typing)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        (e.key === "n" || e.key === "N")
      ) {
        e.preventDefault();
        setSpotlightView("search");
        setSpotlightCapture(true);
        setSpotlightOpen(true);
        return;
      }

      // Settings: Cmd+, / Ctrl+,
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsInitialTab("app");
        setSettingsOpen(true);
        return;
      }

      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          Boolean(target.closest?.("[contenteditable='true']")))
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Fit View (Cmd+B or Cmd+\)
      if (
        mod &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key.toLowerCase() === "b" || e.key === "\\")
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("foqz:fit-view"));
        return;
      }


      // Open Space-Aware Assistant (Cmd+J or Cmd+/)
      if (
        (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") ||
        (mod && !e.shiftKey && e.key === "/")
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("foqz:open-inline-chat", {
            detail: { nodeId: useFlowCanvasStore.getState().selectedNodeId || "__canvas__" },
          })
        );
        return;
      }

      // Maximize / Restore Window (Cmd+Ctrl+F or F11)
      if ((mod && e.ctrlKey && e.key.toLowerCase() === "f") || e.key === "F11") {
        e.preventDefault();
        void handleToggleMaximize();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={`app bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 ${isWindowMaximized ? "is-maximized" : ""}`}>
      {/* Vercel / shadcn Whisper Topbar */}
      <header
        className="topbar h-12 px-4 flex items-center justify-between select-none z-50 border-b border-zinc-200/60 dark:border-zinc-800/60"
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (target && !target.closest("button, input, select, textarea, [role='button']")) {
            void handleToggleMaximize();
          }
        }}
      >
        {/* Left section: Brand + Board Menu */}
        <div
          className={`flex items-center gap-2 shrink-0 transition-all duration-150 ${
            isMacDesktop ? "pl-[76px]" : ""
          }`}
        >
          <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white mr-1 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-500 inline-block" />
            <span>Foqz</span>
          </div>

          {/* Board Name & History Menu */}
          <TopbarBoardMenu />
          <StorageStatus />
        </div>

        {/* Centered command bar (⌘K) */}
        <div className="flex-1 flex justify-center items-center gap-1.5 px-2 sm:px-4 max-w-md sm:max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => {
              setSpotlightView("search");
              setSpotlightCapture(false);
              setSpotlightOpen(true);
            }}
            className="h-7 w-full max-w-xs sm:max-w-sm px-3 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all shadow-2xs flex items-center justify-between cursor-pointer group"
            title="Find, run, or write (⌘K)"
          >
            <div className="flex items-center gap-2 truncate text-xs">
              <Search className="size-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 shrink-0 transition-colors" />
              <span className="truncate">Find, run, or just type to write…</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-60 group-hover:opacity-90 px-1.5 py-0.2 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 transition-opacity shrink-0 ml-1.5">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right section: Assistant + Shortcuts + Settings + Window Maximize */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Space-Aware Assistant Trigger (Solid Black in Light Mode, White in Dark Mode) */}
          <button
            type="button"
            title={`AI Copilot (⌘J) • ${online ? "Ollama Connected" : "Ollama Offline"}`}
            aria-label="AI Copilot"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("foqz:open-inline-chat", {
                  detail: { nodeId: flowSelectedNodeId || "__canvas__" },
                })
              );
            }}
            className="size-7.5 rounded-full bg-zinc-950 hover:bg-black text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer relative"
          >
            <Sparkles className="size-3.5 fill-current" />
            <span
              className={`absolute -top-0.5 -right-0.5 size-2 rounded-full border border-white dark:border-zinc-900 ${
                online ? "bg-emerald-500" : "bg-zinc-400"
              }`}
            />
          </button>

          {/* Annotations Panel Toggle */}
          {(() => {
            const openCount = Object.values(annotations || {}).filter(
              (a) => a.status === 'open'
            ).length;
            return (
              <button
                type="button"
                className={`h-7 px-2.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 ${
                  annotationsPanelOpen
                    ? "bg-amber-500 text-white border-amber-600 dark:border-amber-400"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                } flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer text-xs font-medium`}
                aria-label="Annotations Panel"
                title="Annotations & Comments Panel"
                onClick={() => setAnnotationsPanelOpen(!annotationsPanelOpen)}
              >
                <MessageSquare className="size-3.5" />
                <span>Annotations</span>
                {openCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold leading-none ${
                      annotationsPanelOpen
                        ? "bg-white text-amber-700"
                        : "bg-amber-500 text-white"
                    }`}
                  >
                    {openCount}
                  </span>
                )}
              </button>
            );
          })()}

          {/* Logbook (done items swept from the board) */}
          <button
            type="button"
            className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            aria-label="Open Logbook"
            title="Logbook: done items moved off the board"
            onClick={() => setLogbookOpen(true)}
          >
            <BookOpen className="size-3.5" />
          </button>

          {/* Settings Modal */}
          <button
            type="button"
            className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            aria-label="Settings"
            title="Settings (⌘,)"
            onClick={() => handleOpenSettings("app")}
          >
            <Settings className="size-3.5" />
          </button>

          {/* Maximize / Full Screen Window */}
          <button
            type="button"
            className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            aria-label={isWindowMaximized ? "Exit full screen" : "Enter full screen"}
            title={isWindowMaximized ? "Exit full screen (⌘⌃F)" : "Enter full screen (⌘⌃F)"}
            onClick={() => void handleToggleMaximize()}
          >
            {isWindowMaximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* Full-Bleed Spatial Canvas Shell */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="canvas w-full h-full relative overflow-hidden">
          <FlowCanvasAppWrapper />

          {/* Floating Annotations Panel Sidebar Drawer */}
          {annotationsPanelOpen && (
            <aside
              className="glass-panel pointer-events-auto backdrop-blur-xl backdrop-saturate-150 absolute top-3 bottom-3 right-3 w-80 max-w-[calc(100vw-2rem)] rounded-[24px] flex flex-col text-zinc-900 dark:text-zinc-100 font-sans select-none z-[5900] animate-in slide-in-from-right-4 duration-200 overflow-hidden shadow-2xl border border-white/60 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-12 px-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-white/20 dark:bg-white/[0.02] shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-amber-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Annotations
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAnnotationsPanelOpen(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  title="Close Annotations Panel"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <AnnotationsPanel
                  onSelectNode={(id) => {
                    useFlowCanvasStore.getState().setSelectedNodeId(id);
                  }}
                  onSelectAnnotation={(id) => {
                    useFlowCanvasStore.getState().setActiveAnnotationId(id);
                  }}
                />
              </div>
            </aside>
          )}

          {/* Focus in place: dims the board, floats the timer */}
          <ErrorBoundary onReset={() => stopFocus()}>
            <FocusInPlace />
          </ErrorBoundary>

          <GlobalSpotlight
            open={spotlightOpen}
            onClose={() => setSpotlightOpen(false)}
            initialView={spotlightView}
            captureMode={spotlightCapture}
          />

          <ProjectConnectorsModal
            shapeId={connectorsShapeId}
            initialTab={connectorsInitialTab}
            onClose={() => setConnectorsShapeId(null)}
          />

          <FocusSettings
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            initialTab={settingsInitialTab}
          />

          <GitHubIssuesModal
            open={githubIssuesOpen}
            onClose={() => setGithubIssuesOpen(false)}
            projectId={githubIssuesProjectId}
            githubRepo={githubIssuesRepo}
          />

          <CreateGitHubIssueModal
            open={createIssueOpen}
            onClose={() => setCreateIssueOpen(false)}
            taskId={createIssueTaskId}
          />

          <LogbookDrawer
            open={logbookOpen}
            onClose={() => setLogbookOpen(false)}
          />

          {/* Workday Sweep Toast with Undo */}
          {activeSweepToast && (
            <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2.5 rounded-full bg-zinc-900/95 dark:bg-white/95 text-white dark:text-zinc-900 shadow-2xl backdrop-blur-xl border border-white/10 dark:border-black/10 text-xs font-medium animate-in fade-in slide-in-from-top-3 duration-200 select-none">
              <span className="size-2 rounded-full bg-amber-400" />
              <span>
                {activeSweepToast.count} done item{activeSweepToast.count > 1 ? "s" : ""} moved to the Logbook
              </span>
              <button
                type="button"
                onClick={undoSweep}
                className="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="size-3" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={dismissSweepToast}
                className="p-0.5 rounded-full text-zinc-400 hover:text-white dark:hover:text-zinc-900 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

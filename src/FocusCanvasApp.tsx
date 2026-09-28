import { FocusSettings } from "@/components/FocusSettings";
import { FocusAppSettingsProvider, useFocusAppSettings } from "@/context/FocusAppSettingsContext";
import { CopilotDrawer } from "@/components/CopilotDrawer";
import { TopbarBoardMenu } from "@/components/TopbarBoardMenu";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { MonoFocusController } from "@/components/MonoFocusController";
import { GlobalSpotlight } from "@/components/GlobalSpotlight";
import { ProjectConnectorsModal } from "@/components/ProjectConnectorsModal";
import { useOllama } from "@/lib/ollama";
import { FolderPlus, Keyboard, PanelLeft, Plus, Search, Settings, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ShortcutsModal } from "@/poc/components/ShortcutsModal";
import { FlowCanvasAppWrapper } from "./poc/FlowCanvasAppWrapper";
import { useFlowCanvasStore } from "./poc/store/flowCanvasStore";

export function FocusCanvasApp() {
  return (
    <FocusAppSettingsProvider>
      <FocusCanvasAppInner />
    </FocusAppSettingsProvider>
  );
}

function FocusCanvasAppInner() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const flowSelectedNodeId = useFlowCanvasStore((s) => s.selectedNodeId);
  const [activeFocusShapeId, setActiveFocusShapeId] = useState<string | null>(null);
  const [connectorsShapeId, setConnectorsShapeId] = useState<string | null>(null);
  const [connectorsInitialTab, setConnectorsInitialTab] = useState<"connectors" | "context">("connectors");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "general" | "workingHours" | "ai" | "mcp" | "data"
  >("general");

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

  const handleOpenSettings = useCallback(
    (initialTab: "general" | "workingHours" | "ai" | "mcp" | "data" = "general") => {
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
        (typeof e.detail === "string" ? e.detail : null);
      if (shapeId) {
        useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
      }
      setCopilotOpen(true);
    };

    const onFocusTargetEvent = (e: any) => {
      const shapeId = e.detail?.shapeId || (typeof e.detail === "string" ? e.detail : null);
      if (shapeId) {
        useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
        setActiveFocusShapeId(shapeId);
      }
    };

    const onOpenSpotlightEvent = () => {
      setSpotlightOpen(true);
    };

    const onOpenConnectorsEvent = (e: any) => {
      const shapeId = e.detail?.shapeId || (typeof e.detail === "string" ? e.detail : null);
      const tab = e.detail?.initialTab || "connectors";
      if (shapeId) {
        useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
        setConnectorsShapeId(shapeId);
        setConnectorsInitialTab(tab);
      }
    };

    const onOpenShortcutsEvent = () => {
      setShortcutsOpen(true);
    };

    window.addEventListener("foqz:open-copilot", onOpenCopilotEvent);
    window.addEventListener("foqz:set-focus-target", onFocusTargetEvent);
    window.addEventListener("foqz:open-spotlight", onOpenSpotlightEvent);
    window.addEventListener("foqz:open-project-connectors", onOpenConnectorsEvent);
    window.addEventListener("foqz:open-shortcuts", onOpenShortcutsEvent);

    return () => {
      window.removeEventListener("foqz:open-copilot", onOpenCopilotEvent);
      window.removeEventListener("foqz:set-focus-target", onFocusTargetEvent);
      window.removeEventListener("foqz:open-spotlight", onOpenSpotlightEvent);
      window.removeEventListener("foqz:open-project-connectors", onOpenConnectorsEvent);
      window.removeEventListener("foqz:open-shortcuts", onOpenShortcutsEvent);
    };
  }, []);

  // Quick Action: Create new Project Frame at viewport center
  const handleCreateProject = useCallback(() => {
    const id = useFlowCanvasStore.getState().createProject({
      title: "New Project",
      goal: "Goal: Launch milestone by Friday",
      accent: "blue",
    });
    window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
  }, []);

  // Quick Action: Create new Task at viewport center
  const handleCreateTask = useCallback(() => {
    const id = useFlowCanvasStore.getState().createTask({
      title: "New Task",
      status: "open",
      priority: 3,
    });
    window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Spotlight: Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
        return;
      }

      // Ignore single-key shortcuts if typing in an input or textarea
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

      const primaryId = useFlowCanvasStore.getState().selectedNodeId;

      if ((e.key === "f" || e.key === "F") && primaryId) {
        e.preventDefault();
        setActiveFocusShapeId(primaryId);
      } else if (e.key === "?" && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }

      const mod = e.metaKey || e.ctrlKey;

      // Toggle Workspace Sidebar (Cmd+B or Cmd+\)
      if (
        mod &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key.toLowerCase() === "b" || e.key === "\\")
      ) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }

      // Toggle Assistant Sidebar (Cmd+J or Cmd+Shift+B or Cmd+/)
      if (
        (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") ||
        (mod && e.shiftKey && e.key.toLowerCase() === "b") ||
        (mod && !e.shiftKey && e.key === "/")
      ) {
        e.preventDefault();
        setCopilotOpen((v) => !v);
        return;
      }

      // New Project Frame (Cmd+Shift+P, Option+Cmd+N, or Option+P)
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === "p") ||
        (mod && e.altKey && e.key.toLowerCase() === "n") ||
        (!mod && e.altKey && e.key.toLowerCase() === "p")
      ) {
        e.preventDefault();
        handleCreateProject();
        return;
      }

      // New Task (Cmd+N, Cmd+Shift+N)
      if (
        (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") ||
        (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "n")
      ) {
        e.preventDefault();
        handleCreateTask();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCreateProject, handleCreateTask]);

  return (
    <div
      className={`app bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 ${
        copilotOpen ? "app--copilot-open" : ""
      }`}
      style={{
        ["--tools-bar-right" as any]: copilotOpen ? "412px" : "18px",
      }}
    >
      {/* Vercel / shadcn Topbar */}
      <header className="topbar h-12 px-4 flex items-center justify-between select-none z-50">
        {/* Left section: Sidebar Toggle + Brand + Board Menu */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            title="Toggle Workspace Sidebar (⌘B)"
            onClick={() => setSidebarOpen((v) => !v)}
            className={`size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shadow-2xs cursor-pointer mr-0.5 ${
              sidebarOpen ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-700" : ""
            }`}
          >
            <PanelLeft className="size-3.5" />
          </button>

          <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white mr-1">
            Foqz
          </div>

          {/* Board Name & History Menu */}
          <TopbarBoardMenu />
        </div>

        {/* Centered Unified Jump & Search Action (⌘K) */}
        <div className="flex-1 flex justify-center px-2 sm:px-4 max-w-sm sm:max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setSpotlightOpen(true)}
            className="h-7 w-full max-w-xs sm:max-w-sm px-3 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all shadow-2xs flex items-center justify-between cursor-pointer group"
            title="Jump to project, task, or search canvas (⌘K)"
          >
            <div className="flex items-center gap-2 truncate text-xs">
              <Search className="size-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 shrink-0 transition-colors" />
              <span className="truncate">Jump to or search...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-60 group-hover:opacity-90 px-1.5 py-0.2 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 transition-opacity shrink-0 ml-1.5">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right section: Quick Create + Assistant + Settings */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Add Project Frame */}
          <button
            type="button"
            title="Add Project Frame (⌘⇧P)"
            onClick={handleCreateProject}
            className="h-7 px-2.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus className="size-3" />
            <span>Project</span>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800/80 ml-0.5">⌘⇧P</kbd>
          </button>

          {/* Quick Add Task */}
          <button
            type="button"
            title="Add Task Card (⌘N)"
            onClick={handleCreateTask}
            className="h-7 px-2.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>Task</span>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800/80 ml-0.5">⌘N</kbd>
          </button>

          {/* Toggle AI Assistant */}
          <button
            type="button"
            title="Toggle AI Assistant (⌘J)"
            onClick={() => setCopilotOpen((v) => !v)}
            className={`h-7 px-2.5 rounded-full text-xs font-medium border transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer ${
              copilotOpen
                ? "bg-blue-100 dark:bg-blue-950/70 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold"
                : "border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-950 dark:hover:text-white"
            }`}
          >
            <Sparkles className="size-3 text-blue-500" />
            <span>Assistant</span>
            <span
              className={`size-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
              title={online ? "Ollama is online" : "Ollama is offline"}
            />
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800/80 ml-0.5">⌘J</kbd>
          </button>

          {/* Keyboard Shortcuts Modal */}
          <button
            type="button"
            className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            aria-label="Keyboard Shortcuts"
            title="Keyboard Shortcuts (?)"
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard className="size-3.5" />
          </button>

          {/* Settings Modal */}
          <button
            type="button"
            className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            aria-label="Settings"
            onClick={() => handleOpenSettings("general")}
          >
            <Settings className="size-3.5" />
          </button>
        </div>
      </header>

      {/* Workspace Shell: Left Sidebar + Center Infinite Canvas + Right Copilot Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="canvas w-full h-full relative overflow-hidden">
          <FlowCanvasAppWrapper sidebarOpen={sidebarOpen} />

          {/* Universal Shell Overlays */}
          <MonoFocusController
            activeShapeId={activeFocusShapeId}
            onClearFocus={() => setActiveFocusShapeId(null)}
          />

          <GlobalSpotlight
            open={spotlightOpen}
            onClose={() => setSpotlightOpen(false)}
            onSelectFocusTarget={(id) => {
              window.dispatchEvent(
                new CustomEvent("foqz:flow-center-on", { detail: { id } })
              );
            }}
          />

          <ProjectConnectorsModal
            shapeId={connectorsShapeId}
            initialTab={connectorsInitialTab}
            onClose={() => setConnectorsShapeId(null)}
          />

          {/* Floating Left Workspace Sidebar */}
          <WorkspaceSidebar
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            onOpenCopilot={(shapeId) => {
              if (shapeId) {
                useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
              }
              setCopilotOpen(true);
            }}
          />

          {/* Decoupled Copilot Side Panel */}
          <CopilotDrawer
            open={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            selectedShapeId={flowSelectedNodeId}
            onOpenSettings={handleOpenSettings}
          />

          <FocusSettings
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            initialTab={settingsInitialTab}
          />

          <ShortcutsModal
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
        </main>
      </div>
    </div>
  );
}

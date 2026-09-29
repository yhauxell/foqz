import { FocusSettings } from "@/components/FocusSettings";
import { FocusAppSettingsProvider, useFocusAppSettings } from "@/context/FocusAppSettingsContext";
import { TopbarBoardMenu } from "@/components/TopbarBoardMenu";
import { WaypointRail } from "@/components/WaypointRail";
import { MonoFocusController } from "@/components/MonoFocusController";
import { GlobalSpotlight } from "@/components/GlobalSpotlight";
import { ProjectConnectorsModal } from "@/components/ProjectConnectorsModal";
import { useOllama } from "@/lib/ollama";
import { Keyboard, Search, Settings, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ShortcutsModal } from "@/poc/components/ShortcutsModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FlowCanvasAppWrapper } from "./poc/FlowCanvasAppWrapper";
import { useFlowCanvasStore } from "./poc/store/flowCanvasStore";

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
        useFlowCanvasStore.getState().setSelectedNodeId(shapeId);
        setActiveFocusShapeId((prev) => (prev === shapeId ? null : shapeId));
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

  // Global Shell Keyboard Shortcuts (Canvas shortcuts are managed by useFlowCanvasShortcuts)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Spotlight: Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
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
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Vercel / shadcn Whisper Topbar */}
      <header className="topbar h-12 px-4 flex items-center justify-between select-none z-50 border-b border-zinc-200/60 dark:border-zinc-800/60">
        {/* Left section: Brand + Board Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white mr-1 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-500 inline-block" />
            <span>Foqz</span>
          </div>

          {/* Board Name & History Menu */}
          <TopbarBoardMenu />
        </div>

        {/* Centered Omni-Spotlight Trigger (⌘K) */}
        <div className="flex-1 flex justify-center px-2 sm:px-4 max-w-sm sm:max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setSpotlightOpen(true)}
            className="h-7 w-full max-w-xs sm:max-w-sm px-3 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all shadow-2xs flex items-center justify-between cursor-pointer group"
            title="Create task, jump to project, or command canvas (⌘K)"
          >
            <div className="flex items-center gap-2 truncate text-xs">
              <Search className="size-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 shrink-0 transition-colors" />
              <span className="truncate">⌘K  Create, jump, or command...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-60 group-hover:opacity-90 px-1.5 py-0.2 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 transition-opacity shrink-0 ml-1.5">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right section: Assistant + Shortcuts + Settings */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Space-Aware Assistant Trigger */}
          <button
            type="button"
            title="Open Space-Aware Assistant (⌘J / Space+C)"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("foqz:open-inline-chat", {
                  detail: { nodeId: flowSelectedNodeId || "__canvas__" },
                })
              );
            }}
            className="h-7 px-2.5 rounded-full text-xs font-medium border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="size-3 text-blue-500" />
            <span>AI Copilot</span>
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

      {/* Full-Bleed Spatial Canvas Shell */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="canvas w-full h-full relative overflow-hidden">
          <FlowCanvasAppWrapper />

          {/* Floating Spatial Waypoint Rail */}
          <WaypointRail />

          {/* Universal Shell Overlays */}
          <ErrorBoundary onReset={() => setActiveFocusShapeId(null)}>
            <MonoFocusController
              activeShapeId={activeFocusShapeId}
              onClearFocus={() => setActiveFocusShapeId(null)}
            />
          </ErrorBoundary>

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

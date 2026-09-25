import {
  FocusEditorUi,
  buildFocusToolsOverride,
  focusUiTranslations,
} from "@/components/FocusEditorUi";
import { FocusColorSchemeSync, FocusSettings } from "@/components/FocusSettings";
import { FocusToolbar } from "@/components/FocusToolbar";
import { FocusAppSettingsProvider, useFocusAppSettings } from "@/context/FocusAppSettingsContext";
import { mergeAppSettings } from "@/lib/appSettings";
import {
  getCachedAppSettings,
  replaceCachedAppSettings,
} from "@/lib/appSettingsCache";
import { stopAllFocusSessions } from "@/lib/focusTime";
import { focusShapeUtils, focusTools } from "@/shapes";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";
import type { TLFocusTimerShape } from "@/shapes/focusTimer/FocusTimerShapeUtil";
import type { TLProjectFrameShape } from "@/shapes/projectFrame/ProjectFrameShapeUtil";
import { CopilotDrawer } from "@/components/CopilotDrawer";
import { TopbarBoardMenu } from "@/components/TopbarBoardMenu";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ContextualSelectionHud } from "@/components/ContextualSelectionHud";
import { ElementInlineChat } from "@/components/ElementInlineChat";
import { MonoFocusController } from "@/components/MonoFocusController";
import { GlobalSpotlight } from "@/components/GlobalSpotlight";
import { CanvasZoomControls } from "@/components/CanvasZoomControls";
import { ProjectConnectorsModal } from "@/components/ProjectConnectorsModal";
import { useOllama } from "@/lib/ollama";
import { FolderPlus, PanelLeft, Plus, Search, Settings, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createShapeId,
  Editor,
  Tldraw,
  getSnapshot,
  loadSnapshot,
  type TLShapeId,
  type TLUiOverrides,
} from "tldraw";
import "tldraw/tldraw.css";
import { Button } from "./components/ui/button";

const SAVE_DELAY_MS = 500;

const focusOverrides: TLUiOverrides[] = [
  {
    tools: buildFocusToolsOverride(),
    translations: {
      en: focusUiTranslations as Record<string, string>,
    },
  },
];

/** Rename default tldraw pages `Page 1` … → `Foqz Board 1` … for the menu trigger label. */
function migratePageNamesToFocusBoard(editor: Editor) {
  editor.run(() => {
    for (const page of editor.getPages()) {
      const m = /^Page (\d+)$/.exec(page.name.trim());
      if (m) {
        editor.renamePage(page.id, `Foqz Board ${m[1]}`);
      }
    }
  });
}

export function FocusCanvasApp() {
  return (
    <FocusAppSettingsProvider>
      <FocusCanvasAppInner />
    </FocusAppSettingsProvider>
  );
}

function FocusCanvasAppInner() {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlisten = useRef<(() => void) | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState("Loading board...");
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "general" | "workingHours" | "ai" | "mcp" | "data"
  >("general");

  const handleOpenSettings = useCallback(
    (initialTab: "general" | "workingHours" | "ai" | "mcp" | "data" = "general") => {
      setSettingsInitialTab(initialTab);
      setSettingsOpen(true);
    },
    [],
  );

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedShapeId, setSelectedShapeId] = useState<TLShapeId | null>(null);
  const [inlineChatShapeId, setInlineChatShapeId] = useState<TLShapeId | null>(null);
  const [activeFocusShapeId, setActiveFocusShapeId] = useState<TLShapeId | null>(null);
  const [connectorsShapeId, setConnectorsShapeId] = useState<TLShapeId | null>(null);
  const [connectorsInitialTab, setConnectorsInitialTab] = useState<"connectors" | "context">("connectors");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [stats, setStats] = useState<{
    totalTasks: number;
    doneTasks: number;
    projects: TLProjectFrameShape[];
  }>({ totalTasks: 0, doneTasks: 0, projects: [] });

  const { settings, update } = useFocusAppSettings();
  const { online } = useOllama();

  const isDark =
    settings.colorScheme === "dark" ||
    (settings.colorScheme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const toggleTheme = useCallback(() => {
    const next = isDark ? "light" : "dark";
    update({ colorScheme: next });
    if (editor) {
      editor.user.updateUserPreferences({ colorScheme: next });
    }
  }, [editor, isDark, update]);


  const setCanvasRef = useCallback((node: HTMLDivElement | null) => {
    setCanvasEl(node);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      unlisten.current?.();
    };
  }, []);

  useEffect(() => {
    const off = window.focusStore?.onPrepareShutdown?.(async () => {
      const ed = editorRef.current;
      if (!ed) return;
      stopAllFocusSessions(ed);
      const snapshot = getSnapshot(ed.store);
      await window.focusStore?.saveSnapshot?.(snapshot);
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      const ed = editorRef.current;
      if (ed) stopAllFocusSessions(ed);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Listen for custom event to open copilot
  useEffect(() => {
    const onOpenCopilotEvent = (e: any) => {
      const shapeId =
        e.detail?.shapeId ||
        (typeof e.detail === "string" ? e.detail : null);
      if (shapeId) {
        setSelectedShapeId(shapeId);
        if (editorRef.current) {
          editorRef.current.select(shapeId);
        }
      }
      setCopilotOpen(true);
    };

    const onInlineChatEvent = (e: any) => {
      const shapeId = e.detail?.shapeId || (typeof e.detail === "string" ? e.detail : null);
      if (shapeId) {
        setSelectedShapeId(shapeId);
        setInlineChatShapeId(shapeId);
      }
    };

    const onFocusTargetEvent = (e: any) => {
      const shapeId = e.detail?.shapeId || (typeof e.detail === "string" ? e.detail : null);
      if (shapeId) {
        setSelectedShapeId(shapeId);
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
        setSelectedShapeId(shapeId);
        setConnectorsShapeId(shapeId);
        setConnectorsInitialTab(tab);
      }
    };

    window.addEventListener("foqz:open-copilot", onOpenCopilotEvent);
    window.addEventListener("foqz:open-inline-chat", onInlineChatEvent);
    window.addEventListener("foqz:set-focus-target", onFocusTargetEvent);
    window.addEventListener("foqz:open-spotlight", onOpenSpotlightEvent);
    window.addEventListener("foqz:open-project-connectors", onOpenConnectorsEvent);

    return () => {
      window.removeEventListener("foqz:open-copilot", onOpenCopilotEvent);
      window.removeEventListener("foqz:open-inline-chat", onInlineChatEvent);
      window.removeEventListener("foqz:set-focus-target", onFocusTargetEvent);
      window.removeEventListener("foqz:open-spotlight", onOpenSpotlightEvent);
      window.removeEventListener("foqz:open-project-connectors", onOpenConnectorsEvent);
    };
  }, []);

  // Global Keyboard shortcuts: Cmd+K (Spotlight), C (Inline Chat), F (Mono-Focus)
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
          target.isContentEditable)
      ) {
        return;
      }

      const ed = editorRef.current;
      if (!ed) return;
      const selectedIds = ed.getSelectedShapeIds();
      const primaryId = selectedIds.length > 0 ? selectedIds[0] : null;

      if ((e.key === "c" || e.key === "C") && primaryId) {
        e.preventDefault();
        setInlineChatShapeId((prev) => (prev === primaryId ? null : primaryId));
      } else if ((e.key === "f" || e.key === "F") && primaryId) {
        e.preventDefault();
        setActiveFocusShapeId(primaryId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const tldrawComponents = useMemo(
    () => ({
      Toolbar: FocusToolbar,
      MenuPanel: null,
      MainMenu: null,
      PageMenu: null,
      QuickActions: null,
      ActionsMenu: null,
      StylePanel: null,
      NavigationPanel: null,
      Minimap: null,
      ZoomMenu: null,
      HelpMenu: null,
    }),
    [],
  );

  const refreshCanvasStats = useCallback((ed: Editor) => {
    const shapes = ed.getCurrentPageShapes();
    let total = 0;
    let done = 0;
    const projs: TLProjectFrameShape[] = [];

    for (const s of shapes) {
      if (s.type === "focus-task") {
        total++;
        if ((s as TLFocusTaskShape).props.status === "done") {
          done++;
        }
      } else if (s.type === "project-frame") {
        projs.push(s as TLProjectFrameShape);
      }
    }

    setStats({ totalTasks: total, doneTasks: done, projects: projs });
  }, []);

  const handlers = useMemo(
    () => ({
      onMount(ed: Editor) {
        editorRef.current = ed;
        setEditor(ed);

        void (async () => {
          try {
            const remote = await window.focusStore?.getSettings?.();
            if (remote) replaceCachedAppSettings(mergeAppSettings(remote));
          } catch {
            /* use defaults */
          }

          ed.sideEffects.registerAfterCreateHandler("shape", (record) => {
            if (record.type === "focus-timer") {
              const def = getCachedAppSettings().defaultFocusMinutes;
              const r = record as TLFocusTimerShape;
              ed.updateShape({
                id: r.id,
                type: "focus-timer",
                props: {
                  ...r.props,
                  durationPreset: def,
                },
              });
            }
            if (record.type === "focus-task") {
              const def = getCachedAppSettings().defaultFocusMinutes;
              const r = record as TLFocusTaskShape;
              ed.updateShape({
                id: r.id,
                type: "focus-task",
                props: {
                  ...r.props,
                  focusPresetMin: def,
                },
              });
            }
          });

          try {
            const snapshot = await window.focusStore?.loadSnapshot?.();
            if (snapshot) {
              loadSnapshot(ed.store, snapshot);
              setStatus("Board restored");
            } else {
              setStatus("Ready");
            }
          } catch {
            setStatus("Could not load previous board");
          }

          migratePageNamesToFocusBoard(ed);
          refreshCanvasStats(ed);

          // Track selection changes
          ed.on("change", () => {
            const selected = ed.getSelectedShapeIds();
            setSelectedShapeId(selected.length > 0 ? selected[0] : null);
          });

          unlisten.current?.();
          unlisten.current = ed.store.listen(
            () => {
              refreshCanvasStats(ed);
              if (saveTimer.current) window.clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(async () => {
                const snapshot = getSnapshot(ed.store);
                const result = await window.focusStore?.saveSnapshot?.(snapshot);
                setStatus(result?.ok ? "Saved" : "Save failed");
              }, SAVE_DELAY_MS);
            },
            { scope: "document" },
          );
        })();
      },
    }),
    [refreshCanvasStats],
  );

  // Quick Action: Create new Project Frame at viewport center
  const handleCreateProject = useCallback(() => {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    editor.createShape({
      id,
      type: "project-frame",
      x: center.x - 360,
      y: center.y - 230,
      props: {
        w: 720,
        h: 460,
        title: "New Project",
        goal: "Goal: Launch milestone by Friday",
        accent: "blue",
      },
    });
    editor.select(id);
  }, [editor]);

  // Quick Action: Create new Task at viewport center
  const handleCreateTask = useCallback(() => {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    editor.createShape({
      id,
      type: "focus-task",
      x: center.x - 130,
      y: center.y - 42,
      props: {
        w: 260,
        h: 84,
        title: "",
        status: "open",
      },
    });
    editor.select(id);
  }, [editor]);


  // Global Keyboard Shortcuts: Sidebars, New Project, New Task
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable ||
        Boolean(target?.closest?.("[contenteditable='true']"));

      const mod = e.metaKey || e.ctrlKey;

      // 1. Toggle Workspace Sidebar (Cmd+B or Cmd+\)
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

      // 2. Toggle Assistant Sidebar (Cmd+J or Cmd+Shift+B or Cmd+/)
      if (
        (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") ||
        (mod && e.shiftKey && e.key.toLowerCase() === "b") ||
        (mod && !e.shiftKey && e.key === "/")
      ) {
        e.preventDefault();
        setCopilotOpen((v) => !v);
        return;
      }

      // 3. New Project Frame (Cmd+Shift+P, Option+Cmd+N, or Option+P)
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === "p") ||
        (mod && e.altKey && e.key.toLowerCase() === "n") ||
        (!mod && e.altKey && e.key.toLowerCase() === "p")
      ) {
        e.preventDefault();
        handleCreateProject();
        return;
      }

      // 4. New Task (Cmd+N, Cmd+Shift+N)
      if (
        (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") ||
        (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "n")
      ) {
        e.preventDefault();
        handleCreateTask();
        return;
      }
    };

    // Custom Event Listeners for global triggers
    const onToggleSidebar = () => setSidebarOpen((v) => !v);
    const onToggleCopilot = () => setCopilotOpen((v) => !v);
    const onNewProject = () => handleCreateProject();
    const onNewTask = () => handleCreateTask();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("foqz:toggle-sidebar", onToggleSidebar);
    window.addEventListener("foqz:toggle-copilot", onToggleCopilot);
    window.addEventListener("foqz:new-project", onNewProject);
    window.addEventListener("foqz:new-task", onNewTask);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("foqz:toggle-sidebar", onToggleSidebar);
      window.removeEventListener("foqz:toggle-copilot", onToggleCopilot);
      window.removeEventListener("foqz:new-project", onNewProject);
      window.removeEventListener("foqz:new-task", onNewTask);
    };
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
        {/* Left section: Sidebar Toggle + Brand + Page Switcher */}
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

          {/* Board / Page Switcher & Canvas Actions (replaces floating Ideas bar) */}
          <TopbarBoardMenu editor={editor} />
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

          {/* Settings Modal */}
          <button
            type="button"
            className="size-7 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            aria-label="Settings"
            onClick={() => handleOpenSettings("general")}
          >
            <Settings className="size-3.5" />
          </button>

          {/* Status */}
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono pl-1">{status}</div>
        </div>
      </header>


      {/* Workspace Shell: Left Sidebar + Center Infinite Canvas + Right Copilot Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        <main ref={setCanvasRef} className="canvas w-full h-full relative overflow-hidden">
          <Tldraw
            components={tldrawComponents}
            onMount={handlers.onMount}
            shapeUtils={[...focusShapeUtils]}
            tools={[...focusTools]}
            overrides={focusOverrides}
          >
            <FocusColorSchemeSync />
            <FocusEditorUi canvasEl={canvasEl} />
            <ContextualSelectionHud />
            <CanvasZoomControls sidebarOpen={sidebarOpen} />
            <ElementInlineChat
              editor={editor}
              shapeId={inlineChatShapeId}
              onClose={() => setInlineChatShapeId(null)}
            />
            <MonoFocusController
              editor={editor}
              activeShapeId={activeFocusShapeId}
              onClearFocus={() => setActiveFocusShapeId(null)}
            />
            <GlobalSpotlight
              editor={editor}
              open={spotlightOpen}
              onClose={() => setSpotlightOpen(false)}
              onSelectFocusTarget={(id) => setActiveFocusShapeId(id)}
            />
            <FocusSettings
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              initialTab={settingsInitialTab}
            />
            <ProjectConnectorsModal
              editor={editor}
              shapeId={connectorsShapeId}
              initialTab={connectorsInitialTab}
              onClose={() => setConnectorsShapeId(null)}
            />

            {/* Floating Left Workspace Sidebar */}
            <WorkspaceSidebar
              editor={editor}
              open={sidebarOpen}
              onToggle={() => setSidebarOpen((v) => !v)}
              onOpenCopilot={(shapeId) => {
                if (shapeId) setSelectedShapeId(shapeId);
                setCopilotOpen(true);
              }}
            />

            {/* Decoupled Copilot Side Panel (matches left WorkspaceSidebar) */}
            <CopilotDrawer
              editor={editor}
              open={copilotOpen}
              onClose={() => setCopilotOpen(false)}
              selectedShapeId={selectedShapeId}
              onOpenSettings={handleOpenSettings}
            />
          </Tldraw>
        </main>
      </div>
    </div>
  );
}

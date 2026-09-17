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
import { FolderPlus, Moon, PanelLeft, PanelRight, Plus, Settings, Sparkles, Sun } from "lucide-react";
import { useOllama } from "@/lib/ollama";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedShapeId, setSelectedShapeId] = useState<TLShapeId | null>(null);
  const [stats, setStats] = useState<{
    totalTasks: number;
    doneTasks: number;
    projects: TLProjectFrameShape[];
  }>({ totalTasks: 0, doneTasks: 0, projects: [] });

  const { settings, update } = useFocusAppSettings();
  const { online, selectedModel, models, setSelectedModel } = useOllama();

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
    window.addEventListener("foqz:open-copilot", onOpenCopilotEvent);
    return () => window.removeEventListener("foqz:open-copilot", onOpenCopilotEvent);
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

          // Double-click on canvas spawns a task card at cursor
          ed.on("event", (info) => {
            if (info.name === "double_click" && info.target === "canvas") {
              const pagePoint = ed.inputs.currentPagePoint;
              const newId = createShapeId();
              ed.createShape({
                id: newId,
                type: "focus-task",
                x: pagePoint.x - 130,
                y: pagePoint.y - 42,
                props: {
                  w: 260,
                  h: 84,
                  title: "",
                  status: "open",
                },
              });
              ed.select(newId);
            }
          });

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
        accent: "indigo",
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

  // Quick Action: Smoothly jump camera to selected project
  const handleJumpToProject = useCallback(
    (projectId: string) => {
      if (!editor || !projectId) return;
      const bounds = editor.getShapePageBounds(projectId as TLShapeId);
      if (bounds) {
        editor.zoomToBounds(bounds, { animation: { duration: 300 }, inset: 80 });
        editor.select(projectId as TLShapeId);
      }
    },
    [editor],
  );

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

      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // 1. Toggle Workspace Sidebar (Cmd+B or Cmd+\)
      if (
        mod &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key.toLowerCase() === "b" || e.key === "\\")
      ) {
        if (!isInput) {
          e.preventDefault();
          setSidebarOpen((v) => !v);
          return;
        }
      }

      // 2. Toggle Copilot Sidebar (Cmd+J or Cmd+Shift+B or Cmd+/)
      if (
        (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") ||
        (mod && e.shiftKey && e.key.toLowerCase() === "b") ||
        (mod && !e.shiftKey && e.key === "/")
      ) {
        if (!isInput) {
          e.preventDefault();
          setCopilotOpen((v) => !v);
          return;
        }
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

      // Single-key shortcut on canvas: 'c' for New Task (when not typing in any input)
      if (
        !mod &&
        !e.altKey &&
        !e.shiftKey &&
        !isInput &&
        e.key.toLowerCase() === "c"
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
    <div className="app bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Vercel / shadcn Topbar */}
      <header className="topbar h-12 px-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-950/95 backdrop-blur flex items-center justify-between select-none z-50">
        {/* Left section: Sidebar Toggle + Brand + Daily Clearance + Project Jump */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            title="Toggle Workspace Sidebar (⌘B)"
            onClick={() => setSidebarOpen((v) => !v)}
            className={`p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors mr-0.5 ${
              sidebarOpen ? "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-white" : ""
            }`}
          >
            <PanelLeft className="size-4" />
          </button>

          <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white mr-1">
            Foqz
          </div>

          {/* Global Daily Clearance Progress Pill */}
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300"
            title="Daily clearance progress across all projects"
          >
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {stats.doneTasks}/{stats.totalTasks} Done Today
            </span>
          </div>

          {/* Board / Page Switcher & Canvas Actions (replaces floating Ideas bar) */}
          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />
          <TopbarBoardMenu editor={editor} />

          {/* Quick-Jump Project Dropdown */}
          {stats.projects.length > 0 ? (
            <select
              aria-label="Quick-Jump Project"
              defaultValue=""
              onChange={(e) => {
                handleJumpToProject(e.target.value);
                e.target.value = "";
              }}
              className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs rounded-md px-2 py-1 outline-none hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer"
            >
              <option value="" disabled>
                Jump to Project...
              </option>
              {stats.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.props.title || "Untitled Project"}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Right section: Quick Create + Copilot + Ollama + Theme + Settings */}
        <div className="flex items-center gap-2">
          {/* Quick Add Project Frame */}
          <button
            type="button"
            title="Add Project Frame (⌘⇧P)"
            onClick={handleCreateProject}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
          >
            <FolderPlus className="size-3.5" />
            <span>Project</span>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800/80 ml-0.5">⌘⇧P</kbd>
          </button>

          {/* Quick Add Task */}
          <button
            type="button"
            title="Add Task Card (⌘N or double-click canvas)"
            onClick={handleCreateTask}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
          >
            <Plus className="size-3.5" />
            <span>Task</span>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-50 px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800/80 ml-0.5">⌘N</kbd>
          </button>

          {/* Ollama Model / Status Pill */}
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              online
                ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-950 dark:hover:text-white"
                : "bg-zinc-100/60 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500"
            }`}
            title={
              online
                ? `Ollama online • Model: ${selectedModel || "Auto"} (click to cycle)`
                : "Ollama offline • Start Ollama at localhost:11434"
            }
            onClick={() => {
              if (!models.length) return;
              const idx = models.indexOf(selectedModel);
              const next = models[(idx + 1) % models.length];
              setSelectedModel(next);
            }}
          >
            <span
              className={`size-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
            />
            <span className="truncate max-w-[100px]">
              {online ? selectedModel || "ollama" : "ollama: off"}
            </span>
          </button>

          {/* 1-Click Theme Toggle Button (Light / Dark) */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {/* Settings Modal */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" />
          </Button>

          {/* Copilot Side Trigger (matches left toolbar PanelLeft trigger) */}
          <button
            type="button"
            title="Toggle AI Copilot (⌘J)"
            onClick={() => setCopilotOpen((v) => !v)}
            className={`p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-0.5 ${
              copilotOpen ? "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-white" : ""
            }`}
          >
            <PanelRight className="size-4" />
          </button>

          {/* Status */}
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono pl-1">{status}</div>
        </div>
      </header>

      {/* Workspace Shell: Left Sidebar + Center Infinite Canvas + Right Copilot Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        <WorkspaceSidebar
          editor={editor}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          onOpenCopilot={(shapeId) => {
            if (shapeId) setSelectedShapeId(shapeId);
            setCopilotOpen(true);
          }}
        />

        <main ref={setCanvasRef} className="canvas flex-1 relative overflow-hidden">
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
            <FocusSettings
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
            />
          </Tldraw>
        </main>

        {/* Decoupled Copilot Side Panel (matches left WorkspaceSidebar) */}
        <CopilotDrawer
          editor={editor}
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          selectedShapeId={selectedShapeId}
        />
      </div>
    </div>
  );
}

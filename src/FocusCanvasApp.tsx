import {
  FocusEditorUi,
  buildFocusToolsOverride,
  focusUiTranslations,
} from "@/components/FocusEditorUi";
import { FocusColorSchemeSync, FocusSettings } from "@/components/FocusSettings";
import { FocusToolbar } from "@/components/FocusToolbar";
import { FocusAppSettingsProvider } from "@/context/FocusAppSettingsContext";
import { mergeAppSettings } from "@/lib/appSettings";
import {
  getCachedAppSettings,
  replaceCachedAppSettings,
} from "@/lib/appSettingsCache";
import { stopAllFocusSessions } from "@/lib/focusTime";
import { focusShapeUtils, focusTools } from "@/shapes";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";
import type { TLFocusTimerShape } from "@/shapes/focusTimer/FocusTimerShapeUtil";
import { Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Editor,
  Tldraw,
  getSnapshot,
  loadSnapshot,
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlisten = useRef<(() => void) | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [status, setStatus] = useState("Loading board...");
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      const editor = editorRef.current;
      if (!editor) return;
      stopAllFocusSessions(editor);
      const snapshot = getSnapshot(editor.store);
      await window.focusStore?.saveSnapshot?.(snapshot);
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      const editor = editorRef.current;
      if (editor) stopAllFocusSessions(editor);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const tldrawComponents = useMemo(() => ({ Toolbar: FocusToolbar }), []);

  const handlers = useMemo(
    () => ({
      onMount(editor: Editor) {
        editorRef.current = editor;
        void (async () => {
          try {
            const remote = await window.focusStore?.getSettings?.();
            if (remote) replaceCachedAppSettings(mergeAppSettings(remote));
          } catch {
            /* use defaults */
          }

          editor.sideEffects.registerAfterCreateHandler("shape", (record) => {
            if (record.type === "focus-timer") {
              const def = getCachedAppSettings().defaultFocusMinutes;
              const r = record as TLFocusTimerShape;
              editor.updateShape({
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
              editor.updateShape({
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
              loadSnapshot(editor.store, snapshot);
              setStatus("Board restored");
            } else {
              setStatus("Ready");
            }
          } catch {
            setStatus("Could not load previous board");
          }

          migratePageNamesToFocusBoard(editor);

          unlisten.current?.();
          unlisten.current = editor.store.listen(
            () => {
              if (saveTimer.current) window.clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(async () => {
                const snapshot = getSnapshot(editor.store);
                const result = await window.focusStore?.saveSnapshot?.(snapshot);
                setStatus(result?.ok ? "Saved" : "Save failed");
              }, SAVE_DELAY_MS);
            },
            { scope: "document" },
          );
        })();
      },
    }),
    [],
  );

  return (
    <FocusAppSettingsProvider>
      <div className="app">
        <header className="topbar">
          <div className="title">Foqz</div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4" />
            </Button>
            <div className="status">{status}</div>
          </div>
        </header>
        <main ref={setCanvasRef} className="canvas">
          <Tldraw
            components={tldrawComponents}
            onMount={handlers.onMount}
            shapeUtils={[...focusShapeUtils]}
            tools={[...focusTools]}
            overrides={focusOverrides}
          >
            <FocusColorSchemeSync />
            <FocusEditorUi canvasEl={canvasEl} />
            <FocusSettings
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
            />
          </Tldraw>
        </main>
      </div>
    </FocusAppSettingsProvider>
  );
}

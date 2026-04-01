import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFocusAppSettings } from "@/context/FocusAppSettingsContext";
import { mergeAppSettings } from "@/lib/appSettings";
import { ensureNotificationPermission } from "@/lib/focusSessionFeedback";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TLShapeId } from "tldraw";
import { getSnapshot, loadSnapshot, useEditor } from "tldraw";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-5">
      <div className="min-w-0 sm:max-w-[min(100%,260px)] sm:shrink-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-stretch sm:items-end">
        {children}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="size-4 shrink-0 rounded border-border accent-primary disabled:opacity-50"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  );
}

/** Aligns checkbox to the end of the row on wide layouts. */
function ToggleRowControl(
  props: Parameters<typeof Toggle>[0],
) {
  return (
    <div className="flex w-full justify-end sm:pt-0.5">
      <Toggle {...props} />
    </div>
  );
}

export function FocusColorSchemeSync() {
  const editor = useEditor();
  const { settings } = useFocusAppSettings();

  useEffect(() => {
    editor.user.updateUserPreferences({ colorScheme: settings.colorScheme });
  }, [editor, settings.colorScheme]);

  return null;
}

function parsePresetsText(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 480);
}

type SettingsTab = "general" | "workingHours" | "data";

function formatTime(min: number): string {
  const m = Math.min(24 * 60, Math.max(0, Math.round(min)));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseTimeToMinutes(v: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 24) return null;
  if (mm < 0 || mm > 59) return null;
  if (hh === 24 && mm !== 0) return null;
  return hh * 60 + mm;
}

export function FocusSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const editor = useEditor();
  const { settings, update } = useFocusAppSettings();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [shortcutDraft, setShortcutDraft] = useState(settings.globalToggleShortcut);
  const [presetsDraft, setPresetsDraft] = useState(() =>
    settings.durationPresets.join(", "),
  );
  const [workingStart, setWorkingStart] = useState(
    formatTime(settings.workingHours.startMin),
  );
  const [workingEnd, setWorkingEnd] = useState(formatTime(settings.workingHours.endMin));
  const [saveError, setSaveError] = useState<string | null>(null);

  const isElectron = typeof window.focusStore?.getSettings === "function";

  useEffect(() => {
    setShortcutDraft(settings.globalToggleShortcut);
    setPresetsDraft(settings.durationPresets.join(", "));
    setWorkingStart(formatTime(settings.workingHours.startMin));
    setWorkingEnd(formatTime(settings.workingHours.endMin));
  }, [settings.globalToggleShortcut, settings.durationPresets]);

  useEffect(() => {
    if (open) setTab("general");
  }, [open]);

  const persistWorkingHours = useCallback(async () => {
    setSaveError(null);
    const startMin = parseTimeToMinutes(workingStart);
    const endMin = parseTimeToMinutes(workingEnd);
    if (startMin == null || endMin == null) {
      setSaveError("Working hours must be valid times.");
      return;
    }
    if (startMin === endMin) {
      setSaveError("Working hours range can’t be zero-length.");
      return;
    }
    const res = await update({ workingHours: { startMin, endMin } });
    if (!res.ok) setSaveError(res.error ?? "Could not save working hours");
  }, [update, workingStart, workingEnd]);

  const persistShortcut = useCallback(async () => {
    setSaveError(null);
    const res = await update({ globalToggleShortcut: shortcutDraft.trim() });
    if (!res.ok) setSaveError(res.error ?? "Could not save shortcut");
  }, [update, shortcutDraft]);

  const persistPresets = useCallback(async () => {
    setSaveError(null);
    const nums = parsePresetsText(presetsDraft);
    if (nums.length === 0) {
      setSaveError("Add at least one duration preset (minutes).");
      return;
    }
    const merged = mergeAppSettings({
      ...settings,
      durationPresets: nums,
    });
    const res = await update({
      durationPresets: merged.durationPresets,
      defaultFocusMinutes: merged.defaultFocusMinutes,
    });
    if (!res.ok) setSaveError(res.error ?? "Could not save presets");
    else setPresetsDraft(merged.durationPresets.join(", "));
  }, [update, presetsDraft, settings]);

  const exportBoard = useCallback(async () => {
    setSaveError(null);
    const snapshot = getSnapshot(editor.store);
    const r = await window.focusStore?.exportBoardToFile?.(snapshot);
    if (r && !r.ok && !r.canceled)
      setSaveError(r.error ?? "Export failed");
  }, [editor]);

  const importBoard = useCallback(async () => {
    setSaveError(null);
    const r = await window.focusStore?.importBoardFromFile?.();
    if (!r || r.canceled) return;
    if (!r.ok || !("snapshot" in r)) {
      setSaveError(r.error ?? "Import failed");
      return;
    }
    try {
      loadSnapshot(editor.store, r.snapshot as never);
      const snapshot = getSnapshot(editor.store);
      await window.focusStore?.saveSnapshot?.(snapshot);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Import failed");
    }
  }, [editor]);

  const resetBoard = useCallback(async () => {
    if (
      !window.confirm(
        "Erase everything on this board? This cannot be undone.",
      )
    )
      return;
    setSaveError(null);
    try {
      await window.focusStore?.clearBoardFile?.();
      editor.run(() => {
        for (const page of editor.getPages()) {
          for (const id of [...editor.getSortedChildIdsForParent(page.id)]) {
            editor.deleteShape(id as TLShapeId);
          }
        }
      });
      const snapshot = getSnapshot(editor.store);
      await window.focusStore?.saveSnapshot?.(snapshot);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Reset failed");
    }
  }, [editor, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(92vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/90 bg-background/95 shadow-2xl backdrop-blur-md dark:border-white/12 dark:bg-zinc-950/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 id="focus-settings-title" className="text-base font-semibold tracking-tight">
            Settings
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="border-b border-border/60 px-5 py-3">
          <div className="inline-flex w-full items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-3 text-sm font-medium transition",
                tab === "general"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("general")}
            >
              General
            </button>
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-3 text-sm font-medium transition",
                tab === "workingHours"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("workingHours")}
            >
              Working hours
            </button>
            <button
              type="button"
              className={[
                "h-8 flex-1 rounded-lg px-3 text-sm font-medium transition",
                tab === "data"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setTab("data")}
            >
              Data
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="flex flex-col gap-9 pb-2">
            {tab === "general" ? (
            <>
            <Section title="Focus timer">
              <Row
                label="Default block length"
                description="Used for new timer cards and task focus sessions."
              >
                <Input
                  type="number"
                  inputSize="sm"
                  min={1}
                  max={480}
                  className="w-full max-w-[120px] sm:ml-auto"
                  value={settings.defaultFocusMinutes}
                  onChange={(e) =>
                    void update({
                      defaultFocusMinutes: Number(e.target.value),
                    })
                  }
                />
              </Row>
              <Row
                label="Duration presets (minutes)"
                description="Comma-separated list shown on timer shapes."
              >
                <Input
                  inputSize="sm"
                  className="w-full min-w-0 font-mono text-xs sm:max-w-full"
                  value={presetsDraft}
                  onChange={(e) => setPresetsDraft(e.target.value)}
                  onBlur={() => void persistPresets()}
                  placeholder="15, 25, 50"
                />
              </Row>
            </Section>

            <Section title="Window">
              <Row
                label="Keep window on top"
                description="Floating above other windows."
              >
                <ToggleRowControl
                  checked={settings.alwaysOnTop}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ alwaysOnTop: v })}
                />
              </Row>
              <Row
                label="Pin window"
                description="When on, the canvas stays visible when you click elsewhere."
              >
                <ToggleRowControl
                  checked={settings.pinWindow}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ pinWindow: v })}
                />
              </Row>
              <Row
                label="Remember window position & size"
                description="Restores where you left the window."
              >
                <ToggleRowControl
                  checked={settings.rememberWindowBounds}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ rememberWindowBounds: v })}
                />
              </Row>
              <Row
                label="Show icon in Dock"
                description="macOS: show the app in the Dock in addition to the menu bar tray. No effect on Windows or Linux."
              >
                <ToggleRowControl
                  checked={settings.showDockIcon}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ showDockIcon: v })}
                />
              </Row>
            </Section>

            <Section title="Startup & shortcuts">
              <Row
                label="Open at login"
                description="Start with macOS (menu bar apps)."
              >
                <ToggleRowControl
                  checked={settings.openAtLogin}
                  disabled={!isElectron}
                  onCheckedChange={(v) => void update({ openAtLogin: v })}
                />
              </Row>
              <Row
                label="Global show / hide"
                description="Electron accelerator, e.g. CommandOrControl+Shift+F"
              >
                <Input
                  inputSize="sm"
                  className="w-full min-w-0 font-mono text-xs"
                  value={shortcutDraft}
                  onChange={(e) => setShortcutDraft(e.target.value)}
                  onBlur={() => void persistShortcut()}
                  disabled={!isElectron}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Row>
            </Section>

            <Section title="Notifications">
              <Row
                label="Notify when a focus block ends"
                description="Uses system notifications when allowed."
              >
                <ToggleRowControl
                  checked={settings.notifyOnTimerEnd}
                  onCheckedChange={async (v) => {
                    if (v) await ensureNotificationPermission();
                    void update({ notifyOnTimerEnd: v });
                  }}
                />
              </Row>
              <Row label="Play sound" description="Short chime when time is up.">
                <ToggleRowControl
                  checked={settings.playSoundOnTimerEnd}
                  onCheckedChange={(v) => void update({ playSoundOnTimerEnd: v })}
                />
              </Row>
            </Section>

            <Section title="Appearance">
              <Row label="Color scheme">
                <select
                  className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm sm:ml-auto sm:max-w-[220px]"
                  value={settings.colorScheme}
                  onChange={(e) =>
                    void update({
                      colorScheme: e.target.value as typeof settings.colorScheme,
                    })
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Row>
            </Section>
            </>
            ) : null}

            {tab === "workingHours" ? (
              <Section title="Working hours">
                <Row
                  label="Range"
                  description="Used for planning features (e.g. highlighting after-hours). Overnight ranges are allowed."
                >
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-[320px]">
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        inputSize="sm"
                        className="w-full min-w-0"
                        value={workingStart}
                        onChange={(e) => setWorkingStart(e.target.value)}
                        onBlur={() => void persistWorkingHours()}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        inputSize="sm"
                        className="w-full min-w-0"
                        value={workingEnd}
                        onChange={(e) => setWorkingEnd(e.target.value)}
                        onBlur={() => void persistWorkingHours()}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Example: 09:00–17:00. Overnight: 22:00–06:00.
                    </div>
                  </div>
                </Row>
              </Section>
            ) : null}

            {tab === "data" ? (
            <Section title="Data">
              <Row
                label="Export board"
                description="Save a JSON copy of your canvas."
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isElectron}
                  onClick={() => void exportBoard()}
                >
                  Export…
                </Button>
              </Row>
              <Row
                label="Import board"
                description="Replace the current canvas from a JSON file."
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isElectron}
                  onClick={() => void importBoard()}
                >
                  Import…
                </Button>
              </Row>
              <Row label="Erase board" description="Remove all shapes permanently.">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={!isElectron}
                  onClick={() => void resetBoard()}
                >
                  Reset board…
                </Button>
              </Row>
            </Section>
            ) : null}

            {!isElectron ? (
              <p className="text-xs text-muted-foreground">
                Window, startup, and file actions require the desktop app.
              </p>
            ) : null}

            {saveError ? (
              <p className="text-xs font-medium text-destructive">{saveError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

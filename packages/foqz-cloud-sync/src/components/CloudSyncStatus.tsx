import { AlertTriangle, Check, Cloud, CloudOff, Loader2 } from "lucide-react";
import { useCloudSyncStatus, type CloudPhase } from "../storage/cloudSync";

const LABEL: Record<CloudPhase, string> = {
  "signed-out": "Cloud",
  syncing: "Syncing",
  saved: "Saved",
  offline: "Offline",
  error: "Error",
};

export function CloudSyncStatus({ onOpen }: { onOpen: () => void }) {
  const phase = useCloudSyncStatus((state) => state.phase);
  const detail = useCloudSyncStatus((state) => state.detail);
  const label = LABEL[phase];
  const tone =
    phase === "saved"
      ? "text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-900/60"
      : phase === "syncing"
        ? "text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-900/60"
        : phase === "error"
          ? "text-red-700 dark:text-red-300 border-red-200/80 dark:border-red-900/60"
          : "text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800";

  return (
    <button
      type="button"
      onClick={onOpen}
      title={detail ?? label}
      aria-label={detail ? `${label}. ${detail}` : `Cloud sync: ${label}`}
      className={`h-7 px-2 rounded-full border bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer ${tone}`}
    >
      {phase === "syncing" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : phase === "saved" ? (
        <Check className="size-3.5" />
      ) : phase === "offline" ? (
        <CloudOff className="size-3.5" />
      ) : phase === "error" ? (
        <AlertTriangle className="size-3.5" />
      ) : (
        <Cloud className="size-3.5" />
      )}
      <span className="hidden sm:inline text-[11px] font-medium">{label}</span>
    </button>
  );
}

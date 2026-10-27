import { LocalStorageAdapter } from "@/lib/storage/LocalStorageAdapter";
import { DiskBackedStorageAdapter } from "@/lib/storage/DiskBackedStorageAdapter";
import type { CanvasStorageAdapter } from "@/types/storage";

export {
  ACTIVE_BOARD_KEY,
  BOARD_NAME_KEY,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  FLOW_STORAGE_KEY,
  STORAGE_BOARDS_KEY,
  getBoardStorageKey,
} from "@/lib/storage/keys";
export { LocalStorageAdapter } from "@/lib/storage/LocalStorageAdapter";
export {
  createEmptySnapshot,
  nextBoardSnapshot,
  normalizeBoardSnapshot,
} from "@/lib/storage/snapshot";

export { DiskBackedStorageAdapter } from "@/lib/storage/DiskBackedStorageAdapter";
export type { BoardBackup } from "@/lib/storage/LocalStorageAdapter";

/** Files on disk in the desktop app; localStorage alone in a plain browser (tests, web preview). */
function createDefaultStorage(): LocalStorageAdapter {
  const disk = typeof window !== "undefined" ? window.focusStore?.boards : undefined;
  return disk ? new DiskBackedStorageAdapter(disk) : new LocalStorageAdapter();
}

let canvasStorage: LocalStorageAdapter = createDefaultStorage();

/** Active canvas storage adapter (defaults to localStorage). */
export function getCanvasStorage(): LocalStorageAdapter {
  return canvasStorage;
}

/**
 * Replace the process-wide adapter (tests / future DI).
 * Accepts any {@link CanvasStorageAdapter}; sync store paths require
 * {@link LocalStorageAdapter} until async hydration lands in a later phase.
 */
export function setCanvasStorage(
  adapter: LocalStorageAdapter | CanvasStorageAdapter
): void {
  if (adapter instanceof LocalStorageAdapter) {
    canvasStorage = adapter;
    return;
  }
  throw new Error(
    "setCanvasStorage currently requires a LocalStorageAdapter (sync Phase 1 store)."
  );
}

/** Reset to a fresh default adapter. */
export function resetCanvasStorage(): void {
  canvasStorage = createDefaultStorage();
}

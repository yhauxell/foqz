import { create } from "zustand";

/** A board whose stored data could not be read. The data was kept, not overwritten. */
export interface UnreadableBoard {
  boardId: string;
  /** Where the original data was kept, for the recovery message. */
  keptAt: string | null;
}

interface StorageHealth {
  /** Why the last save failed, or null once a save succeeds. */
  saveError: string | null;
  lastSavedAt: number | null;
  unreadable: UnreadableBoard | null;
}

/** Save and load problems the UI should show instead of only logging. */
export const useStorageHealth = create<StorageHealth>(() => ({
  saveError: null,
  lastSavedAt: null,
  unreadable: null,
}));

export function reportSaveOk() {
  useStorageHealth.setState({ saveError: null, lastSavedAt: Date.now() });
}

export function reportSaveError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  console.warn("[storage] save failed:", message);
  useStorageHealth.setState({ saveError: message });
}

export function reportUnreadable(board: UnreadableBoard) {
  useStorageHealth.setState({ unreadable: board });
}

export function dismissUnreadable() {
  useStorageHealth.setState({ unreadable: null });
}

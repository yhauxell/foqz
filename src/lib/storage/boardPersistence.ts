import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { getCanvasStorage } from "@/lib/storage";
import { nextBoardSnapshot } from "@/lib/storage/snapshot";
import { reportSaveError } from "@/lib/storage/health";

/** Save the active board as it is in the store right now. */
export function saveActiveBoardNow(): void {
  try {
    const { nodes, edges, annotations, activeBoardId } = useFlowCanvasStore.getState();
    const storage = getCanvasStorage();
    storage.saveBoardSync(
      activeBoardId,
      nextBoardSnapshot({ nodes, edges, annotations, previous: storage.loadBoardSync(activeBoardId) }),
    );
  } catch (err) {
    reportSaveError(err);
  }
}

/** Save the active board and wait until it is written (on quit, or from the retry button). */
export async function flushActiveBoard(): Promise<void> {
  saveActiveBoardNow();
  await getCanvasStorage().whenIdle();
}

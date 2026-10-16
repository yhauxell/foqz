import { useEffect } from "react";
import { create } from "zustand";
import {
  onPocketBaseAuthChange,
  pocketBaseClient,
  POCKETBASE_URL_EVENT,
  readCloudSession,
} from "@/lib/pocketbase/client";
import { CLOUD_SAVE_DEBOUNCE_MS } from "@/lib/pocketbase/constants";
import { boardFingerprint } from "@/lib/storage/fingerprint";
import { getCanvasStorage } from "@/lib/storage";
import {
  createCloudSyncEngine,
  type CloudPhase,
  type CloudSyncEngine,
} from "@/lib/storage/cloudSyncEngine";
import { PocketBaseStorageAdapter } from "@/lib/storage/PocketBaseStorageAdapter";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import type { BoardMeta, BoardSnapshot } from "@/types/storage";

export type { CloudPhase };

interface CloudSyncState {
  phase: CloudPhase;
  detail: string | null;
  email: string | null;
}

export const useCloudSyncStatus = create<CloudSyncState>(() => ({
  phase: "signed-out",
  detail: null,
  email: null,
}));

let activeEngine: CloudSyncEngine | null = null;

export function requestCloudFlush(): void {
  void activeEngine?.flush();
}

export function requestCloudReconcile(options?: { preferRemote?: boolean }): void {
  void activeEngine?.reconcile(options);
}

function publishStatus(phase: CloudPhase, detail: string | null): void {
  useCloudSyncStatus.setState({
    phase,
    detail,
    email: readCloudSession().email,
  });
}

function applyToCanvas(boardId: string, snapshot: BoardSnapshot): void {
  getCanvasStorage().saveBoardSync(boardId, snapshot, { notify: false });
  useFlowCanvasStore.getState().applyRemoteBoard(boardId, snapshot);
}

function replaceLocalCatalog(boards: BoardMeta[]): void {
  getCanvasStorage().saveBoardCatalogSync(boards, { notify: false });
  useFlowCanvasStore.setState({ boards });
}

function removeLocalBoard(boardId: string): void {
  const store = useFlowCanvasStore.getState();
  const boards = store.boards.filter((board) => board.id !== boardId);
  if (boards.length === store.boards.length || boards.length === 0) return;
  const storage = getCanvasStorage();
  if (store.activeBoardId === boardId) {
    const next = boards[0];
    const snap = storage.loadBoardSync(next.id);
    storage.setActiveBoardIdSync(next.id, next.name);
    useFlowCanvasStore.setState({
      activeBoardId: next.id,
      boards,
      nodes: snap?.nodes ?? [],
      edges: snap?.edges ?? [],
      annotations: snap?.annotations ?? {},
      selectedNodeId: null,
      activeAnnotationId: null,
    });
  } else {
    useFlowCanvasStore.setState({ boards });
  }
  storage.deleteBoardSync(boardId, { notify: false });
  storage.saveBoardCatalogSync(boards, { notify: false });
}

export function startCloudSync(): () => void {
  const adapter = new PocketBaseStorageAdapter(() => pocketBaseClient());
  const engine = createCloudSyncEngine({
    debounceMs: CLOUD_SAVE_DEBOUNCE_MS,
    isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine),
    isAuthenticated: () => Boolean(readCloudSession().userId),
    saveBoard: (boardId, snapshot, name) => adapter.saveBoard(boardId, snapshot, name),
    deleteBoard: (boardId) => adapter.deleteBoard(boardId),
    saveCatalog: (boards) => adapter.saveBoardCatalog(boards),
    listRemote: () => adapter.listBoards(),
    loadRemote: (boardId) => adapter.loadBoard(boardId),
    acknowledge: (boardId, revision) => adapter.acknowledge(boardId, revision),
    subscribeRemote: (handler) => adapter.subscribeChanges(handler),
    readLocalSnapshot: (boardId) => getCanvasStorage().loadBoardSync(boardId),
    listLocalBoards: () => useFlowCanvasStore.getState().boards,
    boardName: (boardId) =>
      useFlowCanvasStore.getState().boards.find((board) => board.id === boardId)?.name,
    memoryFingerprint: (boardId) => {
      const state = useFlowCanvasStore.getState();
      if (state.activeBoardId !== boardId) return null;
      return boardFingerprint({
        nodes: state.nodes,
        edges: state.edges,
        annotations: state.annotations,
      });
    },
    applyToCanvas,
    replaceLocalCatalog,
    removeLocalBoard,
    onStatus: publishStatus,
  });
  activeEngine = engine;

  const unsubscribeMutations = getCanvasStorage().subscribeMutations((event) => {
    engine.noteMutation(event);
  });
  const unsubscribeAuth = onPocketBaseAuthChange((session) => {
    useCloudSyncStatus.setState({ email: session.email });
    if (!session.userId) adapter.resetSession();
    engine.handleAuthChanged();
  });
  const onOnline = () => engine.handleOnline();
  const onOffline = () => engine.handleOffline();
  const onUrl = () => {
    adapter.resetSession();
    engine.handleAuthChanged();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener(POCKETBASE_URL_EVENT, onUrl);
  engine.start();

  return () => {
    engine.stop();
    unsubscribeMutations();
    unsubscribeAuth();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener(POCKETBASE_URL_EVENT, onUrl);
    adapter.resetSession();
    if (activeEngine === engine) activeEngine = null;
  };
}

export function useCloudSync(): void {
  useEffect(() => startCloudSync(), []);
}

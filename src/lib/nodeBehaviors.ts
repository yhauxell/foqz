import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { getCachedAppSettings } from "@/lib/appSettingsCache";
import {
  convertTextStyle,
  isActionable,
  isDone,
  isTextNode,
  type TextStyle,
} from "@/lib/nodePredicates";

export * from "@/lib/nodePredicates";

/** Store-backed actions for the text behaviors defined in nodePredicates. */

export function setTextStyle(nodeId: string, style: TextStyle): void {
  const store = useFlowCanvasStore.getState();
  store.setNodes((nodes) =>
    nodes.map((n) => (n.id === nodeId ? convertTextStyle(n, style) : n))
  );
}

/** Turn a plain or sticky text into a to-do (or back). Cards are always actionable. */
export function toggleActionable(nodeId: string): boolean {
  const store = useFlowCanvasStore.getState();
  const node = store.nodes.find((n) => n.id === nodeId);
  if (!node || !isTextNode(node) || node.type === "focusTask") return false;
  const actionable = (node.data as any)?.actionable === true;
  if (actionable) {
    if (store.activeFocusNodeId === nodeId) stopFocus();
    store.updateNodeData(nodeId, { actionable: false, status: undefined });
  } else {
    store.updateNodeData(nodeId, { actionable: true, status: "open" });
  }
  return true;
}

export function toggleDone(nodeId: string): void {
  const store = useFlowCanvasStore.getState();
  const node = store.nodes.find((n) => n.id === nodeId);
  if (!node || !isActionable(node)) return;
  store.updateNodeData(nodeId, { status: isDone(node) ? "open" : "done" });
}

export function defaultFocusSeconds(): number {
  const minutes = Number(getCachedAppSettings().defaultFocusMinutes) || 25;
  return Math.max(1, Math.round(minutes)) * 60;
}

/** Start focusing a node in place: the camera zooms to it and the rest of the board dims. */
export function startFocus(nodeId: string, minutes?: number): boolean {
  const store = useFlowCanvasStore.getState();
  const node = store.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  if (isTextNode(node) && !isActionable(node)) {
    store.updateNodeData(nodeId, { actionable: true, status: "open" });
  }
  store.setActiveFocusNodeId(nodeId, minutes ? minutes * 60 : undefined);
  window.dispatchEvent(
    new CustomEvent("foqz:flow-center-on", { detail: { id: nodeId, focus: true } })
  );
  return true;
}

export function stopFocus(): void {
  const store = useFlowCanvasStore.getState();
  store.setActiveFocusNodeId(null);
}

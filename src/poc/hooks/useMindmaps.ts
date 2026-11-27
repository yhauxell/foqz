import { useEffect } from "react";
import type { Node } from "@xyflow/react";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import {
  addChild,
  isMapNode,
  layoutSignature,
  makeMindmap,
  mindmapOf,
  neighbor,
  outdent,
  ROOT_FONT_SIZE,
  selectOnly,
  syncMindmaps,
  toggleCollapse,
} from "@/lib/mindmap/mindmap";

/** Applies the map layout without creating undo steps: the edit that caused it already did. */
export function runMindmapSync() {
  const s = useFlowCanvasStore.getState();
  const result = syncMindmaps(s.nodes, s.edges);
  if (!result) return;
  const history = useFlowCanvasStore.temporal.getState();
  const quiet = history.isTracking;
  if (quiet) history.pause();
  s.setNodes(result.nodes);
  s.setEdges(result.edges);
  if (quiet) history.resume();
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/**
 * Keeps mind maps laid out and wires their keyboard: Tab child, Shift+Tab outdent,
 * arrows to move around, `/` to fold, `M` to start a map. Enter on a selected node edits
 * it (TextNode); Enter while editing adds a sibling (TextNode).
 */
export function useMindmaps({ enabled, viewportCenter }: { enabled: boolean; viewportCenter: () => { x: number; y: number } }) {
  // Layout follows the tree, text sizes and the root's position.
  useEffect(() => {
    let frame = 0;
    let lastSig = "";
    let lastMapEdges = -1;
    const check = () => {
      const { nodes, edges } = useFlowCanvasStore.getState();
      const sig = layoutSignature(nodes);
      const mapEdges = edges.reduce((c, e) => c + ((e.data as any)?.mindmap ? 1 : 0), 0);
      if (sig === lastSig && mapEdges === lastMapEdges) return;
      lastSig = sig;
      lastMapEdges = mapEdges;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(runMindmapSync);
    };
    check();
    const unsub = useFlowCanvasStore.subscribe(check);
    return () => {
      unsub();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useFlowCanvasStore.getState();
      const selected = s.nodes.filter((n) => n.selected);
      const one: Node | undefined = selected.length === 1 ? selected[0] : undefined;

      if (e.key === "m" || e.key === "M") {
        if (e.shiftKey) return;
        if (one && one.type === "text" && !isMapNode(one)) {
          e.preventDefault();
          makeMindmap(one.id);
        } else if (selected.length === 0) {
          e.preventDefault();
          const pos = viewportCenter();
          const id = `text-${Date.now()}`;
          s.setNodes((nodes) => [
            ...nodes,
            {
              id,
              type: "text",
              position: { x: pos.x - 80, y: pos.y - 20 },
              selected: true,
              data: {
                text: "",
                isNew: true,
                autoEdit: true,
                fontSize: ROOT_FONT_SIZE,
                mindmap: { rootId: id, parentId: null, order: 0 },
              },
            },
          ]);
        }
        return;
      }

      if (!one || !isMapNode(one)) return;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "Tab") {
        stop();
        if (e.shiftKey) outdent(one.id);
        else addChild(one.id);
      } else if (e.key === "/") {
        stop();
        toggleCollapse(one.id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (e.shiftKey) return;
        stop(); // React Flow would nudge the node instead
        const next = neighbor(one.id, e.key);
        if (next) selectOnly(next);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, viewportCenter]);
}

/** True when `id` is the root of a map (its whole map moves with it). */
export function isMapRoot(id: string) {
  const n = useFlowCanvasStore.getState().nodes.find((x) => x.id === id);
  const m = mindmapOf(n);
  return !!m && m.parentId === null;
}

import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, useReactFlow, useStore, type NodeProps, type Node } from "@xyflow/react";
import { renderMarkdownBlock } from "@/lib/markdown";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { applyFormattingToTextarea } from "../utils/textFormatting";
import { TodoCheckbox } from "../components/TodoCheckbox";

export interface TextNodeData {
  text: string;
  fontSize?: number;
  color?: string;
  isNew?: boolean;
  autoEdit?: boolean;
  /** To-do behavior: shows a checkbox, can be focused, swept to the Logbook when done. */
  actionable?: boolean;
  status?: "open" | "done";
  [key: string]: unknown;
}

export type TextNodeType = Node<TextNodeData, "text">;

const MIN_WIDTH = 40;
const MIN_FONT = 10;
const MAX_FONT = 72;
/** Auto-width text wraps past this many ems, so a pasted paragraph doesn't become one endless line. */
const AUTO_MAX_WIDTH = "34em";

type ResizeEdge = "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Text sizes itself, like FigJam or tldraw: height always hugs the text. Width is
 * either automatic (no `style.width`) or fixed by dragging a side; corners scale the font.
 */
function setTextGeometry(id: string, geo: { x: number; y: number; width?: number | null; fontSize?: number }) {
  useFlowCanvasStore.getState().setNodes((nds) =>
    nds.map((n) => {
      if (n.id !== id) return n;
      // Width lives in style.width only (convertTextStyle reads it there); height is never stored.
      const { width: _w, height: _h, ...rest } = n;
      const style = { ...(n.style || {}) } as Record<string, unknown>;
      delete style.height;
      if (geo.width === null) delete style.width;
      else if (geo.width !== undefined) style.width = geo.width;
      return {
        ...rest,
        position: { x: geo.x, y: geo.y },
        style,
        data: geo.fontSize !== undefined ? { ...n.data, fontSize: geo.fontSize } : n.data,
      };
    })
  );
}

/** Run a drag as one undo step: history is paused while it runs and records start → end once. */
function beginHistoryGesture() {
  const before = useFlowCanvasStore.getState().nodes;
  useFlowCanvasStore.temporal.getState().pause();
  return () => {
    const store = useFlowCanvasStore.getState();
    const after = store.nodes;
    if (after !== before) store.setNodes(before);
    useFlowCanvasStore.temporal.getState().resume();
    if (after !== before) store.setNodes(after);
  };
}

const CONNECT_HANDLE_CLASS =
  "!w-3 !h-3 !min-w-0 !min-h-0 !bg-transparent !border-0 opacity-0 pointer-events-none group-hover/text:opacity-100 group-hover/text:pointer-events-auto transition-opacity cursor-crosshair after:content-[''] after:absolute after:inset-[2px] after:rounded-full after:bg-blue-500 after:ring-2 after:ring-white dark:after:ring-zinc-900";

function TextResizeHandles({ id, fontSize, fixedWidth }: { id: string; fontSize: number; fixedWidth?: number }) {
  const { getInternalNode, getViewport } = useReactFlow();
  // Handles keep the same size on screen at any zoom, like FigJam's.
  const handleScale = 1 / (useStore((s) => s.transform[2]) || 1);
  // Ends the drag in progress. If the handles unmount mid-drag (deselect, delete, reload),
  // no pointerup reaches them, and undo history would otherwise stay paused.
  const endActiveDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endActiveDrag.current?.(), []);

  const startResize = (e: React.PointerEvent<HTMLDivElement>, edge: ResizeEdge) => {
    const internal = getInternalNode(id);
    if (!internal || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const zoom = getViewport().zoom || 1;
    const startX = e.clientX;
    const pos = { ...internal.position };
    const w = internal.measured.width ?? 0;
    const h = internal.measured.height ?? 0;
    const fromLeft = edge.endsWith("left");
    const fromTop = edge.startsWith("top");
    const endHistory = beginHistoryGesture();

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const grow = fromLeft ? -dx : dx;
      if (edge === "left" || edge === "right") {
        // At least a few characters wide, so dragging a side never splits every word.
        const width = Math.max(MIN_WIDTH, Math.round(fontSize * 3 + 20), Math.round(w + grow));
        setTextGeometry(id, { x: fromLeft ? pos.x + w - width : pos.x, y: pos.y, width });
        return;
      }
      const font = Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(fontSize * ((w + grow) / (w || 1)))));
      const scale = font / fontSize;
      setTextGeometry(id, {
        x: fromLeft ? pos.x + w - w * scale : pos.x,
        y: fromTop ? pos.y + h - h * scale : pos.y,
        width: fixedWidth ? Math.round(fixedWidth * scale) : undefined,
        fontSize: font,
      });
    };
    const onEnd = () => {
      if (endActiveDrag.current !== onEnd) return;
      endActiveDrag.current = null;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onEnd);
      target.removeEventListener("pointercancel", onEnd);
      endHistory();
    };
    endActiveDrag.current = onEnd;
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
  };

  // Double-clicking a side handle goes back to automatic width, as in FigJam.
  const resetWidth = (e: React.MouseEvent) => {
    e.stopPropagation();
    const internal = getInternalNode(id);
    if (internal) setTextGeometry(id, { ...internal.position, width: null });
  };

  const corner = "absolute size-3.5 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center nodrag nopan z-10";
  const side = "absolute top-0 bottom-0 w-3 -translate-x-1/2 flex items-center justify-center cursor-ew-resize nodrag nopan z-10";
  const dot = <span className="size-2 rounded-[2px] bg-white border border-blue-500 shadow-sm" />;
  const pill = <span className="w-1 h-4 rounded-full bg-white border border-blue-500 shadow-sm" />;
  // Keep the click that ends a drag from reaching the node (it would re-select and add an undo step).
  const swallow = { onClick: (e: React.MouseEvent) => e.stopPropagation() };
  const cornerStyle = { scale: `${handleScale}` }; // a string: React would add "px" to a bare number
  const sideStyle = { scale: `${handleScale} 1` };
  return (
    <>
      <div data-resize="left" {...swallow} style={sideStyle} title="Drag to set width · double-click for auto width" className={`${side} left-0`} onPointerDown={(e) => startResize(e, "left")} onDoubleClick={resetWidth}>{pill}</div>
      <div data-resize="right" {...swallow} style={sideStyle} title="Drag to set width · double-click for auto width" className={`${side} left-full`} onPointerDown={(e) => startResize(e, "right")} onDoubleClick={resetWidth}>{pill}</div>
      <div data-resize="top-left" {...swallow} style={cornerStyle} className={`${corner} left-0 top-0 cursor-nwse-resize`} onPointerDown={(e) => startResize(e, "top-left")}>{dot}</div>
      <div data-resize="top-right" {...swallow} style={cornerStyle} className={`${corner} left-full top-0 cursor-nesw-resize`} onPointerDown={(e) => startResize(e, "top-right")}>{dot}</div>
      <div data-resize="bottom-left" {...swallow} style={cornerStyle} className={`${corner} left-0 top-full cursor-nesw-resize`} onPointerDown={(e) => startResize(e, "bottom-left")}>{dot}</div>
      <div data-resize="bottom-right" {...swallow} style={cornerStyle} className={`${corner} left-full top-full cursor-nwse-resize`} onPointerDown={(e) => startResize(e, "bottom-right")}>{dot}</div>
    </>
  );
}

export const TextNode = memo(function TextNode({
  id,
  data,
  selected,
}: NodeProps<TextNodeType>) {
  const [isEditing, setIsEditing] = useState(() => Boolean(data.isNew || data.autoEdit || !data.text));
  const [val, setVal] = useState(data.text || "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const valRef = useRef(val);
  const isFocusTarget = useFlowCanvasStore((s) => s.activeFocusNodeId === id);
  const actionable = data.actionable === true;
  const done = actionable && data.status === "done";
  const fontSize = Number(data.fontSize) || 16;
  // Width set by the user, never the measured one: feeding the measured size back made the box only grow.
  const fixedWidth = useStore((s) => {
    const n = s.nodeLookup.get(id);
    return Number(n?.width ?? n?.style?.width) || undefined;
  });
  const editingRef = useRef(isEditing);

  useEffect(() => {
    editingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    valRef.current = val;
  }, [val]);

  useEffect(() => {
    setVal(data.text || "");
  }, [data.text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      const timer = setTimeout(() => {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  // Tell the floating toolbar to show formatting controls while typing.
  useEffect(() => {
    const store = useFlowCanvasStore.getState();
    if (isEditing) store.setEditingNodeId(id);
    else if (store.editingNodeId === id) store.setEditingNodeId(null);
    return () => {
      if (useFlowCanvasStore.getState().editingNodeId === id) {
        useFlowCanvasStore.getState().setEditingNodeId(null);
      }
    };
  }, [isEditing, id]);

  // When selected but not editing, pressing Enter begins editing
  useEffect(() => {
    if (!selected || isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsEditing(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, isEditing]);

  const handleSave = useCallback(() => {
    // Escape, blur and deselect can all land here for the same edit; only the first one saves.
    if (!editingRef.current) return;
    editingRef.current = false;
    setIsEditing(false);
    const currentVal = valRef.current;
    if (!currentVal.trim() && data.isNew) {
      useFlowCanvasStore.getState().deleteNode(id);
      return;
    }
    useFlowCanvasStore.getState().updateNodeData(id, { text: currentVal, isNew: false, autoEdit: false });
  }, [id, data.isNew]);

  // Automatically parse and save when node is deselected while editing
  useEffect(() => {
    if (!selected && isEditing) {
      handleSave();
    }
  }, [selected, isEditing, handleSave]);

  // Capture global outside pointerdown to commit editing and parse markdown
  useEffect(() => {
    if (!isEditing) return;

    const handleOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (
        target.closest?.(".glass-panel") ||
        target.closest?.("[data-node-toolbar]") ||
        target.closest?.(".react-flow__node-toolbar")
      ) {
        return;
      }
      handleSave();
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [isEditing, handleSave]);

  return (
    <div
      ref={containerRef}
      className={`group/text relative p-2.5 rounded-xl transition-[background-color,box-shadow] ${
        isEditing ? "cursor-text" : "cursor-default"
      } ${
        isFocusTarget
          ? "ring-2 ring-rose-500 bg-white/80 dark:bg-zinc-900/80 shadow-lg shadow-rose-500/10"
          : selected
          ? "ring-1.5 ring-blue-500/70 bg-white/70 dark:bg-zinc-900/70 shadow-xs"
          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      } ${actionable ? "flex items-start gap-2" : ""}`}
      data-actionable={actionable || undefined}
      data-done={done || undefined}
      data-width-mode={fixedWidth ? "fixed" : "auto"}
      style={{
        contain: "layout style",
        fontSize,
        width: fixedWidth ? "100%" : "max-content",
        minWidth: MIN_WIDTH,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {selected && <TextResizeHandles id={id} fontSize={fontSize} fixedWidth={fixedWidth} />}

      {/* Connection points sit just outside the box and show on hover, so they never block resizing. */}
      <Handle type="source" id="top" position={Position.Top} className={`${CONNECT_HANDLE_CLASS} !top-[-12px]`} />
      <Handle type="source" id="right" position={Position.Right} className={`${CONNECT_HANDLE_CLASS} !right-[-12px]`} />
      <Handle type="source" id="bottom" position={Position.Bottom} className={`${CONNECT_HANDLE_CLASS} !bottom-[-12px]`} />
      <Handle type="source" id="left" position={Position.Left} className={`${CONNECT_HANDLE_CLASS} !left-[-12px]`} />

      {actionable && (
        <TodoCheckbox
          nodeId={id}
          done={done}
          size={Math.max(14, Math.round(fontSize * 0.95))}
          style={{ marginTop: Math.round(fontSize * 0.22) }}
        />
      )}

      {isEditing ? (
        <textarea
          ref={textareaRef}
          id={`text-node-input-${id}`}
          value={val}
          rows={1}
          placeholder="Type something in markdown..."
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            e.stopPropagation();
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              // Escape keeps what you typed and leaves the text selected, like every canvas tool.
              e.preventDefault();
              handleSave();
            } else if ((e.key === "Backspace" || e.key === "Delete") && !val) {
              e.preventDefault();
              editingRef.current = false; // the blur on unmount must not save into a deleted node
              useFlowCanvasStore.getState().deleteNode(id);
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
              e.preventDefault();
              const updated = applyFormattingToTextarea(e.currentTarget, "bold");
              setVal(updated);
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
              e.preventDefault();
              const updated = applyFormattingToTextarea(e.currentTarget, "italic");
              setVal(updated);
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "u") {
              e.preventDefault();
              const updated = applyFormattingToTextarea(e.currentTarget, "underline");
              setVal(updated);
            } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "x") {
              e.preventDefault();
              const updated = applyFormattingToTextarea(e.currentTarget, "strike");
              setVal(updated);
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              const updated = applyFormattingToTextarea(e.currentTarget, "link");
              setVal(updated);
            }
          }}
          className={`${fixedWidth ? "w-full flex-1 min-w-0" : ""} block bg-transparent outline-none resize-none overflow-hidden p-0 m-0 border-none shadow-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400/80 dark:placeholder:text-zinc-500/80 leading-relaxed font-sans`}
          style={{
            // Grows with the text in both directions; replaces the old scrollHeight measuring.
            fieldSizing: "content",
            maxWidth: fixedWidth ? undefined : AUTO_MAX_WIDTH,
            fontSize,
            color: data.color,
            fontFamily: "'Shantell Sans', cursive, sans-serif",
            lineHeight: 1.45,
          }}
        />
      ) : (
        <div
          className={`break-words select-text min-w-0 flex-1 ${
            !val ? "text-zinc-400/80 dark:text-zinc-500/80 italic select-none" : "text-zinc-900 dark:text-zinc-100"
          } ${done ? "line-through opacity-50" : ""} task-markdown-body leading-relaxed`}
          style={{
            maxWidth: fixedWidth ? undefined : AUTO_MAX_WIDTH,
            fontSize,
            color: data.color,
            fontFamily: "'Shantell Sans', cursive, sans-serif",
            lineHeight: 1.45,
          }}
          dangerouslySetInnerHTML={{
            __html: renderMarkdownBlock(val || "Type something..."),
          }}
        />
      )}
    </div>
  );
});

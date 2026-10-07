import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { renderMarkdownInline } from "@/lib/markdown";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export interface CircleNodeData {
  label?: string;
  color?: string;
  strokeColor?: string;
  roughness?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  fillStyle?: "hachure" | "solid" | "none";
  [key: string]: unknown;
}

export type CircleNodeType = Node<CircleNodeData, "circle">;

export const CircleNode = memo(function CircleNode({
  id,
  data,
  selected,
  width = 160,
  height = 160,
}: NodeProps<CircleNodeType>) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(data.label || "Double-click to write");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const valRef = useRef(val);

  useEffect(() => {
    valRef.current = val;
  }, [val]);

  useEffect(() => {
    setVal(data.label || "Double-click to write");
  }, [data.label]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    useFlowCanvasStore.getState().updateNodeData(id, { label: valRef.current });
  }, [id]);

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

  const w = Math.max(80, width);
  const h = Math.max(80, height);
  const stroke = data.strokeColor || "#6366f1";
  const fill = data.color || "rgba(99, 102, 241, 0.08)";
  const fillStyle = data.fillStyle || "hachure";

  React.useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const fragment = document.createDocumentFragment();

    const rc = rough.svg(svg);
    const borderStyle = data.borderStyle || "solid";
    let dashArray: number[] | undefined;
    if (borderStyle === "dashed") dashArray = [6, 4];
    else if (borderStyle === "dotted") dashArray = [2, 4];

    const nodeSeed =
      Math.abs(
        id.split("").reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)
      ) || 1;

    const cx = w / 2;
    const cy = h / 2;

    const fillOptions =
      fillStyle === "none"
        ? {}
        : {
            fill,
            fillStyle: fillStyle === "solid" ? "solid" : "hachure",
            fillWeight: 1,
            hachureGap: 6,
          };

    const node = rc.ellipse(cx, cy, w - 6, h - 6, {
      seed: nodeSeed,
      roughness: data.roughness ?? 1.8,
      stroke,
      strokeWidth: 2,
      strokeLineDash: dashArray,
      ...fillOptions,
    });
    fragment.appendChild(node);
    svg.replaceChildren(fragment);
  }, [id, w, h, stroke, fill, fillStyle, data.roughness, data.borderStyle]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center select-none ${
        selected ? "ring-2 ring-indigo-500/80 rounded-full" : ""
      }`}
      style={{ contain: "layout style" }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <NodeResizer minWidth={80} minHeight={80} isVisible={selected} />

      {/* 4 Multi-Directional Handles on all sides */}
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-indigo-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-indigo-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-indigo-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-indigo-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />

      {/* Rough.js Hand-drawn sketch SVG */}
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {/* Editable Text Label */}
      <div className="relative z-10 px-4 py-2 w-full text-center flex items-center justify-center h-full">
        {isEditing ? (
          <textarea
            value={val}
            autoFocus
            rows={1}
            onChange={(e) => {
              setVal(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setVal(data.label || "");
                setIsEditing(false);
              }
            }}
            className="w-full bg-transparent outline-none resize-none overflow-hidden p-0 m-0 border-none text-center font-medium text-zinc-900 dark:text-zinc-100 shadow-none focus:ring-0"
            style={{
              fontFamily: "'Shantell Sans', cursive, sans-serif",
              fontSize: 16,
              lineHeight: 1.4,
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200 break-words cursor-text select-text task-markdown-body"
            style={{
              fontFamily: "'Shantell Sans', cursive, sans-serif",
              fontSize: 16,
              lineHeight: 1.4,
            }}
            title="Double-click to edit text"
            dangerouslySetInnerHTML={{
              __html: renderMarkdownInline(data.label || val || ""),
            }}
          />
        )}
      </div>
    </div>
  );
});

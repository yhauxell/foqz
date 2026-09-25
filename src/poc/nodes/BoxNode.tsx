import React, { memo, useState } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export interface BoxNodeData {
  label?: string;
  color?: string;
  strokeColor?: string;
  roughness?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  [key: string]: unknown;
}

export type BoxNodeType = Node<BoxNodeData, "box">;

export const BoxNode = memo(function BoxNode({
  id,
  data,
  selected,
  width = 220,
  height = 140,
}: NodeProps<BoxNodeType>) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(data.label || "Double-click to write");
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const w = Math.max(60, width);
  const h = Math.max(40, height);
  const stroke = data.strokeColor || "#3b82f6";
  const fill = data.color || "rgba(59, 130, 246, 0.08)";

  React.useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rc = rough.svg(svg);
    const borderStyle = data.borderStyle || "solid";
    let dashArray: number[] | undefined;
    if (borderStyle === "dashed") dashArray = [6, 4];
    else if (borderStyle === "dotted") dashArray = [2, 4];

    const node = rc.rectangle(3, 3, w - 6, h - 6, {
      roughness: data.roughness ?? 1.8,
      stroke,
      strokeWidth: 2,
      strokeLineDash: dashArray,
      fill,
      fillStyle: "hachure",
      fillWeight: 1,
      hachureGap: 6,
    });
    svg.appendChild(node);
  }, [w, h, stroke, fill, data.roughness, data.borderStyle]);

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center select-none ${
        selected ? "ring-2 ring-blue-500/80 rounded-xl" : ""
      }`}
      style={{ contain: "layout style" }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <NodeResizer minWidth={80} minHeight={40} isVisible={selected} />

      {/* Target & Source Handles for Connecting to other Shapes / Tasks */}
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-zinc-400" />
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-zinc-400" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-zinc-400" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-zinc-400" />

      {/* Rough.js Hand-drawn sketch SVG */}
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {/* Editable Text Label */}
      <div className="relative z-10 px-4 py-2 w-full text-center">
        {isEditing ? (
          <input
            type="text"
            value={val}
            autoFocus
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              setIsEditing(false);
              data.label = val;
              useFlowCanvasStore.getState().updateNodeData(id, { label: val });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setIsEditing(false);
                data.label = val;
                useFlowCanvasStore.getState().updateNodeData(id, { label: val });
              }
            }}
            className="w-full bg-transparent border-b border-blue-500 outline-none text-center text-sm font-medium text-zinc-900 dark:text-zinc-100"
            style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
          />
        ) : (
          <span
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200 break-words"
            style={{ fontFamily: "'Shantell Sans', cursive, sans-serif", fontSize: 16 }}
          >
            {data.label || val}
          </span>
        )}
      </div>
    </div>
  );
});

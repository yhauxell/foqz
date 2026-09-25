import React, { memo, useEffect, useRef } from "react";
import { NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";

export interface HandDrawnRectNodeData {
  label?: string;
  color?: string;
  strokeColor?: string;
  roughness?: number;
  [key: string]: unknown;
}

export type HandDrawnRectNodeType = Node<HandDrawnRectNodeData, "handDrawnRect">;

export const HandDrawnRectNode = memo(function HandDrawnRectNode({
  data,
  selected,
  width = 200,
  height = 120,
}: NodeProps<HandDrawnRectNodeType>) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const w = Math.max(60, width);
  const h = Math.max(40, height);
  const stroke = data.strokeColor || "#3b82f6";
  const fill = data.color || "rgba(59, 130, 246, 0.08)";

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rc = rough.svg(svg);
    const node = rc.rectangle(3, 3, w - 6, h - 6, {
      roughness: data.roughness ?? 1.8,
      stroke,
      strokeWidth: 2,
      fill,
      fillStyle: "hachure",
      fillWeight: 1,
      hachureGap: 6,
    });
    svg.appendChild(node);
  }, [w, h, stroke, fill, data.roughness]);

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center select-none ${
        selected ? "ring-1 ring-blue-500/80 rounded-lg" : ""
      }`}
      style={{ contain: "layout style" }}
    >
      <NodeResizer minWidth={80} minHeight={40} isVisible={selected} />
      
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible pointer-events-none"
      />

      {data.label && (
        <span
          className="relative z-10 px-3 text-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
          style={{ fontFamily: "'Shantell Sans', cursive, sans-serif", fontSize: 16 }}
        >
          {data.label}
        </span>
      )}
    </div>
  );
});

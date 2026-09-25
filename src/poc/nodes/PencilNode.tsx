import React, { memo } from "react";
import { type NodeProps, type Node } from "@xyflow/react";

export interface PencilNodeData {
  points: { x: number; y: number }[];
  color?: string;
  strokeWidth?: number;
  [key: string]: unknown;
}

export type PencilNodeType = Node<PencilNodeData, "pencil">;

function pointsToSvgPath(points: { x: number; y: number }[]) {
  if (!points || points.length === 0) return "";
  const d = points.reduce((acc, pt, i) => {
    return `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`;
  }, "");
  return d;
}

export const PencilNode = memo(function PencilNode({
  data,
  selected,
}: NodeProps<PencilNodeType>) {
  const points = data.points || [];
  if (points.length === 0) return null;

  // Calculate bounding box
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padding = 4;
  const width = Math.max(10, maxX - minX + padding * 2);
  const height = Math.max(10, maxY - minY + padding * 2);

  // Normalize path relative to SVG box
  const normalizedPath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${(p.x - minX + padding).toFixed(1)} ${(
          p.y - minY + padding
        ).toFixed(1)}`
    )
    .join(" ");

  return (
    <div
      className={`relative select-none ${
        selected ? "ring-1 ring-blue-500/80 rounded" : ""
      }`}
      style={{ width, height }}
    >
      <svg
        width={width}
        height={height}
        className="overflow-visible pointer-events-none"
      >
        <path
          d={normalizedPath}
          fill="none"
          stroke={data.color || "#ef4444"}
          strokeWidth={data.strokeWidth || 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

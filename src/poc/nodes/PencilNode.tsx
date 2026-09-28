import React, { memo, useMemo } from "react";
import { type NodeProps, type Node } from "@xyflow/react";
import getStroke from "perfect-freehand";

export interface PencilNodeData {
  points: { x: number; y: number }[];
  color?: string;
  size?: number;
  [key: string]: unknown;
}

export type PencilNodeType = Node<PencilNodeData, "pencil">;

function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      return `${acc} ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
    },
    `M ${stroke[0][0]},${stroke[0][1]} Q`
  );
  return d;
}

export const PencilNode = memo(function PencilNode({
  data,
  selected,
}: NodeProps<PencilNodeType>) {
  const { width, height, pathData } = useMemo(() => {
    const rawPoints = data.points || [];
    if (rawPoints.length === 0) {
      return { width: 0, height: 0, pathData: "" };
    }

    // Calculate bounding box
    const xs = rawPoints.map((p) => p.x);
    const ys = rawPoints.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 12;
    const w = Math.max(20, maxX - minX + padding * 2);
    const h = Math.max(20, maxY - minY + padding * 2);

    // Normalize points relative to container
    const localPoints = rawPoints.map((p) => [
      p.x - minX + padding,
      p.y - minY + padding,
    ]);

    // Generate pressure-sensitive smooth stroke path via perfect-freehand
    const stroke = getStroke(localPoints, {
      size: data.size || 6,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    });

    return {
      width: w,
      height: h,
      pathData: getSvgPathFromStroke(stroke),
    };
  }, [data.points, data.size]);

  if (!pathData) return null;

  return (
    <div
      className={`relative select-none ${
        selected ? "ring-1 ring-blue-500/80 rounded" : ""
      }`}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ width, height }}
    >
      <svg
        width={width}
        height={height}
        className="overflow-visible pointer-events-none"
      >
        <path
          d={pathData}
          fill={data.color || "#ef4444"}
          stroke={data.color || "#ef4444"}
          strokeWidth={0.5}
        />
      </svg>
    </div>
  );
});

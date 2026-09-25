import React, { memo } from "react";
import { NodeResizer, type NodeProps, type Node } from "@xyflow/react";

export interface RectangleNodeData {
  label?: string;
  color?: string;
  strokeColor?: string;
  [key: string]: unknown;
}

export type RectangleNodeType = Node<RectangleNodeData, "rectangle">;

export const RectangleNode = memo(function RectangleNode({
  data,
  selected,
}: NodeProps<RectangleNodeType>) {
  const bg = data.color || "rgba(239, 246, 255, 0.7)";
  const stroke = data.strokeColor || "#3b82f6";

  return (
    <div
      className={`relative w-full h-full min-w-[100px] min-h-[60px] rounded-lg border-2 transition-all flex items-center justify-center p-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 ${
        selected ? "ring-2 ring-blue-500 shadow-md" : ""
      }`}
      style={{
        backgroundColor: bg,
        borderColor: stroke,
        contain: "layout style",
      }}
    >
      <NodeResizer minWidth={80} minHeight={40} isVisible={selected} />
      <span>{data.label || ""}</span>
    </div>
  );
});

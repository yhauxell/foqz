import { memo } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { CanvasIcon } from "@/components/CanvasIcon";
import type { IconRef } from "@/lib/icons";

export interface IconNodeData {
  icon: IconRef;
  color?: string;
  [key: string]: unknown;
}
export type IconNodeType = Node<IconNodeData, "icon">;

const HANDLE =
  "!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 !border !border-white dark:!border-zinc-800 opacity-0 group-hover/icon:opacity-100 transition-opacity";

/** A standalone icon on the canvas: resizable (keeps its square), colorable, connectable. */
export const IconNode = memo(function IconNode({ data, selected, width, height }: NodeProps<IconNodeType>) {
  const size = Math.max(16, Math.min(Number(width) || 64, Number(height) || 64));
  return (
    <div
      className={`group/icon relative w-full h-full flex items-center justify-center rounded-lg ${
        selected ? "ring-2 ring-blue-500/80" : ""
      }`}
      style={{ color: data.color || "#3f3f46" }}
    >
      <NodeResizer minWidth={24} minHeight={24} keepAspectRatio isVisible={selected} />
      <Handle type="source" id="top" position={Position.Top} className={HANDLE} />
      <Handle type="source" id="right" position={Position.Right} className={HANDLE} />
      <Handle type="source" id="bottom" position={Position.Bottom} className={HANDLE} />
      <Handle type="source" id="left" position={Position.Left} className={HANDLE} />
      <CanvasIcon icon={data.icon} size={size * 0.86} strokeWidth={1.75} className="dark:text-zinc-200" />
    </div>
  );
});

import React, { memo } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { Trash2 } from "lucide-react";

export interface ImageNodeData {
  src: string;
  alt?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  [key: string]: unknown;
}

export type ImageNodeType = Node<ImageNodeData, "image">;

export const ImageNode = memo(function ImageNode({
  id,
  data,
  selected,
  width = 320,
  height = 240,
}: NodeProps<ImageNodeType>) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    useFlowCanvasStore.getState().deleteNode(id);
  };

  return (
    <div
      className={`group relative rounded-xl overflow-hidden transition-all duration-150 select-none ${
        selected
          ? "ring-2 ring-blue-500 shadow-xl"
          : "hover:ring-1 hover:ring-zinc-400/50 shadow-md"
      } bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80`}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 80,
        minHeight: 60,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={60}
        handleClassName="!size-2.5 !bg-blue-500 !border-2 !border-white dark:!border-zinc-900 !rounded-full"
        lineClassName="!border-blue-500/70"
      />

      {/* 4 Handles for canvas connections */}
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />

      {/* Image Content */}
      <img
        src={data.src}
        alt={data.alt || "Canvas Image"}
        className="w-full h-full object-contain pointer-events-none rounded-xl"
        draggable={false}
      />

      {/* Hover action toolbar */}
      {selected && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10 bg-black/60 backdrop-blur-xs rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleDelete}
            title="Delete Image"
            className="p-1 rounded text-white/80 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});

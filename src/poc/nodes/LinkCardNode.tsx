import React, { memo } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { ExternalLink, Globe, Trash2 } from "lucide-react";

export interface LinkCardNodeData {
  url: string;
  title?: string;
  description?: string;
  image?: string | null;
  siteName?: string;
  [key: string]: unknown;
}

export type LinkCardNodeType = Node<LinkCardNodeData, "linkCard">;

export const LinkCardNode = memo(function LinkCardNode({
  id,
  data,
  selected,
  width = 320,
  height = 190,
}: NodeProps<LinkCardNodeType>) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    useFlowCanvasStore.getState().deleteNode(id);
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.focusStore?.openExternal) {
      void window.focusStore.openExternal(data.url);
    } else {
      window.open(data.url, "_blank", "noopener,noreferrer");
    }
  };

  const domain = (() => {
    try {
      return new URL(data.url).hostname.replace(/^www\./, "");
    } catch {
      return data.url;
    }
  })();

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden transition-all duration-150 select-none ${
        selected
          ? "ring-2 ring-blue-500 shadow-xl"
          : "hover:ring-1 hover:ring-zinc-400/50 shadow-md"
      } bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 flex flex-col justify-between`}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 240,
        minHeight: 140,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={140}
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

      {/* Floating Action Controls on Hover/Select */}
      {(selected || false) && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpen}
            className="p-1 rounded-full bg-black/60 hover:bg-blue-600 text-white backdrop-blur-xs transition-colors cursor-pointer"
            title="Open link in browser"
          >
            <ExternalLink className="size-3" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 rounded-full bg-black/60 hover:bg-rose-600 text-white backdrop-blur-xs transition-colors cursor-pointer"
            title="Delete link card"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}

      {/* Top Banner OG Image if available */}
      {data.image && (
        <div className="w-full h-28 relative overflow-hidden bg-zinc-100 dark:bg-zinc-950 shrink-0">
          <img
            src={data.image}
            alt={data.title || "Preview image"}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Content Details */}
      <div className="p-3 flex-1 flex flex-col justify-between min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 mb-1">
            <Globe className="size-2.5 shrink-0 text-blue-500" />
            <span className="truncate">{data.siteName || domain}</span>
          </div>

          <h4
            className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            onClick={handleOpen}
            title={data.title || data.url}
          >
            {data.title || data.url}
          </h4>

          {data.description && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1 leading-normal">
              {data.description}
            </p>
          )}
        </div>

        <div className="pt-2 mt-1 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
          <span className="text-[9px] font-mono text-zinc-400 truncate max-w-[180px]">
            {domain}
          </span>
          <button
            type="button"
            onClick={handleOpen}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <span>Visit</span>
            <ExternalLink className="size-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

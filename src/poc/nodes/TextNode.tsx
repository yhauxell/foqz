import React, { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { renderMarkdownInline, renderMarkdownBlock } from "@/lib/markdown";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export interface TextNodeData {
  text: string;
  fontSize?: number;
  color?: string;
  isNew?: boolean;
  autoEdit?: boolean;
  [key: string]: unknown;
}

export type TextNodeType = Node<TextNodeData, "text">;

export const TextNode = memo(function TextNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<TextNodeType>) {
  const [isEditing, setIsEditing] = useState(() => Boolean(data.isNew || data.autoEdit || !data.text));
  const [val, setVal] = useState(data.text || "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setVal(data.text || "");
  }, [data.text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = `${Math.max(32, el.scrollHeight)}px`;
      const timer = setTimeout(() => {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

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

  const handleSave = () => {
    setIsEditing(false);
    if (!val.trim() && data.isNew) {
      useFlowCanvasStore.getState().deleteNode(id);
      return;
    }
    useFlowCanvasStore.getState().updateNodeData(id, { text: val, isNew: false, autoEdit: false });
  };

  const isMultiline = val.includes("\n");

  return (
    <div
      className={`relative min-w-[120px] p-2.5 rounded-xl transition-all ${
        isEditing ? "cursor-text" : "cursor-default"
      } ${
        selected
          ? "ring-1.5 ring-blue-500/70 bg-white/70 dark:bg-zinc-900/70 shadow-xs"
          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      }`}
      style={{
        contain: "layout style",
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <NodeResizer minWidth={120} minHeight={36} isVisible={selected} />

      {/* 4 Multi-Directional Handles on all sides */}
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-blue-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={val}
          rows={1}
          placeholder="Type something in markdown..."
          onChange={(e) => {
            setVal(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.max(32, e.target.scrollHeight)}px`;
          }}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setVal(data.text || "");
              setIsEditing(false);
            } else if ((e.key === "Backspace" || e.key === "Delete") && !val) {
              e.preventDefault();
              useFlowCanvasStore.getState().deleteNode(id);
            }
          }}
          className="w-full h-full min-w-[120px] bg-transparent outline-none resize-none overflow-auto p-0 m-0 border-none shadow-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400/80 dark:placeholder:text-zinc-500/80 leading-relaxed font-sans"
          style={{
            fontSize: data.fontSize || 16,
            color: data.color,
            fontFamily: "'Shantell Sans', cursive, sans-serif",
            lineHeight: 1.45,
          }}
        />
      ) : (
        <div
          className={`break-words select-text ${
            !val ? "text-zinc-400/80 dark:text-zinc-500/80 italic select-none" : "text-zinc-900 dark:text-zinc-100"
          } task-markdown-body leading-relaxed`}
          style={{
            fontSize: data.fontSize || 16,
            color: data.color,
            fontFamily: "'Shantell Sans', cursive, sans-serif",
            lineHeight: 1.45,
          }}
          dangerouslySetInnerHTML={{
            __html: isMultiline
              ? renderMarkdownBlock(val || "Type something...")
              : renderMarkdownInline(val || "Type something..."),
          }}
        />
      )}
    </div>
  );
});

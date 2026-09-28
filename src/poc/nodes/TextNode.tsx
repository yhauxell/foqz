import React, { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { renderMarkdownInline } from "@/lib/markdown";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export interface TextNodeData {
  text: string;
  fontSize?: number;
  color?: string;
  [key: string]: unknown;
}

export type TextNodeType = Node<TextNodeData, "text">;

export const TextNode = memo(function TextNode({
  id,
  data,
  selected,
}: NodeProps<TextNodeType>) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(data.text || "Type something...");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setVal(data.text || "");
  }, [data.text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    useFlowCanvasStore.getState().updateNodeData(id, { text: val });
  };

  return (
    <div
      className={`relative min-w-[60px] max-w-[400px] p-1.5 rounded transition-all select-none cursor-text ${
        selected ? "ring-1 ring-blue-500/60" : ""
      }`}
      style={{ contain: "layout style" }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
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
              setVal(data.text || "");
              setIsEditing(false);
            }
          }}
          className="w-full bg-transparent outline-none resize-none overflow-hidden p-0 m-0 border-none shadow-none focus:ring-0 text-zinc-900 dark:text-zinc-100"
          style={{
            fontSize: data.fontSize || 16,
            color: data.color,
            fontFamily: "'Shantell Sans', cursive, sans-serif",
            lineHeight: 1.35,
          }}
        />
      ) : (
        <span
          className="text-zinc-900 dark:text-zinc-100 break-words block"
          style={{
            fontSize: data.fontSize || 16,
            color: data.color,
            fontFamily: "'Shantell Sans', cursive, sans-serif",
            lineHeight: 1.35,
          }}
          dangerouslySetInnerHTML={{
            __html: renderMarkdownInline(val || "Double click to edit"),
          }}
        />
      )}
    </div>
  );
});

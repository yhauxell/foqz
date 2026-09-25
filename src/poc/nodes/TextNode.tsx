import React, { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { renderMarkdownInline } from "@/lib/markdown";

export interface TextNodeData {
  text: string;
  fontSize?: number;
  color?: string;
  [key: string]: unknown;
}

export type TextNodeType = Node<TextNodeData, "text">;

export const TextNode = memo(function TextNode({
  data,
  selected,
}: NodeProps<TextNodeType>) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(data.text || "Type something...");

  return (
    <div
      className={`relative min-w-[60px] p-1.5 rounded transition-all select-none cursor-text ${
        selected ? "ring-1 ring-blue-500/60" : ""
      }`}
      onDoubleClick={() => setIsEditing(true)}
    >
      {/* Handles for connecting text notes to tasks and boxes */}
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-400" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-400" />

      {isEditing ? (
        <input
          type="text"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            data.text = val;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setIsEditing(false);
              data.text = val;
            }
          }}
          className="bg-transparent border-b border-blue-500 outline-none text-zinc-900 dark:text-zinc-100 min-w-[120px]"
          style={{
            fontSize: data.fontSize || 16,
            fontFamily: "'Shantell Sans', cursive, sans-serif",
          }}
        />
      ) : (
        <span
          className="text-zinc-900 dark:text-zinc-100 break-words"
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

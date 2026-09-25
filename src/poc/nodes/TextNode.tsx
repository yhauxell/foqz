import React, { memo, useState } from "react";
import { type NodeProps, type Node } from "@xyflow/react";
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
  id,
}: NodeProps<TextNodeType>) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(data.text || "Text label");

  return (
    <div
      className={`relative min-w-[60px] p-1 rounded transition-all select-none ${
        selected ? "ring-1 ring-blue-500/60" : ""
      }`}
      onDoubleClick={() => setIsEditing(true)}
    >
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
          className="bg-transparent border-b border-blue-500 outline-none text-xs font-sans text-zinc-900 dark:text-zinc-100 min-w-[80px]"
        />
      ) : (
        <span
          className="text-zinc-900 dark:text-zinc-100 break-words"
          style={{
            fontSize: data.fontSize || 22,
            color: data.color,
            fontFamily: "'Caveat', cursive, sans-serif",
            lineHeight: 1.2,
          }}
          dangerouslySetInnerHTML={{
            __html: renderMarkdownInline(val || "Double click to edit text"),
          }}
        />
      )}
    </div>
  );
});

import React, { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import {
  Note,
  NoteHeader,
  NoteTitle,
  NoteContent,
  type NoteVariant,
  type NoteCorner,
  type FoldPosition,
  type NotePattern,
} from "@/components/ui/note";
import { renderMarkdownInline } from "@/lib/markdown";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export interface NoteNodeData {
  title?: string;
  text?: string;
  variant?: NoteVariant;
  color?: string;
  bg?: string;
  corner?: NoteCorner;
  foldPosition?: FoldPosition;
  noise?: boolean;
  noiseIntensity?: "subtle" | "medium" | "high";
  pattern?: NotePattern;
  tape?: boolean;
  pin?: boolean;
  isNew?: boolean;
  autoEdit?: boolean;
  [key: string]: unknown;
}

export type NoteNodeType = Node<NoteNodeData, "note">;

export const NoteNode = memo(function NoteNode({
  id,
  data,
  selected,
  width = 240,
  height = 180,
}: NodeProps<NoteNodeType>) {
  const [isEditing, setIsEditing] = useState(() => Boolean(data.isNew || data.autoEdit));
  const [titleDraft, setTitleDraft] = useState(data.title || "Note");
  const [textDraft, setTextDraft] = useState(data.text || "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setTitleDraft(data.title ?? "Note");
  }, [data.title]);

  useEffect(() => {
    setTextDraft(data.text ?? "");
  }, [data.text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      const timer = setTimeout(() => {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (!textDraft.trim() && !titleDraft.trim() && data.isNew) {
      useFlowCanvasStore.getState().deleteNode(id);
      return;
    }
    useFlowCanvasStore.getState().updateNodeData(id, {
      title: titleDraft.trim() || "Note",
      text: textDraft,
      isNew: false,
      autoEdit: false,
    });
  };

  return (
    <div
      className={`relative w-full h-full select-none ${
        selected ? "ring-2 ring-blue-500/80 rounded-xl" : ""
      }`}
      style={{
        width: Math.max(160, width),
        height: Math.max(120, height),
        contain: "layout style",
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <NodeResizer minWidth={160} minHeight={120} isVisible={selected} />

      {/* 4 Multi-Directional Handles on all sides */}
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-amber-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-amber-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-amber-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 hover:!bg-amber-500 hover:!scale-150 transition-all cursor-crosshair !border !border-white dark:!border-zinc-800"
      />

      {/* Note Surface */}
      <Note
        variant={(data.variant as NoteVariant) || "yellow"}
        bg={data.color || data.bg}
        corner={(data.corner as NoteCorner) || "folded"}
        foldPosition={(data.foldPosition as FoldPosition) || "top-right"}
        noise={data.noise !== false}
        noiseIntensity={data.noiseIntensity || "medium"}
        pattern={(data.pattern as NotePattern) || "none"}
        tape={data.tape}
        pin={data.pin}
        className="w-full h-full flex flex-col p-0 cursor-default"
      >
        <div className="flex flex-col h-full w-full">
          {/* Note Header / Title */}
          <NoteHeader className="pb-1.5 shrink-0">
            {isEditing ? (
              <input
                type="text"
                value={titleDraft}
                placeholder="Title..."
                onChange={(e) => setTitleDraft(e.target.value)}
                className="w-full bg-transparent outline-none font-semibold text-sm border-b border-black/15 dark:border-white/15 pb-0.5 focus:border-black/40 dark:focus:border-white/40"
                style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    textareaRef.current?.focus();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
            ) : (
              <NoteTitle font="marker" className="text-sm select-none truncate">
                {titleDraft || "Note"}
              </NoteTitle>
            )}
          </NoteHeader>

          {/* Note Body Content */}
          <NoteContent className="flex-1 min-h-0 overflow-y-auto">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={textDraft}
                placeholder="Write something on your note..."
                onChange={(e) => setTextDraft(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                className="w-full h-full bg-transparent outline-none resize-none p-0 border-none shadow-none text-xs leading-relaxed focus:ring-0"
                style={{
                  fontFamily: "'Shantell Sans', cursive, sans-serif",
                }}
              />
            ) : (
              <div
                className="text-xs leading-relaxed break-words"
                style={{ fontFamily: "'Shantell Sans', cursive, sans-serif" }}
                dangerouslySetInnerHTML={{
                  __html: textDraft
                    ? renderMarkdownInline(textDraft)
                    : `<span class="opacity-50 italic">Double-click to write...</span>`,
                }}
              />
            )}
          </NoteContent>
        </div>
      </Note>
    </div>
  );
});

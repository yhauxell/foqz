import { useEffect } from "react";
import type { Edge, Node } from "@xyflow/react";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { applyFormattingToString, applyFormattingToTextarea, type TextFormatType } from "./textFormatting";
import { convertTextStyle, isTextNode, type TextStyle } from "@/lib/nodePredicates";

/**
 * Keyboard behavior shared by every text editor on the canvas (plain text, sticky, card),
 * so formatting and conversion shortcuts work the same everywhere.
 */

/** ⌥1 Plain · ⌥2 Sticky · ⌥3 Card. Matched on `code` so macOS ⌥-characters don't get in the way. */
export const STYLE_BY_DIGIT_CODE: Record<string, TextStyle> = {
  Digit1: "plain",
  Digit2: "sticky",
  Digit3: "card",
};

export function styleShortcut(e: Pick<KeyboardEvent, "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code">): TextStyle | null {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return null;
  return STYLE_BY_DIGIT_CODE[e.code] ?? null;
}

export function formatShortcut(e: Pick<KeyboardEvent, "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "key">): TextFormatType | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (e.shiftKey) return k === "x" ? "strike" : null;
  if (k === "b") return "bold";
  if (k === "i") return "italic";
  if (k === "u") return "underline";
  if (k === "k") return "link";
  return null;
}

/**
 * Handles formatting (⌘B/I/U/K, ⌘⇧X) and "extract selection" (⌥1/2/3) inside a textarea.
 * Returns true when it handled the key. The textarea's own onChange receives the new value.
 */
export function handleEditorKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  nodeId: string
): boolean {
  const format = formatShortcut(e);
  if (format) {
    e.preventDefault();
    e.stopPropagation(); // ⌘K here is a link, not the command bar
    applyFormattingToTextarea(e.currentTarget, format);
    return true;
  }
  const style = styleShortcut(e);
  if (style) {
    e.preventDefault();
    e.stopPropagation();
    const ta = e.currentTarget;
    if (ta.selectionStart !== ta.selectionEnd) {
      extractSelectionToNode(ta, nodeId, style);
    }
    return true;
  }
  return false;
}

function setTextareaValue(ta: HTMLTextAreaElement, value: string, caret: number) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(ta, value);
  else ta.value = value;
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Pulls the selected text out of an editor into a new plain text, sticky or card next to
 * the source, linked with a "relates to" connection. Returns the new node id.
 */
export function extractSelectionToNode(ta: HTMLTextAreaElement, sourceId: string, style: TextStyle): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const snippet = ta.value.slice(start, end).trim();
  if (!snippet) return null;

  const store = useFlowCanvasStore.getState();
  const source = store.nodes.find((n) => n.id === sourceId);
  if (!source) return null;

  // Remove the snippet (and the blank line it may leave behind) from the source editor.
  let before = ta.value.slice(0, start);
  let after = ta.value.slice(end);
  if (before.endsWith("\n") && (after.startsWith("\n") || after === "")) before = before.slice(0, -1);
  setTextareaValue(ta, before + after, before.length);

  const width = Number(source.measured?.width ?? (source.style as any)?.width ?? source.width ?? 200);
  const siblings = store.nodes.filter((n) => (n.data as any)?.extractedFrom === sourceId).length;
  const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const plain: Node = {
    id,
    type: "text",
    parentId: source.parentId,
    position: { x: source.position.x + width + 80, y: source.position.y + siblings * 110 },
    style: { zIndex: Number((source.style as any)?.zIndex ?? 100) + 1 },
    data: { text: snippet, extractedFrom: sourceId },
  };
  const created = style === "plain" ? plain : convertTextStyle(plain, style);
  const edge: Edge = {
    id: `e-extract-${sourceId}-${id}`,
    type: "semantic",
    source: sourceId,
    sourceHandle: "right",
    target: id,
    targetHandle: "left",
    data: { relation: "relates" },
  };
  store.setNodes((nodes) => [...nodes, created]);
  store.setEdges((edges) => [...edges, edge]);
  return id;
}

/** Converts every selected text-like node to the given style. */
export function convertSelected(style: TextStyle): number {
  const store = useFlowCanvasStore.getState();
  const ids = new Set(store.nodes.filter((n) => n.selected && isTextNode(n)).map((n) => n.id));
  if (ids.size === 0) return 0;
  store.setNodes((nodes) => nodes.map((n) => (ids.has(n.id) ? convertTextStyle(n, style) : n)));
  return ids.size;
}

/** Field that holds the body of a text-like node, for formatting without entering edit mode. */
function bodyField(node: Node): "text" | null {
  return node.type === "text" || node.type === "note" ? "text" : null;
}

export function canFormatWholeNode(node: Node | null | undefined): boolean {
  return !!node && bodyField(node) !== null;
}

/** Formats the whole body of every selected plain text or sticky (⌘B etc. without editing). */
export function formatSelected(format: TextFormatType, options?: Parameters<typeof applyFormattingToString>[2]): number {
  const store = useFlowCanvasStore.getState();
  // A node being typed in is formatted by its editor, not as a whole.
  const targets = store.nodes.filter(
    (n) => n.selected && canFormatWholeNode(n) && n.id !== store.editingNodeId
  );
  if (targets.length === 0) return 0;
  const patches = new Map(
    targets.map((n) => [n.id, applyFormattingToString(String((n.data as any)?.text ?? ""), format, options)])
  );
  store.setNodes((nodes) =>
    nodes.map((n) => (patches.has(n.id) ? { ...n, data: { ...n.data, text: patches.get(n.id) } } : n))
  );
  return targets.length;
}

/** Tells the toolbar which node is being edited, so it can show the formatting bar. */
export function useEditingRegistration(id: string, isEditing: boolean) {
  useEffect(() => {
    const store = useFlowCanvasStore.getState();
    if (isEditing) store.setEditingNodeId(id);
    else if (store.editingNodeId === id) store.setEditingNodeId(null);
    return () => {
      if (useFlowCanvasStore.getState().editingNodeId === id) {
        useFlowCanvasStore.getState().setEditingNodeId(null);
      }
    };
  }, [isEditing, id]);
}

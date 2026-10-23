import type { Node } from "@xyflow/react";

/**
 * Pure predicates and transforms for text nodes. No store access, so the
 * canvas store can import this without a cycle. Actions live in nodeBehaviors.
 *
 * The three text renderers (`text`, `note`, `focusTask`) are styles of one
 * concept. Being a to-do is a property (`data.actionable`), not a node type.
 * See docs/specs/canvas-pruning.md.
 */

export type TextStyle = "plain" | "sticky" | "card";

const STYLE_TO_TYPE: Record<TextStyle, string> = {
  plain: "text",
  sticky: "note",
  card: "focusTask",
};

export function isTextNode(node: Pick<Node, "type"> | null | undefined): boolean {
  return node?.type === "text" || node?.type === "note" || node?.type === "focusTask";
}

/** True when the node behaves like a to-do: it can be checked off, focused and swept. */
export function isActionable(node: Pick<Node, "type" | "data"> | null | undefined): boolean {
  if (!node) return false;
  if (node.type === "focusTask") return true;
  return isTextNode(node) && (node.data as any)?.actionable === true;
}

export function isDone(node: Pick<Node, "data"> | null | undefined): boolean {
  return (node?.data as any)?.status === "done";
}

export function textStyleOf(node: Pick<Node, "type"> | null | undefined): TextStyle | null {
  switch (node?.type) {
    case "text":
      return "plain";
    case "note":
      return "sticky";
    case "focusTask":
      return "card";
    default:
      return null;
  }
}

/** Human-readable label for any node, used by AI context, logbook, and lists. */
export function nodeTitle(node: Pick<Node, "id" | "data"> | null | undefined): string {
  if (!node) return "";
  const d = (node.data || {}) as Record<string, any>;
  const candidates = [d.title, d.text, d.label];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() && c.trim() !== "Note") {
      return c.trim().split("\n")[0].replace(/^#+\s*/, "").slice(0, 160);
    }
  }
  return typeof d.title === "string" && d.title.trim() ? d.title.trim() : node.id;
}

/** Full text body of a text-like node, regardless of style. */
function bodyOf(node: Node): string {
  const d = (node.data || {}) as Record<string, any>;
  if (node.type === "focusTask") {
    const title = typeof d.title === "string" ? d.title : "";
    const notes = typeof d.notes === "string" ? d.notes : "";
    return notes.trim() ? `${title}\n${notes}` : title;
  }
  const text = typeof d.text === "string" ? d.text : "";
  if (node.type === "note") {
    const title = typeof d.title === "string" ? d.title.trim() : "";
    if (title && title !== "Note" && !text.startsWith(title)) {
      return text.trim() ? `${title}\n${text}` : title;
    }
  }
  return text;
}

const TEXT_ONLY_KEYS = ["color", "fontSize"];
const STICKY_ONLY_KEYS = ["variant", "color", "bg", "corner", "foldPosition", "noise", "noiseIntensity", "pattern", "tape", "pin"];
const CARD_ONLY_KEYS = ["paper", "borderStyle"];

/**
 * Pure: re-render a text node in another style. Content, position, parent,
 * edges (by id) and behavior fields (status, focus time, GitHub link) are kept.
 */
export function convertTextStyle(node: Node, style: TextStyle): Node {
  const current = textStyleOf(node);
  if (!current || current === style) return node;

  const body = bodyOf(node);
  const [firstLine, ...rest] = body.split("\n");
  const data = { ...(node.data || {}) } as Record<string, any>;
  delete data.isNew;
  delete data.autoEdit;
  // Style-specific appearance does not carry across styles (a text color would become a
  // sticky background, a sticky color would tint plain text).
  for (const key of current === "plain" ? TEXT_ONLY_KEYS : current === "sticky" ? STICKY_ONLY_KEYS : CARD_ONLY_KEYS) {
    delete data[key];
  }

  const style0 = { ...(node.style || {}) } as Record<string, any>;
  let next: Record<string, any>;

  if (style === "card") {
    delete data.text;
    next = {
      ...data,
      title: firstLine.replace(/^#+\s*/, "").trim() || "Untitled",
      notes: rest.join("\n").trim(),
      status: data.status === "done" ? "done" : "open",
      actionable: true,
      paper: data.paper || "cream",
      borderStyle: data.borderStyle || "solid",
    };
    style0.width = Math.max(240, Number(style0.width) || 280);
    style0.height = Math.max(82, Number(style0.height) || 82);
  } else if (style === "sticky") {
    delete data.notes;
    next = { ...data, title: "Note", text: body, variant: data.variant || "yellow" };
    if (current === "card" && data.actionable !== false) next.actionable = true;
    style0.width = Math.max(200, Number(style0.width) || 240);
    style0.height = Math.max(140, Number(style0.height) || 180);
  } else {
    delete data.notes;
    delete data.title;
    next = { ...data, text: body };
    if (current === "card" && data.actionable !== false) next.actionable = true;
    style0.width = Math.max(160, Number(style0.width) || 240);
    delete style0.height;
  }

  const converted: Node = {
    ...node,
    type: STYLE_TO_TYPE[style],
    data: next,
    style: style0,
  };
  delete converted.width;
  delete converted.height;
  delete (converted as any).measured;
  return converted;
}

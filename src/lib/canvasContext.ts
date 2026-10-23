/**
 * Foqz Canvas Context Extractor
 * Pure React Flow implementation for AI Copilot and MCP Tools.
 */
import type { LogbookEntry } from "@/types/logbook";
import type { Annotation } from "@/types/annotations";
import { getLogbookEntriesByIds } from "./logbookService";
import { isActionable, nodeTitle, textStyleOf } from "./nodePredicates";

export interface ShapeContextItem {
  id: string;
  type: string;
  label: string;
  fullText: string;
  rawType: string;
  hasText: boolean;
  shape: any;
  color?: string;
  dimensions?: { w: number; h: number };
}

export interface CanvasContextResult {
  selectedItems: ShapeContextItem[];
  selectedSummary: string;
  boardItems: ShapeContextItem[];
  boardSummary: string;
  primaryShape: any | null;
  activeTask?: { id: string; title: string };
}

export interface ProjectFrameBundle {
  frameId: string;
  title: string;
  goal: string;
  description?: string;
  projectContext?: string;
  connectors?: Record<string, any>;
  containedShapes: Array<{
    id: string;
    type: string;
    text: string;
    shape: any;
  }>;
  summaryText: string;
}

const STYLE_LABEL = { plain: "Text", sticky: "Sticky", card: "Card" } as const;

/** Full body of a text-like node, regardless of style. */
function bodyOf(n: any): string {
  const d = (n.data || {}) as Record<string, any>;
  if (n.type === "focusTask") return [d.title, d.notes].filter(Boolean).join("\n");
  return String(d.text || "");
}

/** One line describing a node for the AI, or null for nodes the AI doesn't need (pencil, arrows). */
function describeNode(n: any, nodes: any[]): Omit<ShapeContextItem, "rawType" | "hasText" | "shape"> | null {
  const d = (n.data || {}) as Record<string, any>;
  const style = textStyleOf(n);
  const region = n.parentId ? nodes.find((p) => p.id === n.parentId && p.type === "projectFrame") : null;
  const inRegion = region ? `, in region "${region.data?.title || "Untitled"}"` : "";

  if (style) {
    const label = nodeTitle(n) || "Untitled";
    const body = bodyOf(n).trim();
    const todo = isActionable(n) ? `To-do, ${d.status === "done" ? "done" : "open"}` : STYLE_LABEL[style];
    const focus = d.focusSecondsSpent ? `, ${Math.round(Number(d.focusSecondsSpent) / 60)}m focused` : "";
    const github = d.githubIssueNumber ? `, GitHub #${d.githubIssueNumber}` : "";
    return {
      id: n.id,
      type: n.type,
      label,
      fullText: `[${todo}] "${body.replace(/\n+/g, " / ").slice(0, 400) || label}"${inRegion}${focus}${github}`,
    };
  }
  if (n.type === "projectFrame") {
    const label = d.title || "Untitled region";
    const desc = d.description ? `, intent: "${d.description}"` : "";
    return { id: n.id, type: n.type, label, fullText: `[Region] "${label}" (goal: "${d.goal || ""}"${desc})` };
  }
  if (n.type === "box" || n.type === "circle") {
    const label = d.label || (n.type === "box" ? "Rectangle" : "Circle");
    return { id: n.id, type: n.type, label, fullText: `[${n.type === "box" ? "Rectangle" : "Circle"}] "${label}"${inRegion}` };
  }
  if (n.type === "linkCard") {
    const label = d.title || d.url || "Link";
    return { id: n.id, type: n.type, label, fullText: `[Link] "${label}"${d.url ? ` (${d.url})` : ""}${inRegion}` };
  }
  if (n.type === "image") {
    const label = d.alt || "Image";
    return { id: n.id, type: n.type, label, fullText: `[Image] "${label}"${inRegion}` };
  }
  return null;
}

/** Annotations the user marked as visible to AI, open ones only. */
function describeAnnotations(annotations: Record<string, Annotation>, nodes: any[], onlyNodeIds?: Set<string>): string[] {
  const lines: string[] = [];
  for (const a of Object.values(annotations || {})) {
    if (!a?.aiVisible || a.status !== "open" || !Array.isArray(a.messages) || a.messages.length === 0) continue;
    const nodeId = a.anchor?.nodeId || null;
    if (onlyNodeIds && (!nodeId || !onlyNodeIds.has(nodeId))) continue;
    const target = nodeId ? nodes.find((n) => n.id === nodeId) : null;
    const on = target ? `on "${nodeTitle(target)}"` : "on the canvas";
    const [first, ...replies] = a.messages;
    const thread = replies.length > 0 ? ` (+${replies.length} repl${replies.length === 1 ? "y" : "ies"}: ${replies.map((r) => r.body).join(" | ").slice(0, 200)})` : "";
    lines.push(`- ${a.kind.toUpperCase()} ${on}: "${first.body.slice(0, 300)}"${thread}`);
  }
  return lines;
}

/**
 * Extracts and formats canvas context from React Flow nodes and edges so AI Copilot
 * can reason over text, to-dos, regions, connections and shared annotations.
 */
export function getFlowCanvasContext(
  nodes: any[],
  edges: any[] = [],
  selectedNodeId: string | null = null,
  options?: { logbookEntries?: LogbookEntry[]; annotations?: Record<string, Annotation> }
): CanvasContextResult {
  const toItem = (n: any): ShapeContextItem | null => {
    const desc = describeNode(n, nodes);
    return desc ? { ...desc, rawType: n.type, hasText: true, shape: n } : null;
  };

  const selectedNodes = nodes.filter((n) => n.id === selectedNodeId || n.selected);
  const selectedItems = selectedNodes.map(toItem).filter(Boolean) as ShapeContextItem[];
  const boardItems = nodes.map(toItem).filter(Boolean) as ShapeContextItem[];

  // Relationships from semantic edges
  const relationships: string[] = [];
  const selectedRelations: string[] = [];
  const selectedIds = new Set(selectedNodes.map((n) => n.id));

  for (const e of edges) {
    const src = nodes.find((n) => n.id === e.source);
    const tgt = nodes.find((n) => n.id === e.target);
    if (!src || !tgt) continue;
    const relText =
      e.data?.relation === "relates"
        ? `- "${nodeTitle(src)}" RELATES TO "${nodeTitle(tgt)}"`
        : `- "${nodeTitle(tgt)}" DEPENDS ON "${nodeTitle(src)}"`;
    relationships.push(relText);
    if (selectedIds.has(e.source) || selectedIds.has(e.target)) selectedRelations.push(relText);
  }

  let selectedSummary = selectedItems
    .map((item, idx) => `${idx + 1}. ${item.fullText} [id: ${item.id}]`)
    .join("\n");
  if (selectedRelations.length > 0) {
    selectedSummary += `\nConnections:\n${selectedRelations.join("\n")}`;
  }

  let boardSummary = boardItems
    .map((item, idx) => `${idx + 1}. ${item.fullText} [id: ${item.id}]`)
    .join("\n");
  if (relationships.length > 0) {
    boardSummary += `\n\nConnections (${relationships.length}):\n${relationships.join("\n")}`;
  }

  const annotations = options?.annotations || {};
  const boardNotes = describeAnnotations(annotations, nodes);
  if (boardNotes.length > 0) {
    boardSummary += `\n\nAnnotations shared with AI (${boardNotes.length}):\n${boardNotes.join("\n")}`;
  }
  const selectedNotes = describeAnnotations(annotations, nodes, selectedIds);
  if (selectedNotes.length > 0) {
    selectedSummary += `\nAnnotations:\n${selectedNotes.join("\n")}`;
  }

  // Completed preceding work from the Logbook (only for open to-dos with explicit links)
  const openTodos = nodes.filter((n) => isActionable(n) && n.data?.status !== "done");
  const relevantHistorical = (options?.logbookEntries || []).filter((e) =>
    precedingIds(openTodos, nodes).has(e.id)
  );

  if (relevantHistorical.length > 0) {
    const historicalLines = relevantHistorical.map((e) => {
      const proj = e.projectTitle ? `, region: ${e.projectTitle}` : "";
      const focus = e.focusSecondsSpent ? `, ${Math.round(e.focusSecondsSpent / 60)}m focus` : "";
      const dateStr = new Date(e.completedAt).toLocaleDateString([], { month: "short", day: "numeric" });
      return `- "[x] ${e.title}" (finished ${dateStr}${focus}${proj})`;
    });
    const historicalMarkdown = `\n\n### Done earlier (Logbook)\n${historicalLines.join("\n")}`;
    boardSummary += historicalMarkdown;
    if (selectedNodes.some((sn) => openTodos.some((t) => t.id === sn.id))) {
      selectedSummary += historicalMarkdown;
    }
  }

  return {
    selectedItems,
    selectedSummary,
    boardItems,
    boardSummary,
    primaryShape: selectedItems.length > 0 ? selectedItems[0].shape : null,
  };
}

/** Ids of swept (no longer on canvas) items that open to-dos depended on. */
function precedingIds(openTodos: any[], nodes: any[]): Set<string> {
  const ids = new Set<string>();
  for (const t of openTodos) {
    const d = (t.data || {}) as Record<string, any>;
    if (Array.isArray(d.dependencies)) {
      for (const depId of d.dependencies) {
        if (!nodes.some((n) => n.id === depId)) ids.add(depId);
      }
    }
    if (Array.isArray(d.resolvedDependencies)) {
      for (const r of d.resolvedDependencies) ids.add(r.id);
    }
    if (d.parentTaskId && !nodes.some((n) => n.id === d.parentTaskId)) ids.add(d.parentTaskId);
  }
  return ids;
}

/**
 * Async version of getFlowCanvasContext that resolves swept dependencies against the Logbook.
 */
export async function getFlowCanvasContextAsync(
  nodes: any[],
  edges: any[] = [],
  selectedNodeId: string | null = null,
  annotations: Record<string, Annotation> = {},
): Promise<CanvasContextResult> {
  const openTodos = nodes.filter((n) => isActionable(n) && n.data?.status !== "done");
  const needed = precedingIds(openTodos, nodes);

  let logbookEntries: LogbookEntry[] = [];
  if (needed.size > 0) {
    try {
      logbookEntries = await getLogbookEntriesByIds(Array.from(needed));
    } catch (e) {
      console.warn("Failed to query logbook entries for context:", e);
    }
  }

  return getFlowCanvasContext(nodes, edges, selectedNodeId, { logbookEntries, annotations });
}

/**
 * Returns everything inside a region (direct children or positioned within its bounds).
 */
export function getFlowProjectFrameContents(
  nodes: any[],
  frameId: string,
): ProjectFrameBundle | null {
  const frame = nodes.find((n) => n.id === frameId && n.type === "projectFrame");
  if (!frame) return null;

  const data = (frame.data || {}) as Record<string, any>;
  const frameX = frame.position?.x ?? 0;
  const frameY = frame.position?.y ?? 0;
  const frameR = frameX + Number(frame.style?.width ?? frame.width ?? 640);
  const frameB = frameY + Number(frame.style?.height ?? frame.height ?? 400);

  const contained: ProjectFrameBundle["containedShapes"] = [];
  for (const n of nodes) {
    if (n.id === frame.id) continue;
    const nx = n.position?.x ?? 0;
    const ny = n.position?.y ?? 0;
    const isContained = !n.parentId && nx >= frameX && nx <= frameR && ny >= frameY && ny <= frameB;
    if (n.parentId === frame.id || isContained) {
      contained.push({ id: n.id, type: n.type, text: describeNode(n, nodes)?.fullText || `[${n.type}]`, shape: n });
    }
  }

  const descSection = data.description ? `\nIntent: ${data.description}` : "";
  const contextSection = data.projectContext
    ? `\nContext:\n${String(data.projectContext).slice(0, 500)}${String(data.projectContext).length > 500 ? "..." : ""}`
    : "";

  return {
    frameId: frame.id,
    title: data.title || "Untitled region",
    goal: data.goal || "",
    description: data.description,
    projectContext: data.projectContext,
    connectors: data.connectors,
    containedShapes: contained,
    summaryText: `Region: ${data.title || "Untitled"}\nGoal: ${data.goal || ""}${descSection}${contextSection}\nInside (${contained.length}):\n${contained
      .map((c, idx) => `${idx + 1}. ${c.text}`)
      .join("\n")}`,
  };
}

/**
 * Foqz Canvas Context Extractor
 * Pure React Flow implementation for AI Copilot and MCP Tools.
 */

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

/**
 * Extracts and formats canvas context from React Flow nodes and edges so AI Copilot
 * can reason over canvas elements, task statuses, projects, and topological relationships.
 */
export function getFlowCanvasContext(
  nodes: any[],
  edges: any[] = [],
  selectedNodeId: string | null = null,
): CanvasContextResult {
  const selectedNodes = nodes.filter(
    (n) => n.id === selectedNodeId || n.selected
  );
  const selectedItems: ShapeContextItem[] = [];

  for (const n of selectedNodes) {
    const d = (n.data || {}) as Record<string, any>;
    let label = "";
    let fullText = "";

    if (n.type === "focusTask") {
      label = d.title || "Untitled Task";
      fullText = `[Focus Task] "${label}" (Status: ${d.status || "open"}, Priority: P${d.priority || 3}${d.notes ? `, Notes: ${d.notes}` : ""})`;
    } else if (n.type === "projectFrame") {
      label = d.title || "Untitled Project";
      fullText = `[Project Frame] "${label}" (Goal: "${d.goal || ""}")`;
    } else if (n.type === "box") {
      label = d.label || "Sketch Box";
      fullText = `[Sketch Box] "${label}"`;
    } else if (n.type === "circle") {
      label = d.label || "Sketch Circle";
      fullText = `[Sketch Circle] "${label}"`;
    } else if (n.type === "text") {
      label = d.text || "Text Note";
      fullText = `[Text Note] "${label}"`;
    } else {
      label = n.type || "Element";
      fullText = `[${n.type} Element]`;
    }

    selectedItems.push({
      id: n.id,
      type: n.type,
      label,
      fullText,
      rawType: n.type,
      hasText: true,
      shape: n,
    });
  }

  // Parse topological relationships from semantic edges
  const relationships: string[] = [];
  const selectedRelations: string[] = [];
  const selectedIds = new Set(selectedNodes.map((n) => n.id));

  for (const e of edges) {
    const src = nodes.find((n) => n.id === e.source);
    const tgt = nodes.find((n) => n.id === e.target);
    if (!src || !tgt) continue;

    const srcTitle = src.data?.title || src.data?.label || src.data?.text || src.id;
    const tgtTitle = tgt.data?.title || tgt.data?.label || tgt.data?.text || tgt.id;
    const rel = e.data?.relation || "depends";

    let relText = "";
    if (rel === "blocks") {
      relText = `- "${srcTitle}" BLOCKS "${tgtTitle}" (Cannot start until blocker is resolved)`;
    } else if (rel === "aggregates") {
      relText = `- "${srcTitle}" RELATES TO / AGGREGATES "${tgtTitle}"`;
    } else {
      relText = `- "${tgtTitle}" DEPENDS ON "${srcTitle}" (Prerequisite dependency)`;
    }

    relationships.push(relText);
    if (selectedIds.has(e.source) || selectedIds.has(e.target)) {
      selectedRelations.push(relText);
    }
  }

  let selectedSummary = selectedItems
    .map((item, idx) => `${idx + 1}. ${item.fullText}`)
    .join("\n");

  if (selectedRelations.length > 0) {
    selectedSummary += `\nConnected Dependencies:\n${selectedRelations.join("\n")}`;
  }

  const boardItems: ShapeContextItem[] = [];
  for (const n of nodes) {
    const d = (n.data || {}) as Record<string, any>;
    let label = "";
    let fullText = "";

    if (n.type === "focusTask") {
      label = d.title || "Untitled Task";
      fullText = `[Focus Task] "${label}" (Status: ${d.status || "open"}, Priority: P${d.priority || 3}${d.notes ? `, Notes: ${d.notes}` : ""})`;
    } else if (n.type === "projectFrame") {
      label = d.title || "Untitled Project";
      fullText = `[Project Frame] "${label}" (Goal: "${d.goal || ""}")`;
    } else if (n.type === "box") {
      label = d.label || "Sketch Box";
      fullText = `[Sketch Box] "${label}"`;
    } else if (n.type === "circle") {
      label = d.label || "Sketch Circle";
      fullText = `[Sketch Circle] "${label}"`;
    } else if (n.type === "text") {
      label = d.text || "Text Note";
      fullText = `[Text Note] "${label}"`;
    } else {
      continue;
    }

    boardItems.push({
      id: n.id,
      type: n.type,
      label,
      fullText,
      rawType: n.type,
      hasText: true,
      shape: n,
    });
  }

  let boardSummary = boardItems
    .map((item, idx) => `${idx + 1}. ${item.fullText}`)
    .join("\n");

  if (relationships.length > 0) {
    boardSummary += `\n\nTopological Dependencies & Relationships (${relationships.length}):\n${relationships.join("\n")}`;
  }

  const primaryShape = selectedItems.length > 0 ? selectedItems[0].shape : null;

  return {
    selectedItems,
    selectedSummary,
    boardItems,
    boardSummary,
    primaryShape,
  };
}

/**
 * Returns all spatial backlog elements positioned inside a given React Flow ProjectFrame.
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
  const frameW = Number(frame.style?.width ?? frame.width ?? 640);
  const frameH = Number(frame.style?.height ?? frame.height ?? 400);
  const frameR = frameX + frameW;
  const frameB = frameY + frameH;

  const contained: Array<{
    id: string;
    type: string;
    text: string;
    shape: any;
  }> = [];

  for (const n of nodes) {
    if (n.id === frame.id) continue;

    const isDirectChild = n.parentId === frame.id;
    const nx = n.position?.x ?? 0;
    const ny = n.position?.y ?? 0;
    const isContained = nx >= frameX && nx <= frameR && ny >= frameY && ny <= frameB;

    if (isDirectChild || isContained) {
      const d = n.data || {};
      const text = d.title || d.label || d.text || `[${n.type}]`;
      contained.push({
        id: n.id,
        type: n.type,
        text,
        shape: n,
      });
    }
  }

  const summaryLines = contained.map(
    (c, idx) => `${idx + 1}. [${c.type}] ${c.text}`,
  );

  const contextSection = data.projectContext
    ? `\nProject Context:\n${String(data.projectContext).slice(0, 500)}${String(data.projectContext).length > 500 ? "..." : ""}`
    : "";

  return {
    frameId: frame.id,
    title: data.title || "Untitled Project",
    goal: data.goal || "",
    projectContext: data.projectContext,
    connectors: data.connectors,
    containedShapes: contained,
    summaryText: `Project: ${data.title || "Untitled"}\nGoal: ${data.goal || ""}${contextSection}\nBacklog items (${contained.length}):\n${summaryLines.join("\n")}`,
  };
}

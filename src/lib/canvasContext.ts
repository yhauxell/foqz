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
      const originInfo = d.originProjectTitle ? `, Origin: "${d.originProjectTitle}"` : "";
      const stagedInfo = n.parentId && nodes.find((p) => p.id === n.parentId && p.type === 'runwayFrame') ? `, Staged On: Runway` : "";
      fullText = `[Focus Task] "${label}" (Status: ${d.status || "open"}, Priority: P${d.priority || 3}${originInfo}${stagedInfo}${d.notes ? `, Notes: ${d.notes}` : ""})`;
    } else if (n.type === "runwayFrame") {
      label = d.title || "Runway Frame";
      fullText = `[Runway Frame] "${label}" (Template: ${d.templateId || "rule_of_3"}, Goal: "${d.dailyGoal || ""}", Cleared: ${d.clearedToday || 0})`;
    } else if (n.type === "projectFrame") {
      label = d.title || "Untitled Project";
      const descInfo = d.description ? `, Intent: "${d.description}"` : "";
      fullText = `[Project / Semantic Group] "${label}" (Goal: "${d.goal || ""}"${descInfo})`;
    } else if (n.type === "note") {
      label = d.title || (d.text ? d.text.slice(0, 40) : "Sticky Note");
      const content = d.text || d.notes || "";
      fullText = `[Paper Sticky Note] "${d.title || "Note"}" (Theme: ${d.variant || "yellow"}${content ? `, Text: "${content}"` : ", Empty"})`;
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
      const originInfo = d.originProjectTitle ? `, Origin: "${d.originProjectTitle}"` : "";
      const stagedInfo = n.parentId && nodes.find((p) => p.id === n.parentId && p.type === 'runwayFrame') ? `, Staged On: Runway` : "";
      fullText = `[Focus Task] "${label}" (Status: ${d.status || "open"}, Priority: P${d.priority || 3}${originInfo}${stagedInfo}${d.notes ? `, Notes: ${d.notes}` : ""})`;
    } else if (n.type === "runwayFrame") {
      label = d.title || "Runway Frame";
      fullText = `[Runway Frame] "${label}" (Template: ${d.templateId || "rule_of_3"}, Goal: "${d.dailyGoal || ""}", Cleared: ${d.clearedToday || 0})`;
    } else if (n.type === "projectFrame") {
      label = d.title || "Untitled Project";
      fullText = `[Project Frame] "${label}" (Goal: "${d.goal || ""}")`;
    } else if (n.type === "note") {
      label = d.title || (d.text ? d.text.slice(0, 40) : "Sticky Note");
      const content = d.text || d.notes || "";
      fullText = `[Paper Sticky Note] "${d.title || "Note"}" (Theme: ${d.variant || "yellow"}${content ? `, Text: "${content}"` : ", Empty"})`;
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
    const isOrigin = (n.data as any)?.originProjectId === frame.id;
    const nx = n.position?.x ?? 0;
    const ny = n.position?.y ?? 0;
    const isContained = nx >= frameX && nx <= frameR && ny >= frameY && ny <= frameB;

    if (isDirectChild || isContained || isOrigin) {
      const d = n.data || {};
      let text = d.title || d.label || d.text || `[${n.type}]`;
      if (isOrigin && !isDirectChild && !isContained) {
        text = `${text} (Staged on Runway)`;
      }
      if (n.type === "note") {
        const body = d.text || d.notes || "";
        text = d.title ? `${d.title}${body ? `: "${body}"` : ""}` : (body ? `"${body}"` : "Sticky Note");
      }
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

  const descSection = data.description ? `\nIntent / Description: ${data.description}` : "";
  const contextSection = data.projectContext
    ? `\nProject Context:\n${String(data.projectContext).slice(0, 500)}${String(data.projectContext).length > 500 ? "..." : ""}`
    : "";

  return {
    frameId: frame.id,
    title: data.title || "Untitled Project",
    goal: data.goal || "",
    description: data.description,
    projectContext: data.projectContext,
    connectors: data.connectors,
    containedShapes: contained,
    summaryText: `Project / Semantic Group: ${data.title || "Untitled"}\nGoal: ${data.goal || ""}${descSection}${contextSection}\nContained elements (${contained.length}):\n${summaryLines.join("\n")}`,
  };
}

export interface RunwayFrameBundle {
  frameId: string;
  title: string;
  templateId: string;
  dailyGoal: string;
  clearedToday: number;
  maxCapacity: number;
  stagedTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: number;
    originProjectId?: string;
    originProjectTitle?: string;
    isBlocked: boolean;
    shape: any;
  }>;
  summaryText: string;
}

/**
 * Returns all flight tasks staged inside a given React Flow RunwayFrame,
 * including origin project provenance and blocker status.
 */
export function getFlowRunwayFrameContents(
  nodes: any[],
  frameId: string,
): RunwayFrameBundle | null {
  const frame = nodes.find(
    (n) =>
      n.id === frameId &&
      (n.type === "runwayFrame" ||
        (n.type === "projectFrame" && String(n.data?.title || "").includes("Runway"))),
  );
  if (!frame) return null;

  const data = (frame.data || {}) as Record<string, any>;
  const frameX = frame.position?.x ?? 0;
  const frameY = frame.position?.y ?? 0;
  const frameW = Number(frame.style?.width ?? frame.width ?? 480);
  const frameH = Number(frame.style?.height ?? frame.height ?? 600);
  const frameR = frameX + frameW;
  const frameB = frameY + frameH;

  const staged: Array<{
    id: string;
    title: string;
    status: string;
    priority: number;
    originProjectId?: string;
    originProjectTitle?: string;
    isBlocked: boolean;
    shape: any;
  }> = [];

  for (const n of nodes) {
    if (n.id === frame.id || n.type !== "focusTask") continue;
    const isDirectChild = n.parentId === frame.id;
    const nx = n.position?.x ?? 0;
    const ny = n.position?.y ?? 0;
    const isContained = nx >= frameX && nx <= frameR && ny >= frameY && ny <= frameB;

    if (isDirectChild || isContained) {
      const d = (n.data || {}) as Record<string, any>;
      const deps = d.dependencies || [];
      const isBlocked = deps.some((depId: string) => {
        const dep = nodes.find((m) => m.id === depId);
        return dep && (dep.data as any)?.status !== "done";
      });

      staged.push({
        id: n.id,
        title: d.title || "Untitled Task",
        status: d.status || "open",
        priority: d.priority ?? 3,
        originProjectId: d.originProjectId,
        originProjectTitle: d.originProjectTitle,
        isBlocked,
        shape: n,
      });
    }
  }

  const summaryLines = staged.map((t, idx) => {
    const origin = t.originProjectTitle ? ` [From: ${t.originProjectTitle}]` : " [Direct Task]";
    const blocked = t.isBlocked ? " [BLOCKED]" : "";
    return `${idx + 1}. [${t.status.toUpperCase()}] "${t.title}"${origin}${blocked} (P${t.priority})`;
  });

  return {
    frameId: frame.id,
    title: data.title || "Today's Runway",
    templateId: data.templateId || "rule_of_3",
    dailyGoal: data.dailyGoal || "",
    clearedToday: data.clearedToday || 0,
    maxCapacity: data.maxCapacity || 5,
    stagedTasks: staged,
    summaryText: `Runway: ${data.title || "Today's Runway"}\nTemplate: ${data.templateId || "rule_of_3"}\nDaily Goal: ${data.dailyGoal || "Execute daily focus items"}\nStaged Items (${staged.length}):\n${summaryLines.join("\n")}`,
  };
}

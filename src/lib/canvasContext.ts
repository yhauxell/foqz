import type { Editor, TLShape } from "tldraw";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";
import type { TLProjectFrameShape } from "@/shapes/projectFrame/ProjectFrameShapeUtil";

export interface ShapeContextItem {
  id: string;
  type: string;
  label: string;
  fullText: string;
  rawType: string;
  hasText: boolean;
  shape: TLShape;
  color?: string;
  dimensions?: { w: number; h: number };
}

/**
 * Recursively extracts plain text from ProseMirror/TipTap richText object or string.
 */
export function extractTextFromRichText(richText: any): string {
  if (!richText) return "";
  if (typeof richText === "string") {
    if (richText.startsWith("{") || richText.startsWith("[")) {
      try {
        return extractTextFromRichText(JSON.parse(richText));
      } catch {
        return richText.trim();
      }
    }
    return richText.trim();
  }
  if (Array.isArray(richText)) {
    return richText.map(extractTextFromRichText).filter(Boolean).join(" ").trim();
  }
  if (typeof richText === "object") {
    if (richText.type === "hardBreak") {
      return "\n";
    }
    if (typeof richText.text === "string") {
      return richText.text;
    }
    if (richText.type === "paragraph" || richText.type === "heading") {
      if (Array.isArray(richText.content)) {
        return richText.content.map(extractTextFromRichText).join("");
      }
    }
    if (richText.content) {
      const contentList = Array.isArray(richText.content) ? richText.content : [richText.content];
      return contentList
        .map(extractTextFromRichText)
        .filter(Boolean)
        .join("\n")
        .trim();
    }
  }
  return "";
}

/**
 * Extracts any human-readable text from any tldraw shape.
 */
export function extractTextFromShape(shape: TLShape): string {
  if (!shape) return "";
  const props = (shape.props || {}) as Record<string, any>;

  // 1. Direct text property
  if (typeof props.text === "string" && props.text.trim()) {
    return props.text.trim();
  }
  // 2. Direct title property (focus-task, project-frame)
  if (typeof props.title === "string" && props.title.trim()) {
    return props.title.trim();
  }
  // 3. Rich text property (tldraw v3 note, text, geo)
  if (props.richText) {
    const textFromRich = extractTextFromRichText(props.richText);
    if (textFromRich.trim()) {
      return textFromRich.trim();
    }
  }
  // 4. Label property
  if (typeof props.label === "string" && props.label.trim()) {
    return props.label.trim();
  }
  // 5. Name property
  if (typeof props.name === "string" && props.name.trim()) {
    return props.name.trim();
  }

  return "";
}

/**
 * Extract human-readable text and metadata from any canvas shape.
 * ALWAYS returns a valid context item for any selected shape on the canvas.
 */
export function extractShapeContext(shape: TLShape): ShapeContextItem | null {
  if (!shape) return null;
  const props = (shape.props || {}) as Record<string, any>;
  const text = extractTextFromShape(shape);
  const hasText = Boolean(text && text.trim().length > 0);

  switch (shape.type) {
    case "focus-task": {
      const task = shape as TLFocusTaskShape;
      const title = task.props.title || "Untitled Task";
      const status = task.props.status || "open";
      const priority = task.props.priority || 3;
      const notes = task.props.notes ? `\nNotes:\n${task.props.notes}` : "";
      return {
        id: shape.id,
        type: "Task Card",
        label: title,
        fullText: `[Task Card (P${priority}, ${status})] "${title}"${notes}`,
        rawType: shape.type,
        hasText: Boolean(title.trim()),
        shape,
        color: status === "done" ? "green" : priority === 1 ? "red" : "blue",
      };
    }

    case "project-frame": {
      const proj = shape as TLProjectFrameShape;
      const title = proj.props.title || "Untitled Project";
      const goal = proj.props.goal ? ` (Goal: "${proj.props.goal}")` : "";
      const repo = proj.props.connectors?.githubRepo
        ? ` [GitHub Repo: ${proj.props.connectors.githubRepo}]`
        : "";
      const sentry = proj.props.connectors?.sentryProject
        ? ` [Sentry: ${proj.props.connectors.sentryProject}]`
        : "";
      const notion = proj.props.connectors?.notionWorkspace
        ? ` [Notion: ${proj.props.connectors.notionWorkspace}]`
        : "";
      const contextSnippet = proj.props.projectContext
        ? `\n[Project Architecture & Context]:\n${proj.props.projectContext.slice(0, 600)}${proj.props.projectContext.length > 600 ? "..." : ""}`
        : "";
      return {
        id: shape.id,
        type: "Project Frame",
        label: title,
        fullText: `[Project Frame] "${title}"${goal}${repo}${sentry}${notion}${contextSnippet}`,
        rawType: shape.type,
        hasText: Boolean(title.trim() || proj.props.goal?.trim() || repo || proj.props.projectContext),
        shape,
        color: proj.props.accent || "blue",
        dimensions: { w: Math.round(proj.props.w || 600), h: Math.round(proj.props.h || 400) },
      };
    }

    case "note": {
      const noteText = text || "Empty Note";
      const color = props.color || "yellow";
      return {
        id: shape.id,
        type: "Sticky Note",
        label: noteText.slice(0, 80) + (noteText.length > 80 ? "..." : ""),
        fullText: `[Sticky Note (${color})] "${noteText}"`,
        rawType: shape.type,
        hasText,
        color,
        shape,
      };
    }

    case "text": {
      const content = text || "Text element";
      return {
        id: shape.id,
        type: "Text",
        label: content.slice(0, 80) + (content.length > 80 ? "..." : ""),
        fullText: `[Text on Canvas] "${content}"`,
        rawType: shape.type,
        hasText,
        color: props.color,
        shape,
      };
    }

    case "geo": {
      const geo = props.geo || "rectangle";
      const geoName = geo.charAt(0).toUpperCase() + geo.slice(1);
      const label = hasText
        ? text.slice(0, 80) + (text.length > 80 ? "..." : "")
        : `${geoName} Shape`;
      const desc = hasText
        ? `[${geoName} Shape] "${text}"`
        : `[${geoName} Shape (${Math.round(props.w || 100)}x${Math.round(props.h || 100)})]`;
      return {
        id: shape.id,
        type: `${geoName} Shape`,
        label,
        fullText: desc,
        rawType: shape.type,
        hasText,
        color: props.color,
        dimensions: { w: Math.round(props.w || 100), h: Math.round(props.h || 100) },
        shape,
      };
    }

    case "arrow": {
      const label = text || "Arrow connection";
      return {
        id: shape.id,
        type: "Arrow",
        label,
        fullText: text ? `[Arrow with label] "${text}"` : `[Arrow connector]`,
        rawType: shape.type,
        hasText,
        color: props.color,
        shape,
      };
    }

    case "line": {
      return {
        id: shape.id,
        type: "Line",
        label: "Line",
        fullText: `[Line on Canvas]`,
        rawType: shape.type,
        hasText: false,
        color: props.color,
        shape,
      };
    }

    case "draw": {
      return {
        id: shape.id,
        type: "Drawing",
        label: "Freehand Sketch",
        fullText: `[Freehand Sketch / Drawing]`,
        rawType: shape.type,
        hasText: false,
        color: props.color,
        shape,
      };
    }

    case "frame": {
      const name = props.name?.trim() || "Frame Container";
      return {
        id: shape.id,
        type: "Frame",
        label: name,
        fullText: `[Frame] "${name}"`,
        rawType: shape.type,
        hasText: Boolean(props.name?.trim()),
        dimensions: { w: Math.round(props.w || 400), h: Math.round(props.h || 300) },
        shape,
      };
    }

    case "focus-timer": {
      const min = props.durationPreset || 25;
      const isRunning = props.running;
      return {
        id: shape.id,
        type: "Focus Timer",
        label: `${min}m Focus Timer`,
        fullText: `[Focus Timer] ${min} minutes (${isRunning ? "Running" : "Paused"})`,
        rawType: shape.type,
        hasText: true,
        color: isRunning ? "green" : "orange",
        shape,
      };
    }

    case "focus-reflection": {
      const score = props.score || 3;
      const date = props.date || "Today";
      const reflText = props.text?.trim() || "";
      return {
        id: shape.id,
        type: "Reflection",
        label: reflText ? reflText.slice(0, 80) + (reflText.length > 80 ? "..." : "") : `Reflection (${score}/5 stars)`,
        fullText: `[Daily Reflection (${score}/5 stars, ${date})] "${reflText || "No notes"}"`,
        rawType: shape.type,
        hasText: Boolean(reflText),
        shape,
      };
    }

    case "focus-energy": {
      const level = props.level || 3;
      return {
        id: shape.id,
        type: "Energy Tracker",
        label: `Energy Level ${level}/5`,
        fullText: `[Energy Tracker] Level ${level}/5`,
        rawType: shape.type,
        hasText: true,
        shape,
      };
    }

    case "focus-inbox": {
      const label = props.label?.trim() || "Quick Capture Inbox";
      return {
        id: shape.id,
        type: "Quick Capture Inbox",
        label,
        fullText: `[Quick Capture Inbox] "${label}"`,
        rawType: shape.type,
        hasText: true,
        shape,
      };
    }

    default: {
      const clean = text || shape.type;
      return {
        id: shape.id,
        type: shape.type.charAt(0).toUpperCase() + shape.type.slice(1),
        label: clean.slice(0, 80) + (clean.length > 80 ? "..." : ""),
        fullText: text ? `[${shape.type}] "${text}"` : `[${shape.type} element]`,
        rawType: shape.type,
        hasText,
        color: props.color,
        shape,
      };
    }
  }
}

/**
 * Summarizes the entire active board context as well as currently selected shapes
 * so the AI copilot can reason over anything on the canvas.
 */
export function getCanvasContext(editor: Editor | null) {
  if (!editor) {
    return {
      selectedItems: [],
      selectedSummary: "",
      boardItems: [],
      boardSummary: "",
      primaryShape: null,
    };
  }

  // 1. Process selected shapes (always includes every selected shape)
  const selectedShapes = editor.getSelectedShapes();
  const selectedItems: ShapeContextItem[] = [];
  for (const s of selectedShapes) {
    const ctx = extractShapeContext(s);
    if (ctx) selectedItems.push(ctx);
  }

  const selectedSummary = selectedItems
    .map((item, idx) => `${idx + 1}. ${item.fullText}`)
    .join("\n");

  // 2. Process shapes on current page for board context
  const allPageShapes = editor.getCurrentPageShapes();
  const boardItems: ShapeContextItem[] = [];
  for (const s of allPageShapes) {
    const ctx = extractShapeContext(s);
    // Prioritize shapes that have text or are dedicated focus/project/timer elements
    if (
      ctx &&
      (ctx.hasText ||
        [
          "focus-task",
          "project-frame",
          "focus-timer",
          "focus-reflection",
          "focus-energy",
          "focus-inbox",
        ].includes(ctx.rawType))
    ) {
      boardItems.push(ctx);
    }
  }

  // If no text-bearing shapes found, include all shapes so empty boards with shapes still get recognized
  if (boardItems.length === 0) {
    for (const s of allPageShapes) {
      const ctx = extractShapeContext(s);
      if (ctx) boardItems.push(ctx);
    }
  }

  const boardSummary = boardItems
    .map((item, idx) => `${idx + 1}. ${item.fullText}`)
    .join("\n");

  const primaryShape = selectedItems.length > 0 ? selectedItems[0].shape : null;

  return {
    selectedItems,
    selectedSummary,
    boardItems,
    boardSummary,
    primaryShape,
  };
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
    shape: TLShape;
  }>;
  summaryText: string;
}

/**
 * Returns all spatial backlog elements (shapes, notes, tasks, arrows)
 * positioned inside a given ProjectFrame boundary.
 */
export function getProjectFrameContents(
  editor: Editor | null,
  frameId: string,
): ProjectFrameBundle | null {
  if (!editor) return null;
  const frame = editor.getShape(frameId as any);
  if (!frame || frame.type !== "project-frame") return null;

  const props = (frame.props || {}) as Record<string, any>;
  const frameX = frame.x;
  const frameY = frame.y;
  const frameW = props.w || 720;
  const frameH = props.h || 460;
  const frameR = frameX + frameW;
  const frameB = frameY + frameH;

  const pageShapes = editor.getCurrentPageShapes();
  const contained: Array<{
    id: string;
    type: string;
    text: string;
    shape: TLShape;
  }> = [];

  for (const s of pageShapes) {
    if (s.id === frame.id) continue;

    const isDirectChild = s.parentId === frame.id;
    const isContained =
      s.x >= frameX && s.x <= frameR && s.y >= frameY && s.y <= frameB;

    if (isDirectChild || isContained) {
      const text = extractTextFromShape(s);
      contained.push({
        id: s.id,
        type: s.type,
        text: text || `[${s.type}]`,
        shape: s,
      });
    }
  }

  const summaryLines = contained.map(
    (c, idx) => `${idx + 1}. [${c.type}] ${c.text}`,
  );

  const contextSection = props.projectContext
    ? `\nProject Context:\n${props.projectContext.slice(0, 500)}${props.projectContext.length > 500 ? "..." : ""}`
    : "";

  return {
    frameId: frame.id,
    title: props.title || "Untitled Project",
    goal: props.goal || "",
    projectContext: props.projectContext,
    connectors: props.connectors,
    containedShapes: contained,
    summaryText: `Project: ${props.title}\nGoal: ${props.goal}${contextSection}\nBacklog items (${contained.length}):\n${summaryLines.join("\n")}`,
  };
}

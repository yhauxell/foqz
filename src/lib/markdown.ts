import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const inlineCache = new Map<string, string>();
const blockCache = new Map<string, string>();

/**
 * Render inline markdown (for task titles, badges, and one-line summaries).
 * Sanitized via DOMPurify to prevent XSS.
 */
export function renderMarkdownInline(text: string): string {
  if (!text) return "";
  const cached = inlineCache.get(text);
  if (cached !== undefined) return cached;
  try {
    const raw = marked.parseInline(text);
    const sanitized = DOMPurify.sanitize(typeof raw === "string" ? raw : "");
    if (inlineCache.size > 500) inlineCache.clear();
    inlineCache.set(text, sanitized);
    return sanitized;
  } catch {
    return text;
  }
}

/**
 * Render block markdown (for task notes, descriptions, checklists, and code snippets).
 * Replaces both unchecked and checked disabled checkboxes with interactive checkboxes
 * tracking the exact data-task-checkbox index. Sanitized via DOMPurify.
 */
export function renderMarkdownBlock(text: string): string {
  if (!text) return "";
  const cached = blockCache.get(text);
  if (cached !== undefined) return cached;
  try {
    const raw = marked.parse(text);
    if (typeof raw !== "string") return "";
    let idx = 0;
    const withCheckboxes = raw.replace(
      /<input\s+(checked="")?\s*disabled=""\s+type="checkbox"/g,
      (_match, checked) => {
        const isChecked = Boolean(checked);
        const el = `<input type="checkbox"${isChecked ? ' checked=""' : ""} data-task-checkbox="${idx}" class="task-checkbox-input"`;
        idx++;
        return el;
      },
    );
    const sanitized = DOMPurify.sanitize(withCheckboxes, {
      ADD_TAGS: ["input"],
      ADD_ATTR: ["data-task-checkbox", "checked", "type", "class"],
    });
    if (blockCache.size > 300) blockCache.clear();
    blockCache.set(text, sanitized);
    return sanitized;
  } catch {
    return text;
  }
}

/**
 * Toggles a markdown task list checkbox by its exact index (- [ ] <-> - [x]).
 * Safely ignores fenced code blocks and supports -, *, +, and numbered lists.
 */
export function toggleCheckboxInMarkdown(
  markdown: string,
  checkboxIndex: number,
): string {
  let currentIdx = 0;
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  const updated = lines.map((line) => {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock) return line;

    return line.replace(
      /^(\s*[-*+]|\s*\d+\.)\s*\[([ xX])\]/,
      (match, prefix, check) => {
        if (currentIdx === checkboxIndex) {
          currentIdx++;
          return `${prefix} [${check.toLowerCase() === "x" ? " " : "x"}]`;
        }
        currentIdx++;
        return match;
      },
    );
  });

  return updated.join("\n");
}

/**
 * Extracts checklist statistics and the first pending actionable step from markdown.
 */
export function extractChecklistStats(text: string): {
  total: number;
  done: number;
  nextPendingItem?: string;
  firstLine?: string;
} {
  if (!text || !text.trim()) return { total: 0, done: 0 };
  const lines = text.split("\n");
  let total = 0;
  let done = 0;
  let nextPendingItem: string | undefined;
  let firstLine: string | undefined;
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    if (!firstLine && trimmed.length > 0) {
      firstLine = trimmed.replace(/^#+\s*/, "").replace(/^[-*+]\s*/, "");
    }

    const checkMatch = line.match(/^(\s*[-*+]|\s*\d+\.)\s*\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      total++;
      const isDone = checkMatch[2].toLowerCase() === "x";
      if (isDone) {
        done++;
      } else if (!nextPendingItem) {
        nextPendingItem = checkMatch[3].trim();
      }
    }
  }

  return { total, done, nextPendingItem, firstLine };
}

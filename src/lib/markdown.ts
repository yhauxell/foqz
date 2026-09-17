import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Render inline markdown (for task titles, badges, and one-line summaries).
 */
export function renderMarkdownInline(text: string): string {
  if (!text) return "";
  try {
    const raw = marked.parseInline(text);
    return typeof raw === "string" ? raw : "";
  } catch {
    return text;
  }
}

/**
 * Render block markdown (for task notes, descriptions, checklists, and code snippets).
 * Replaces disabled checkboxes with clickable checkboxes tracking data-task-checkbox index.
 */
export function renderMarkdownBlock(text: string): string {
  if (!text) return "";
  try {
    const raw = marked.parse(text);
    if (typeof raw !== "string") return "";
    let idx = 0;
    return raw.replace(/<input disabled="" type="checkbox"/g, () => {
      const el = `<input type="checkbox" data-task-checkbox="${idx}" class="task-checkbox-input"`;
      idx++;
      return el;
    });
  } catch {
    return text;
  }
}

/**
 * Toggles a markdown task list checkbox by its index (- [ ] <-> - [x]).
 */
export function toggleCheckboxInMarkdown(
  markdown: string,
  checkboxIndex: number,
): string {
  let currentIdx = 0;
  return markdown.replace(/(- \[(?: |x|X)\])/g, (match) => {
    if (currentIdx === checkboxIndex) {
      currentIdx++;
      return match.includes("x") || match.includes("X") ? "- [ ]" : "- [x]";
    }
    currentIdx++;
    return match;
  });
}

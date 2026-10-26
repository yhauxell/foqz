export interface HighlightColor {
  /** Written into the source as `=={key}text==`. */
  key: string;
  name: string;
  bg: string;
  text: string;
  darkBg: string;
  darkText: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { key: "yellow", name: "Yellow", bg: "#fef08a", text: "#713f12", darkBg: "#854d0e", darkText: "#fef08a" },
  { key: "green", name: "Green",  bg: "#bbf7d0", text: "#14532d", darkBg: "#166534", darkText: "#bbf7d0" },
  { key: "blue", name: "Blue",   bg: "#bfdbfe", text: "#1e3a8a", darkBg: "#1e40af", darkText: "#bfdbfe" },
  { key: "pink", name: "Pink",   bg: "#fbcfe8", text: "#831843", darkBg: "#9d174d", darkText: "#fbcfe8" },
  { key: "purple", name: "Purple", bg: "#e9d5ff", text: "#581c87", darkBg: "#6b21a8", darkText: "#e9d5ff" },
  { key: "orange", name: "Orange", bg: "#fed7aa", text: "#7c2d12", darkBg: "#9a3412", darkText: "#fed7aa" },
];

export type TextFormatType =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "link"
  | "highlight"
  | "clear";

const HIGHLIGHT_KEYS = HIGHLIGHT_COLORS.map((c) => c.key).join("|");
/** `==text==` (yellow) or `=={blue}text==`; one line at most, like the renderer. */
export const HIGHLIGHT_SOURCE_RE = new RegExp(`==(?:\\{(${HIGHLIGHT_KEYS})\\})?([^=\\n]+)==`, "g");
const WHOLE_HIGHLIGHT_RE = new RegExp(`^==(?:\\{(${HIGHLIGHT_KEYS})\\})?([^=\\n]+)==$`);
const WHOLE_LEGACY_MARK_RE = /^<mark[^>]*>([\s\S]*)<\/mark>$/;
// List bullets, checkboxes, headings and quotes stay outside the marker so the line still parses.
const LINE_PREFIX_RE = /^(\s*(?:>\s*)*(?:#{1,6}\s+|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?)([\s\S]*)$/;

function stripHighlights(str: string): string {
  return str.replace(HIGHLIGHT_SOURCE_RE, "$2").replace(/<\/?mark[^>]*>/g, "");
}

/**
 * Highlights `text` with `color`. A text that already is one highlight is recolored, or
 * unwrapped when the color is the same, so highlights never nest. Anything else loses its
 * inner highlights and gets one marker per line, because a highlight cannot span lines.
 * `atLineStart` says whether `text` begins a line, so its list or heading prefix is kept.
 */
export function toggleHighlight(text: string, color: HighlightColor, atLineStart = true): string {
  const whole = text.match(WHOLE_HIGHLIGHT_RE);
  if (whole) {
    const current = whole[1] ?? "yellow";
    return current === color.key ? whole[2] : `=={${color.key}}${whole[2]}==`;
  }
  const legacy = text.match(WHOLE_LEGACY_MARK_RE);
  if (legacy && !legacy[1].includes("\n")) return `=={${color.key}}${stripHighlights(legacy[1])}==`;

  return stripHighlights(text)
    .split("\n")
    .map((line, i) => {
      const [, prefix, body] = (i > 0 || atLineStart ? line.match(LINE_PREFIX_RE) : null) ?? [line, "", line];
      const trimmed = body.trimEnd();
      if (!trimmed.trim()) return line;
      return `${prefix}=={${color.key}}${trimmed}==${body.slice(trimmed.length)}`;
    })
    .join("\n");
}

/**
 * Strips all markdown and HTML tags from a text string.
 */
export function clearTextFormatting(str: string): string {
  if (!str) return "";
  return str
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(HIGHLIGHT_SOURCE_RE, "$2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

/**
 * Applies a format to an existing string (used when Text node is selected without active editing).
 */
export function applyFormattingToString(
  text: string,
  format: TextFormatType,
  options?: { url?: string; color?: HighlightColor }
): string {
  const current = text || "";

  switch (format) {
    case "bold": {
      if (current.startsWith("**") && current.endsWith("**") && current.length >= 4) {
        return current.slice(2, -2);
      }
      return `**${current || "Bold text"}**`;
    }
    case "italic": {
      if (current.startsWith("*") && current.endsWith("*") && current.length >= 2) {
        return current.slice(1, -1);
      }
      return `*${current || "Italic text"}*`;
    }
    case "underline": {
      if (current.startsWith("<u>") && current.endsWith("</u>") && current.length >= 7) {
        return current.slice(3, -4);
      }
      return `<u>${current || "Underlined text"}</u>`;
    }
    case "strike": {
      if (current.startsWith("~~") && current.endsWith("~~") && current.length >= 4) {
        return current.slice(2, -2);
      }
      return `~~${current || "Strikethrough text"}~~`;
    }
    case "link": {
      const url = options?.url || "https://";
      return `[${current || "Link"}](${url})`;
    }
    case "highlight": {
      const color = options?.color || HIGHLIGHT_COLORS[0];
      return toggleHighlight(current || "Highlighted text", color);
    }
    case "clear": {
      return clearTextFormatting(current);
    }
    default:
      return current;
  }
}

/**
 * Applies a format to the active selection or cursor inside an HTMLTextAreaElement.
 * Updates textarea value, dispatches 'input' event, and sets proper cursor selection.
 */
export function applyFormattingToTextarea(
  textarea: HTMLTextAreaElement,
  format: TextFormatType,
  options?: { url?: string; color?: HighlightColor }
): string {
  let start = textarea.selectionStart ?? 0;
  let end = textarea.selectionEnd ?? 0;
  const val = textarea.value;
  const hasSelection = start !== end;
  const selectedText = hasSelection ? val.slice(start, end) : "";

  let prefix = "";
  let suffix = "";
  let defaultPlaceholder = "";
  let replacement = "";
  let newSelectStart = start;
  let newSelectEnd = end;

  switch (format) {
    case "bold": {
      prefix = "**";
      suffix = "**";
      defaultPlaceholder = "bold text";
      if (hasSelection) {
        if (selectedText.startsWith("**") && selectedText.endsWith("**") && selectedText.length >= 4) {
          replacement = selectedText.slice(2, -2);
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        } else {
          replacement = `**${selectedText}**`;
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        }
      } else {
        replacement = `**${defaultPlaceholder}**`;
        newSelectStart = start + 2;
        newSelectEnd = start + 2 + defaultPlaceholder.length;
      }
      break;
    }

    case "italic": {
      prefix = "*";
      suffix = "*";
      defaultPlaceholder = "italic text";
      if (hasSelection) {
        if (selectedText.startsWith("*") && selectedText.endsWith("*") && selectedText.length >= 2) {
          replacement = selectedText.slice(1, -1);
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        } else {
          replacement = `*${selectedText}*`;
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        }
      } else {
        replacement = `*${defaultPlaceholder}*`;
        newSelectStart = start + 1;
        newSelectEnd = start + 1 + defaultPlaceholder.length;
      }
      break;
    }

    case "underline": {
      prefix = "<u>";
      suffix = "</u>";
      defaultPlaceholder = "underlined text";
      if (hasSelection) {
        if (selectedText.startsWith("<u>") && selectedText.endsWith("</u>") && selectedText.length >= 7) {
          replacement = selectedText.slice(3, -4);
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        } else {
          replacement = `<u>${selectedText}</u>`;
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        }
      } else {
        replacement = `<u>${defaultPlaceholder}</u>`;
        newSelectStart = start + 3;
        newSelectEnd = start + 3 + defaultPlaceholder.length;
      }
      break;
    }

    case "strike": {
      prefix = "~~";
      suffix = "~~";
      defaultPlaceholder = "strikethrough text";
      if (hasSelection) {
        if (selectedText.startsWith("~~") && selectedText.endsWith("~~") && selectedText.length >= 4) {
          replacement = selectedText.slice(2, -2);
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        } else {
          replacement = `~~${selectedText}~~`;
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        }
      } else {
        replacement = `~~${defaultPlaceholder}~~`;
        newSelectStart = start + 2;
        newSelectEnd = start + 2 + defaultPlaceholder.length;
      }
      break;
    }

    case "link": {
      const url = options?.url || "https://";
      if (hasSelection) {
        replacement = `[${selectedText}](${url})`;
        newSelectStart = start;
        newSelectEnd = start + replacement.length;
      } else {
        replacement = `[Link](${url})`;
        newSelectStart = start + 1;
        newSelectEnd = start + 5;
      }
      break;
    }

    case "highlight": {
      const color = options?.color || HIGHLIGHT_COLORS[0];
      defaultPlaceholder = "highlighted text";
      if (hasSelection) {
        // A selection of just the words inside an existing highlight takes its markers along.
        const before = val.slice(0, start).match(new RegExp(`==(?:\\{(?:${HIGHLIGHT_KEYS})\\})?$`));
        if (before && val.startsWith("==", end) && !selectedText.includes("==")) {
          start -= before[0].length;
          end += 2;
        }
        replacement = toggleHighlight(val.slice(start, end), color, start === 0 || val[start - 1] === "\n");
        newSelectStart = start;
        newSelectEnd = start + replacement.length;
      } else {
        const open = `=={${color.key}}`;
        replacement = `${open}${defaultPlaceholder}==`;
        newSelectStart = start + open.length;
        newSelectEnd = newSelectStart + defaultPlaceholder.length;
      }
      break;
    }

    case "clear": {
      if (hasSelection) {
        replacement = clearTextFormatting(selectedText);
        newSelectStart = start;
        newSelectEnd = start + replacement.length;
      } else {
        replacement = clearTextFormatting(val);
        textarea.value = replacement;
        textarea.setSelectionRange(0, replacement.length);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return replacement;
      }
      break;
    }

    default:
      return val;
  }

  const updatedVal = val.slice(0, start) + replacement + val.slice(end);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(textarea, updatedVal);
  } else {
    textarea.value = updatedVal;
  }
  textarea.focus();
  textarea.setSelectionRange(newSelectStart, newSelectEnd);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));

  return updatedVal;
}

export interface HighlightColor {
  name: string;
  bg: string;
  text: string;
  darkBg: string;
  darkText: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: "Yellow", bg: "#fef08a", text: "#713f12", darkBg: "#854d0e", darkText: "#fef08a" },
  { name: "Green",  bg: "#bbf7d0", text: "#14532d", darkBg: "#166534", darkText: "#bbf7d0" },
  { name: "Blue",   bg: "#bfdbfe", text: "#1e3a8a", darkBg: "#1e40af", darkText: "#bfdbfe" },
  { name: "Pink",   bg: "#fbcfe8", text: "#831843", darkBg: "#9d174d", darkText: "#fbcfe8" },
  { name: "Purple", bg: "#e9d5ff", text: "#581c87", darkBg: "#6b21a8", darkText: "#e9d5ff" },
  { name: "Orange", bg: "#fed7aa", text: "#7c2d12", darkBg: "#9a3412", darkText: "#fed7aa" },
];

export type TextFormatType =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "link"
  | "highlight"
  | "clear";

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
    .replace(/==([^=]+)==/g, "$1")
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
      const markRegex = /^<mark[^>]*>(.*)<\/mark>$/s;
      const match = current.match(markRegex);
      if (match) {
        return match[1];
      }
      if (current.startsWith("==") && current.endsWith("==") && current.length >= 4) {
        return current.slice(2, -2);
      }
      return `<mark style="background-color: ${color.bg}; color: ${color.text};">${current || "Highlighted text"}</mark>`;
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
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
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
      const tagOpen = `<mark style="background-color: ${color.bg}; color: ${color.text};">`;
      const tagClose = `</mark>`;
      defaultPlaceholder = "highlighted text";
      if (hasSelection) {
        const markRegex = /^<mark[^>]*>(.*)<\/mark>$/s;
        const match = selectedText.match(markRegex);
        if (match) {
          replacement = match[1];
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        } else if (selectedText.startsWith("==") && selectedText.endsWith("==") && selectedText.length >= 4) {
          replacement = selectedText.slice(2, -2);
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        } else {
          replacement = `${tagOpen}${selectedText}${tagClose}`;
          newSelectStart = start;
          newSelectEnd = start + replacement.length;
        }
      } else {
        replacement = `${tagOpen}${defaultPlaceholder}${tagClose}`;
        newSelectStart = start + tagOpen.length;
        newSelectEnd = start + tagOpen.length + defaultPlaceholder.length;
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

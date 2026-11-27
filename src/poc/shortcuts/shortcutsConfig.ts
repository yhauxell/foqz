export interface ShortcutCommand {
  id: string;
  name: string;
  keyDisplay: string;
  category: "Tools" | "Text" | "Canvas" | "App";
  description: string;
}

/**
 * Cheat sheet shown in the command bar's shortcuts view.
 * Bindings live in `useFlowCanvasShortcuts.ts` (canvas) and `FocusCanvasApp.tsx` (app).
 */
export const CANVAS_SHORTCUTS: ShortcutCommand[] = [
  // Tools
  { id: "tool-select", name: "Select", keyDisplay: "V", category: "Tools", description: "Select and move" },
  { id: "tool-text", name: "Text", keyDisplay: "T", category: "Tools", description: "Click anywhere to write" },
  { id: "tool-note", name: "Sticky text", keyDisplay: "N", category: "Tools", description: "Text in sticky style" },
  { id: "tool-box", name: "Rectangle", keyDisplay: "R", category: "Tools", description: "Drag to draw a rectangle" },
  { id: "tool-circle", name: "Circle", keyDisplay: "O", category: "Tools", description: "Drag to draw a circle" },
  { id: "tool-arrow", name: "Arrow", keyDisplay: "A", category: "Tools", description: "Drag to draw an arrow" },
  { id: "tool-connection", name: "Connect", keyDisplay: "L", category: "Tools", description: "Drag between handles: a plain line; click its dot for depends on / relates to" },
  { id: "tool-pencil", name: "Pencil", keyDisplay: "P", category: "Tools", description: "Freehand drawing" },
  { id: "tool-comment", name: "Annotate", keyDisplay: "C", category: "Tools", description: "Pin a comment, question or decision" },

  // Text behaviors
  { id: "text-new", name: "New text at cursor", keyDisplay: "⌘N", category: "Text", description: "Start writing where the pointer is" },
  { id: "text-actionable", name: "Make it a to-do", keyDisplay: "⌘↵", category: "Text", description: "Toggle the checkbox on selected text" },
  { id: "text-style-plain", name: "To plain text", keyDisplay: "⌥1", category: "Text", description: "Convert the selection; while typing, pull the selected words into a new text" },
  { id: "text-style-sticky", name: "To sticky note", keyDisplay: "⌥2", category: "Text", description: "Convert the selection; while typing, pull the selected words into a new sticky" },
  { id: "text-style-card", name: "To task card", keyDisplay: "⌥3", category: "Text", description: "Convert the selection; while typing, pull the selected words into a new task" },
  { id: "text-format", name: "Bold / Italic / Underline", keyDisplay: "⌘B / ⌘I / ⌘U", category: "Text", description: "While typing: the selected words. Text selected: the whole text" },
  { id: "text-strike", name: "Strikethrough / Link", keyDisplay: "⌘⇧X / ⌘K", category: "Text", description: "⌘K adds a link while typing" },
  { id: "text-focus", name: "Focus here", keyDisplay: "F", category: "Text", description: "Zoom in, dim the rest, start the timer" },
  { id: "text-exit-focus", name: "Leave focus", keyDisplay: "Esc", category: "Text", description: "Back to the whole board" },

  // Mind maps
  { id: "map-new", name: "Mind map", keyDisplay: "M", category: "Text", description: "Selected text becomes the central topic (an indented list becomes a whole map); nothing selected starts a new one" },
  { id: "map-child", name: "Add branch / sibling", keyDisplay: "Tab / ↵", category: "Text", description: "While typing in a map: Tab adds a child, Enter a sibling, ⇧Tab moves up a level" },
  { id: "map-nav", name: "Move around a map", keyDisplay: "← → ↑ ↓", category: "Text", description: "Parent, children and siblings; drop a node on another to move its branch" },
  { id: "map-fold", name: "Fold branch", keyDisplay: "/", category: "Text", description: "Hide or show everything under the selected node" },

  { id: "derive-task", name: "Make task from this", keyDisplay: "⇧T", category: "Text", description: "A linked task card beside the diagram; the element keeps its look and shows done/total" },

  { id: "icon", name: "Icon", keyDisplay: "I", category: "Text", description: "Add an icon to the selected text or shape; nothing selected drops a standalone icon" },

  // Canvas
  { id: "canvas-region", name: "New region", keyDisplay: "⌘⇧P", category: "Canvas", description: "An area that holds whatever you drop in it" },
  { id: "canvas-group", name: "Group into region", keyDisplay: "⌘G", category: "Canvas", description: "Wrap the selection in a region" },
  { id: "canvas-ungroup", name: "Dissolve region", keyDisplay: "⌘⇧G", category: "Canvas", description: "Remove the region, keep its contents" },
  { id: "canvas-center", name: "Center on selection", keyDisplay: "⇧C", category: "Canvas", description: "Center and bring to front" },
  { id: "canvas-fit", name: "Fit board", keyDisplay: "0", category: "Canvas", description: "Show everything" },
  { id: "canvas-duplicate", name: "Duplicate", keyDisplay: "⌘D", category: "Canvas", description: "Copy the selection" },
  { id: "canvas-delete", name: "Delete", keyDisplay: "⌫", category: "Canvas", description: "Deleting a region keeps its contents" },
  { id: "canvas-undo", name: "Undo / Redo", keyDisplay: "⌘Z / ⌘⇧Z", category: "Canvas", description: "Step through history" },
  { id: "canvas-pan", name: "Pan / Zoom", keyDisplay: "Scroll / ⌘ Scroll", category: "Canvas", description: "Two-finger pan, pinch or ⌘ scroll to zoom" },

  // App
  { id: "app-command", name: "Command bar", keyDisplay: "⌘K", category: "App", description: "Find anything, run any action, or type to capture" },
  { id: "app-capture", name: "Capture", keyDisplay: "⌘⇧N", category: "App", description: "Type, press Enter, it lands where you were" },
  { id: "app-ai", name: "Ask AI", keyDisplay: "⌘J", category: "App", description: "Chat about the selection or the whole board" },
  { id: "app-shortcuts", name: "Shortcuts", keyDisplay: "?", category: "App", description: "This list" },
  { id: "app-maximize", name: "Maximize window", keyDisplay: "⌘⌃F", category: "App", description: "Fill the screen" },
];

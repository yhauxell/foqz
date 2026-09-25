export interface ShortcutCommand {
  id: string;
  name: string;
  keys: string[];
  keyDisplay: string;
  category: "Tools" | "Create" | "Canvas & Navigation" | "Interactions";
  description: string;
}

export const CANVAS_SHORTCUTS: ShortcutCommand[] = [
  // Tools
  {
    id: "tool-select",
    name: "Select / Pan Tool",
    keys: ["v", "1"],
    keyDisplay: "V",
    category: "Tools",
    description: "Switch to select and canvas panning mode",
  },
  {
    id: "tool-box",
    name: "Hand-Drawn Sketch Box",
    keys: ["b", "2"],
    keyDisplay: "B",
    category: "Tools",
    description: "Create a rough sketch box container",
  },
  {
    id: "tool-text",
    name: "Text Note",
    keys: ["t", "3"],
    keyDisplay: "T",
    category: "Tools",
    description: "Add a freeform text note at viewport center",
  },
  {
    id: "tool-pencil",
    name: "Freehand Pencil",
    keys: ["p", "4"],
    keyDisplay: "P",
    category: "Tools",
    description: "Draw calligraphic freehand pencil strokes",
  },

  // Create
  {
    id: "create-task",
    name: "New Task Card",
    keys: ["n"],
    keyDisplay: "N",
    category: "Create",
    description: "Spawn a new resizable sketchy task card",
  },
  {
    id: "create-project",
    name: "New Project Frame",
    keys: ["f", "shift+p"],
    keyDisplay: "F",
    category: "Create",
    description: "Create a new glassmorphic project workspace container",
  },

  // Canvas & Navigation
  {
    id: "canvas-fit-view",
    name: "Fit View to Canvas",
    keys: ["0"],
    keyDisplay: "0",
    category: "Canvas & Navigation",
    description: "Zoom to fit all nodes on screen",
  },
  {
    id: "canvas-delete",
    name: "Delete Selected",
    keys: ["delete", "backspace"],
    keyDisplay: "Del / ⌫",
    category: "Canvas & Navigation",
    description: "Delete currently selected shapes and their edges",
  },
  {
    id: "canvas-escape",
    name: "Deselect / Cancel",
    keys: ["escape"],
    keyDisplay: "Esc",
    category: "Canvas & Navigation",
    description: "Clear selection and return to Select tool",
  },
  {
    id: "canvas-help",
    name: "Shortcuts Cheat Sheet",
    keys: ["?", "shift+?"],
    keyDisplay: "?",
    category: "Canvas & Navigation",
    description: "Open the keyboard shortcuts guide",
  },

  // Interactions
  {
    id: "interaction-double-click-canvas",
    name: "Double-Click Canvas",
    keys: [],
    keyDisplay: "Double Click",
    category: "Interactions",
    description: "Quickly create a text note anywhere on empty canvas",
  },
  {
    id: "interaction-double-click-node",
    name: "Double-Click Node",
    keys: [],
    keyDisplay: "Double Click",
    category: "Interactions",
    description: "Inline edit task title, box text, or project name",
  },
  {
    id: "interaction-drag-to-group",
    name: "Drag into Project Frame",
    keys: [],
    keyDisplay: "Drag & Drop",
    category: "Interactions",
    description: "Automatically groups node as child of Project Frame",
  },
  {
    id: "interaction-connect-handles",
    name: "Connect Any Handle",
    keys: [],
    keyDisplay: "Drag Handle",
    category: "Interactions",
    description: "Universal loose connection with directional arrows",
  },
];
